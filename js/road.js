// Procedurální silnice: segmentová gramatika -> vzorky centerline -> recyklované chunky
import * as THREE from 'three';
import { CONFIG, clamp, makeRng, wrapAngle } from './config.js';

const RC = CONFIG.road;
const STEP = RC.sampleStep;
const HALF = RC.width / 2;

export class Road {
    /**
     * @param scene THREE.Scene
     * @param hooks { onChunkProps(chunk), onChunkRelease(chunkId), onCampZone(zone) }
     */
    constructor(scene, hooks) {
        this.scene = scene;
        this.hooks = hooks || {};
        this.asphalt = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
        this.lineMat = new THREE.MeshBasicMaterial({ color: 0xf5f2e8 });
        this.zoneMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85 });
        this.reset(1234567);
    }

    reset(seed) {
        // úklid staré geometrie
        if (this.chunks) for (const c of this.chunks) this._disposeChunk(c);
        this.rng = makeRng(seed);
        this.samples = [];        // {x,z,a,k,s} — a=heading, k=křivost
        this.baseS = 0;           // s prvního vzorku v poli
        this.segments = [];       // {type,s0,s1,k}
        this.chunks = [];         // {id, s0, s1, meshes[], i0}
        this.chunkId = 0;
        this.campZones = [];      // {s0,s1,sc,state:'pending'|'done'|'missed', meshes[]}
        this.nextCampS = CONFIG.camp.firstAt;
        this._genX = 0; this._genZ = 0; this._genA = 0; this._genS = 0;
        this._lastDir = 1;
        this._pendCamp = false;
        this._projIdx = 0;
        // první vzorek
        this._pushSample(0);
        this.ensure(0);
    }

    // ---------- gramatika ----------
    _tier(s) {
        if (s < 800) return 0;
        if (s < 2000) return 1;
        if (s < 4000) return 2;
        return 3;
    }

    _nextSegment() {
        const s = this._genS;
        // vynucená kempová rovinka?
        if (this._pendCamp) {
            this._pendCamp = false;
            const len = CONFIG.camp.straightLen;
            const seg = { type: 'CAMP', k: 0, len };
            this._scheduleCampZone(s);
            return seg;
        }
        if (s >= this.nextCampS) {
            this._pendCamp = true; // po této zatáčce přijde kemp
            this.nextCampS = s + CONFIG.camp.spacing + (this.rng() - 0.5) * 2 * CONFIG.camp.spacingJitter;
            const dir = -this._lastDir; this._lastDir = dir;
            return { type: 'CORNER', k: dir * (1 / 45), len: 70, ramp: true };
        }
        const t = this._tier(s);
        const maxK = [1 / 60, 1 / 38, 1 / 26, 1 / 18][t];
        const straightShare = [0.45, 0.3, 0.2, 0.15][t];
        const r = this.rng();
        if (r < straightShare) {
            return { type: 'STRAIGHT', k: 0, len: 40 + this.rng() * 80 };
        }
        // směr: 60/40 alternace => serpentiny
        const dir = this.rng() < 0.6 ? -this._lastDir : this._lastDir;
        this._lastDir = dir;
        if (t >= 3 && this.rng() < 0.15) {
            return { type: 'HAIRPIN', k: dir * maxK, len: 45 + this.rng() * 25, ramp: true };
        }
        const k = dir * (0.35 + this.rng() * 0.65) * maxK;
        return { type: 'CORNER', k, len: 50 + this.rng() * 90, ramp: true };
    }

    _scheduleCampZone(campSegStart) {
        const s0 = campSegStart + CONFIG.camp.zoneOffset;
        const zone = {
            s0, s1: s0 + CONFIG.camp.zoneLen,
            sc: s0 + CONFIG.camp.zoneLen / 2,
            state: 'pending', entered: false, enterT: 0, meshes: [],
        };
        this.campZones.push(zone);
    }

    _pushSample(k) {
        this.samples.push({ x: this._genX, z: this._genZ, a: this._genA, k, s: this._genS });
    }

    // generuj vzorky, dokud nepokryjeme s
    _genUpTo(sTarget) {
        while (this._genS < sTarget) {
            const seg = this._nextSegment();
            const n = Math.max(2, Math.round(seg.len / STEP));
            const segRec = { type: seg.type, s0: this._genS, s1: this._genS + n * STEP, k: seg.k };
            this.segments.push(segRec);
            for (let i = 0; i < n; i++) {
                const f = i / n;
                let k = seg.k;
                if (seg.ramp) { // clothoid náběh/výběh 20 %
                    const e = 0.2;
                    if (f < e) k *= f / e;
                    else if (f > 1 - e) k *= (1 - f) / e;
                }
                this._genA += k * STEP;
                this._genX += Math.sin(this._genA) * STEP;
                this._genZ += Math.cos(this._genA) * STEP;
                this._genS += STEP;
                this._pushSample(k);
            }
        }
    }

    // ---------- chunky ----------
    ensure(vanS) {
        const needTo = vanS + RC.chunksAhead * RC.chunkSamples * STEP + 60;
        this._genUpTo(needTo + 40);
        // stavět nové chunky vpředu
        while (this._builtS() < needTo) this._buildChunk();
        // recyklovat vzadu
        const behind = RC.chunksBehind * RC.chunkSamples * STEP;
        while (this.chunks.length && this.chunks[0].s1 < vanS - behind) {
            const c = this.chunks.shift();
            this._disposeChunk(c);
            if (this.hooks.onChunkRelease) this.hooks.onChunkRelease(c.id);
        }
        this._trimSamples(vanS - behind - 80);
        this._trimZones(vanS - 120);
        this._trimSegments(vanS - 200);
    }

    _builtS() { return this.chunks.length ? this.chunks[this.chunks.length - 1].s1 : this.baseS; }

    _idxOfS(s) { return clamp(Math.round((s - this.baseS) / STEP), 0, this.samples.length - 1); }

    sampleAt(s) { return this.samples[this._idxOfS(s)]; }
    kappaAt(s) { const sm = this.sampleAt(s); return sm ? sm.k : 0; }
    headingAt(s) { const sm = this.sampleAt(s); return sm ? sm.a : 0; }
    pointAt(s, lat = 0) {
        const sm = this.sampleAt(s);
        if (!sm) return new THREE.Vector3();
        return new THREE.Vector3(sm.x + Math.cos(sm.a) * lat, 0, sm.z - Math.sin(sm.a) * lat);
    }

    _buildChunk() {
        const s0 = this._builtS();
        const i0 = this._idxOfS(s0);
        const n = RC.chunkSamples;
        const i1 = Math.min(i0 + n, this.samples.length - 1);
        const chunk = { id: this.chunkId++, s0, s1: this.samples[i1].s, meshes: [], i0S: s0 };

        chunk.meshes.push(this._stripMesh(i0, i1, -HALF, HALF, this.asphalt, 0.02, true));
        chunk.meshes.push(this._stripMesh(i0, i1, HALF - RC.edgeLine, HALF, this.lineMat, 0.035, false));
        chunk.meshes.push(this._stripMesh(i0, i1, -HALF, -HALF + RC.edgeLine, this.lineMat, 0.035, false));
        for (const m of chunk.meshes) this.scene.add(m);

        // vizuál kemp zón ležících v tomto chunku
        for (const z of this.campZones) {
            if (z.meshes.length === 0 && z.s0 >= chunk.s0 && z.s0 < chunk.s1) {
                this._buildZoneVisual(z);
                if (this.hooks.onCampZone) this.hooks.onCampZone(z, chunk, this);
            }
        }
        this.chunks.push(chunk);
        if (this.hooks.onChunkProps) this.hooks.onChunkProps(chunk, this);
    }

    _stripMesh(i0, i1, latA, latB, mat, y, vary) {
        const count = i1 - i0 + 1;
        const pos = new Float32Array(count * 2 * 3);
        const col = vary ? new Float32Array(count * 2 * 3) : null;
        const idx = [];
        const cBase = new THREE.Color(0x4b4b54);
        for (let i = 0; i < count; i++) {
            const sm = this.samples[i0 + i];
            const lx = Math.cos(sm.a), lz = -Math.sin(sm.a);
            const o = i * 6;
            pos[o] = sm.x + lx * latA; pos[o + 1] = y; pos[o + 2] = sm.z + lz * latA;
            pos[o + 3] = sm.x + lx * latB; pos[o + 4] = y; pos[o + 5] = sm.z + lz * latB;
            if (col) {
                const v = 0.92 + 0.16 * Math.sin(sm.s * 0.63 + Math.sin(sm.s * 0.171) * 2.0);
                for (let j = 0; j < 2; j++) {
                    col[o + j * 3] = cBase.r * v; col[o + j * 3 + 1] = cBase.g * v; col[o + j * 3 + 2] = cBase.b * v;
                }
            }
            if (i < count - 1) {
                const a = i * 2;
                idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, mat);
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        return m;
    }

    _buildZoneVisual(zone) {
        // malovaný obdélník na silnici
        const i0 = this._idxOfS(zone.s0), i1 = this._idxOfS(zone.s1);
        const paint = this._stripMesh(i0, i1, -HALF + 0.5, HALF - 0.5, this.zoneMat, 0.045, false);
        this.scene.add(paint);
        zone.meshes.push(paint);
        // středová čára zóny
        const ic = this._idxOfS(zone.sc);
        const mid = this._stripMesh(Math.max(i0, ic - 1), Math.min(i1, ic + 1), -HALF + 0.5, HALF - 0.5,
            new THREE.MeshBasicMaterial({ color: 0xff5d3a }), 0.055, false);
        this.scene.add(mid);
        zone.meshes.push(mid);
    }

    disposeZoneVisual(zone) {
        for (const m of zone.meshes) { this.scene.remove(m); m.geometry.dispose(); }
        zone.meshes.length = 0;
    }

    _disposeChunk(c) {
        for (const m of c.meshes) { this.scene.remove(m); m.geometry.dispose(); }
    }

    _trimSamples(sMin) {
        let cut = 0;
        while (cut < this.samples.length - 4 && this.samples[cut].s < sMin) cut++;
        if (cut > 0) {
            this.samples.splice(0, cut);
            this.baseS = this.samples[0].s;
            this._projIdx = Math.max(0, this._projIdx - cut);
        }
    }
    _trimZones(sMin) {
        while (this.campZones.length && this.campZones[0].s1 < sMin) {
            this.disposeZoneVisual(this.campZones[0]);
            this.campZones.shift();
        }
    }
    _trimSegments(sMin) {
        while (this.segments.length > 1 && this.segments[0].s1 < sMin) this.segments.shift();
    }

    // ---------- dotazy ----------
    /** promítne světovou pozici na silnici -> {s, lat, heading, kappa} */
    project(px, pz) {
        let best = Infinity, bi = this._projIdx;
        const from = Math.max(0, this._projIdx - 6);
        const to = Math.min(this.samples.length - 1, this._projIdx + 45);
        for (let i = from; i <= to; i++) {
            const sm = this.samples[i];
            const dx = px - sm.x, dz = pz - sm.z;
            const d = dx * dx + dz * dz;
            if (d < best) { best = d; bi = i; }
        }
        this._projIdx = bi;
        const sm = this.samples[bi];
        const dx = px - sm.x, dz = pz - sm.z;
        const lat = dx * Math.cos(sm.a) - dz * Math.sin(sm.a);
        const along = dx * Math.sin(sm.a) + dz * Math.cos(sm.a);
        return { s: sm.s + along, lat, heading: sm.a, kappa: sm.k };
    }

    segmentAt(s) {
        for (let i = this.segments.length - 1; i >= 0; i--) {
            if (s >= this.segments[i].s0 && s < this.segments[i].s1) return this.segments[i];
        }
        return null;
    }

    nextZone(s) {
        for (const z of this.campZones) if (z.state === 'pending' && z.s1 + 15 > s) return z;
        return null;
    }
}
