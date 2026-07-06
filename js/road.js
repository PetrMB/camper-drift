// Pobřežní silnice na útesu: segmentová gramatika s výškovým profilem,
// tunely, policejní kontroly, recyklované chunky (silnice + útes + pevnina)
import * as THREE from 'three';
import { CONFIG, clamp, lerp, makeRng } from './config.js';

const RC = CONFIG.road;
const EL = CONFIG.elevation;
const CP = CONFIG.checkpoint;
const TU = CONFIG.tunnel;
const STEP = RC.sampleStep;
const HALF = RC.width / 2;

export class Road {
    /**
     * hooks: { onChunkProps(chunk, road), onChunkRelease(chunkId), onCheckpoint(cp, chunk, road) }
     */
    constructor(scene, hooks) {
        this.scene = scene;
        this.hooks = hooks || {};
        this.asphalt = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
        this.lineMat = new THREE.MeshBasicMaterial({ color: 0xf5f2e8 });
        this.landMat = new THREE.MeshStandardMaterial({ color: 0x9dbb6a, roughness: 1 });
        this.cliffMat = new THREE.MeshStandardMaterial({ color: 0xb09a80, roughness: 1, flatShading: true });
        this.foamMat = new THREE.MeshBasicMaterial({ color: 0xf0f8f5, transparent: true, opacity: 0.85 });
        this.reset(1234567);
    }

    reset(seed) {
        if (this.chunks) for (const c of this.chunks) this._disposeChunk(c);
        this.rng = makeRng(seed);
        this.samples = [];        // {x,y,z,a,k,s,slope}
        this.baseS = 0;
        this.segments = [];       // {type,s0,s1,k}
        this.chunks = [];
        this.chunkId = 0;
        this.checkpoints = [];    // {s, gapLat, state, dirty, built}
        this.nextCpS = CP.firstAt;
        this._genX = 0; this._genZ = 0; this._genA = 0; this._genS = 0;
        this._genY = 10; this._lastDir = 1;
        this._pendCp = false;
        this._projIdx = 0;
        this._pushSample(0, 0);
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
        if (this._pendCp) {
            this._pendCp = false;
            this.checkpoints.push({
                s: s + CP.offset, gapLat: CP.gapLats[Math.floor(this.rng() * CP.gapLats.length)],
                state: 'pending', dirty: false, built: false, announced: false,
            });
            return { type: 'CHECKPOINT', k: 0, len: CP.straightLen, dY: 0 };
        }
        if (s >= this.nextCpS) {
            this._pendCp = true;
            this.nextCpS = s + CP.spacing + (this.rng() - 0.5) * 2 * CP.spacingJitter;
            const dir = -this._lastDir; this._lastDir = dir;
            return { type: 'CORNER', k: dir * (1 / 45), len: 70, ramp: true, dY: this._pickDY(70) };
        }
        const t = this._tier(s);
        // tunel skrz ostroh
        if (t >= 1 && this.rng() < TU.chance * 0.35) {
            const len = TU.lenMin + this.rng() * (TU.lenMax - TU.lenMin);
            return { type: 'TUNNEL', k: (this.rng() - 0.5) * 0.006, len, dY: 0 };
        }
        const maxK = [1 / 60, 1 / 38, 1 / 26, 1 / 18][t];
        const straightShare = [0.45, 0.3, 0.2, 0.15][t];
        const r = this.rng();
        if (r < straightShare) {
            const len = 40 + this.rng() * 80;
            return { type: 'STRAIGHT', k: 0, len, dY: this._pickDY(len) };
        }
        const dir = this.rng() < 0.6 ? -this._lastDir : this._lastDir;
        this._lastDir = dir;
        if (t >= 3 && this.rng() < 0.15) {
            const len = 45 + this.rng() * 25;
            return { type: 'HAIRPIN', k: dir * maxK, len, ramp: true, dY: this._pickDY(len) * 0.5 };
        }
        const k = dir * (0.35 + this.rng() * 0.65) * maxK;
        const len = 50 + this.rng() * 90;
        return { type: 'CORNER', k, len, ramp: true, dY: this._pickDY(len) };
    }

    _pickDY(len) {
        // náhodné převýšení v mezích sklonu a výškového pásma
        const maxD = EL.maxGrade * len;
        let dY = (this.rng() - 0.5) * 2 * maxD;
        dY = clamp(dY, EL.min - this._genY, EL.max - this._genY);
        return dY;
    }

    _pushSample(k, slope) {
        this.samples.push({ x: this._genX, y: this._genY, z: this._genZ, a: this._genA, k, s: this._genS, slope });
    }

    _genUpTo(sTarget) {
        while (this._genS < sTarget) {
            const seg = this._nextSegment();
            const n = Math.max(2, Math.round(seg.len / STEP));
            this.segments.push({ type: seg.type, s0: this._genS, s1: this._genS + n * STEP, k: seg.k });
            const y0 = this._genY, dY = seg.dY || 0;
            for (let i = 0; i < n; i++) {
                const f = i / n, f1 = (i + 1) / n;
                let k = seg.k;
                if (seg.ramp) {
                    const e = 0.2;
                    if (f < e) k *= f / e;
                    else if (f > 1 - e) k *= (1 - f) / e;
                }
                this._genA += k * STEP;
                this._genX += Math.sin(this._genA) * STEP;
                this._genZ += Math.cos(this._genA) * STEP;
                this._genS += STEP;
                // kosinový výškový profil segmentu
                const yNew = y0 + dY * (1 - Math.cos(Math.PI * f1)) / 2;
                const slope = (yNew - this._genY) / STEP;
                this._genY = yNew;
                this._pushSample(k, slope);
            }
        }
    }

    // ---------- chunky ----------
    ensure(vanS) {
        const needTo = vanS + RC.chunksAhead * RC.chunkSamples * STEP + 60;
        this._genUpTo(needTo + 40);
        while (this._builtS() < needTo) this._buildChunk();
        const behind = RC.chunksBehind * RC.chunkSamples * STEP;
        while (this.chunks.length && this.chunks[0].s1 < vanS - behind) {
            const c = this.chunks.shift();
            this._disposeChunk(c);
            if (this.hooks.onChunkRelease) this.hooks.onChunkRelease(c.id);
        }
        this._trimSamples(vanS - behind - 80);
        while (this.checkpoints.length && this.checkpoints[0].s < vanS - 120) this.checkpoints.shift();
        while (this.segments.length > 1 && this.segments[0].s1 < vanS - 200) this.segments.shift();
    }

    _builtS() { return this.chunks.length ? this.chunks[this.chunks.length - 1].s1 : this.baseS; }
    _idxOfS(s) { return clamp(Math.round((s - this.baseS) / STEP), 0, this.samples.length - 1); }

    sampleAt(s) { return this.samples[this._idxOfS(s)]; }
    /** lineárně interpolované veličiny mezi 2m vzorky — bez schodů (plynulá jízda) */
    lerpAt(s) {
        const n = this.samples.length - 1;
        const f = clamp((s - this.baseS) / STEP, 0, n);
        const i = Math.floor(f), t = f - i;
        const A = this.samples[i], B = this.samples[Math.min(i + 1, n)];
        return {
            y: lerp(A.y, B.y, t), slope: lerp(A.slope, B.slope, t),
            k: lerp(A.k, B.k, t), a: lerp(A.a, B.a, t),
        };
    }
    kappaAt(s) { return this.samples.length ? this.lerpAt(s).k : 0; }
    headingAt(s) { return this.samples.length ? this.lerpAt(s).a : 0; }
    yAt(s) { return this.samples.length ? this.lerpAt(s).y : 10; }
    slopeAt(s) { return this.samples.length ? this.lerpAt(s).slope : 0; }
    /** lat > 0 = vlevo (pevnina), lat < 0 = vpravo (moře) */
    pointAt(s, lat = 0, yOff = 0) {
        const sm = this.sampleAt(s);
        if (!sm) return new THREE.Vector3();
        return new THREE.Vector3(sm.x + Math.cos(sm.a) * lat, sm.y + yOff, sm.z - Math.sin(sm.a) * lat);
    }

    _buildChunk() {
        const s0 = this._builtS();
        const i0 = this._idxOfS(s0);
        const n = RC.chunkSamples;
        const i1 = Math.min(i0 + n, this.samples.length - 1);
        const chunk = { id: this.chunkId++, s0, s1: this.samples[i1].s, meshes: [] };

        const road = (sm, lat, yo) => [sm.x + Math.cos(sm.a) * lat, sm.y + yo, sm.z - Math.sin(sm.a) * lat];
        // asfalt + krajnice
        chunk.meshes.push(this._strip(i0, i1, sm => road(sm, -HALF, 0.02), sm => road(sm, HALF, 0.02), this.asphalt, true));
        chunk.meshes.push(this._strip(i0, i1, sm => road(sm, HALF - RC.edgeLine, 0.035), sm => road(sm, HALF, 0.035), this.lineMat));
        chunk.meshes.push(this._strip(i0, i1, sm => road(sm, -HALF, 0.035), sm => road(sm, -HALF + RC.edgeLine, 0.035), this.lineMat));
        // pevnina vlevo (mírně stoupá do vnitrozemí)
        chunk.meshes.push(this._strip(i0, i1, sm => road(sm, HALF, -0.02), sm => [sm.x + Math.cos(sm.a) * 60, sm.y + 3.5, sm.z - Math.sin(sm.a) * 60], this.landMat));
        // stěna útesu vpravo dolů k vodě (pořadí hran tak, aby normály mířily k moři)
        chunk.meshes.push(this._strip(i0, i1,
            sm => { const l = -(HALF + 3.5 + sm.y * 0.3); return [sm.x + Math.cos(sm.a) * l, 0.15, sm.z - Math.sin(sm.a) * l]; },
            sm => road(sm, -HALF, -0.02),
            this.cliffMat));
        // pěna u paty útesu
        chunk.meshes.push(this._strip(i0, i1,
            sm => { const l = -(HALF + 5.8 + sm.y * 0.3); return [sm.x + Math.cos(sm.a) * l, 0.07, sm.z - Math.sin(sm.a) * l]; },
            sm => { const l = -(HALF + 3.3 + sm.y * 0.3); return [sm.x + Math.cos(sm.a) * l, 0.09, sm.z - Math.sin(sm.a) * l]; },
            this.foamMat));
        for (const m of chunk.meshes) this.scene.add(m);

        for (const cp of this.checkpoints) {
            if (!cp.built && cp.s >= chunk.s0 && cp.s < chunk.s1) {
                cp.built = true;
                if (this.hooks.onCheckpoint) this.hooks.onCheckpoint(cp, chunk, this);
            }
        }
        this.chunks.push(chunk);
        if (this.hooks.onChunkProps) this.hooks.onChunkProps(chunk, this);
    }

    /** pás mezi dvěma hranami; fnA/fnB(sample) -> [x,y,z] */
    _strip(i0, i1, fnA, fnB, mat, vary) {
        const count = i1 - i0 + 1;
        const pos = new Float32Array(count * 2 * 3);
        const col = vary ? new Float32Array(count * 2 * 3) : null;
        const idx = [];
        const cBase = new THREE.Color(0x4b4b54);
        for (let i = 0; i < count; i++) {
            const sm = this.samples[i0 + i];
            const A = fnA(sm), B = fnB(sm);
            const o = i * 6;
            pos[o] = A[0]; pos[o + 1] = A[1]; pos[o + 2] = A[2];
            pos[o + 3] = B[0]; pos[o + 4] = B[1]; pos[o + 5] = B[2];
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

    // ---------- dotazy ----------
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
        const s = sm.s + along;
        const L = this.lerpAt(s);
        return { s, lat, heading: L.a, kappa: L.k, y: L.y, slope: L.slope };
    }

    segmentAt(s) {
        for (let i = this.segments.length - 1; i >= 0; i--) {
            if (s >= this.segments[i].s0 && s < this.segments[i].s1) return this.segments[i];
        }
        return null;
    }

    /** tunelové úseky protínající rozsah [a,b] */
    tunnelsIn(a, b) {
        return this.segments.filter(sg => sg.type === 'TUNNEL' && sg.s1 > a && sg.s0 < b);
    }

    inTunnel(s) {
        const sg = this.segmentAt(s);
        return sg && sg.type === 'TUNNEL';
    }

    nextCheckpoint(s) {
        for (const cp of this.checkpoints) if (cp.state === 'pending' && cp.s + 15 > s) return cp;
        return null;
    }
}
