// Biomy Evropy + prostředí (světla, mlha, země) + instancované propy a fyzikální překážky
import * as THREE from 'three';
import { CONFIG, clamp, lerp, makeRng } from './config.js';
import { createProp, createRock, removeBody, parkProp, placeProp } from './physics.js';

export const BIOMES = [
    {
        name: 'HOLANDSKO', emoji: '🌷',
        ground: 0x86c96b, sky: [0x6fb4f5, 0xbfe0ff, 0xffeccb], fog: 0xd8ecff, fogNear: 150, fogFar: 520,
        sun: 0xffe0b0, sunInt: 2.4, sunPos: [60, 80, 40], hemi: [0xbfe3ff, 0x86c96b],
        ridge: [0x9db8d8, 0x7d9cc4, 0x5f80ab],
        treeCrown: 0x4f9e46, treeTrunk: 0x6d4c33, treeShape: 'round', extra: 'tulips',
    },
    {
        name: 'ALPY', emoji: '🍂',
        ground: 0xa98548, sky: [0x8fa8d8, 0xd8c1a8, 0xffcf9e], fog: 0xe8d9c0, fogNear: 110, fogFar: 430,
        sun: 0xffb066, sunInt: 2.6, sunPos: [-70, 45, 30], hemi: [0xd8c8b8, 0xa98548],
        ridge: [0xc4a888, 0x9d8268, 0x6e5a48],
        treeCrown: 0xd8742f, treeTrunk: 0x5d4028, treeShape: 'round', extra: 'hay',
    },
    {
        name: 'CHORVATSKO', emoji: '🌊',
        ground: 0xd9c27e, sky: [0x54b8f0, 0xa8e0ff, 0xfff3c9], fog: 0xeaf6ff, fogNear: 180, fogFar: 560,
        sun: 0xfff1cf, sunInt: 3.0, sunPos: [40, 95, -30], hemi: [0xbfe8ff, 0xd9c27e],
        ridge: [0x88c8e8, 0x64a8cf, 0x4888b0],
        treeCrown: 0x3f6b3f, treeTrunk: 0x7a6a50, treeShape: 'cypress', extra: 'rocksWhite',
    },
    {
        name: 'NORSKO', emoji: '❄️',
        ground: 0xe8eef5, sky: [0x2e4a6b, 0x7dc8b0, 0xd8ecf0], fog: 0xdce8f0, fogNear: 90, fogFar: 380,
        sun: 0xcfe0ff, sunInt: 1.8, sunPos: [50, 30, -60], hemi: [0xa8c8e0, 0xe8eef5],
        ridge: [0xb8cce0, 0x94accc, 0x6e88ab],
        treeCrown: 0x3e6b52, treeTrunk: 0x4a3a2c, treeShape: 'pine', extra: 'snow',
    },
];

export function biomeMix(s) {
    const L = CONFIG.biomeLength, B = CONFIG.biomeBlend;
    const i = Math.floor(((s / L) % BIOMES.length + BIOMES.length) % BIOMES.length);
    const local = ((s % L) + L) % L;
    const t = local > L - B ? (local - (L - B)) / B : 0;
    return { a: BIOMES[i], b: BIOMES[(i + 1) % BIOMES.length], t, index: i };
}

const _ca = new THREE.Color(), _cb = new THREE.Color();
export function lerpColor(target, hexA, hexB, t) {
    _ca.setHex(hexA); _cb.setHex(hexB);
    target.copy(_ca).lerp(_cb, t);
    return target;
}

// ---------- prostředí (světla / mlha / země) ----------
export class WorldEnv {
    constructor(scene, quality) {
        this.scene = scene;
        scene.fog = new THREE.Fog(0xd8ecff, 150, 520);

        this.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x86c96b, 0.9);
        scene.add(this.hemi);

        this.sun = new THREE.DirectionalLight(0xffe0b0, 2.4);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(quality.shadow, quality.shadow);
        const sc = this.sun.shadow.camera;
        sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 10; sc.far = 320;
        this.sun.shadow.bias = -0.0004;
        scene.add(this.sun);
        scene.add(this.sun.target);

        this.ground = new THREE.Mesh(
            new THREE.CircleGeometry(900, 40),
            new THREE.MeshStandardMaterial({ color: 0x86c96b, roughness: 1 })
        );
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.position.y = -0.05;
        this.ground.receiveShadow = true;
        scene.add(this.ground);
    }

    update(s, vanPos) {
        const { a, b, t } = biomeMix(s);
        lerpColor(this.ground.material.color, a.ground, b.ground, t);
        lerpColor(this.scene.fog.color, a.fog, b.fog, t);
        this.scene.fog.near = lerp(a.fogNear, b.fogNear, t);
        this.scene.fog.far = lerp(a.fogFar, b.fogFar, t);
        lerpColor(this.sun.color, a.sun, b.sun, t);
        this.sun.intensity = lerp(a.sunInt, b.sunInt, t);
        lerpColor(this.hemi.color, a.hemi[0], b.hemi[0], t);
        lerpColor(this.hemi.groundColor, a.hemi[1], b.hemi[1], t);

        // slunce + stínová kamera sledují vůz (snap na mřížku proti plavání stínů)
        const sx = lerp(a.sunPos[0], b.sunPos[0], t), sy = lerp(a.sunPos[1], b.sunPos[1], t), sz = lerp(a.sunPos[2], b.sunPos[2], t);
        const gx = Math.round(vanPos.x / 4) * 4, gz = Math.round(vanPos.z / 4) * 4;
        this.sun.position.set(gx + sx, sy, gz + sz);
        this.sun.target.position.set(gx, 0, gz);
        this.ground.position.x = vanPos.x; this.ground.position.z = vanPos.z;
    }
}

// ---------- propy ----------
function instanced(geo, matParams, count) {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial(matParams), count);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true;
    m.count = count;
    m.frustumCulled = false;
    return m;
}
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _sv = new THREE.Vector3();

class InstPool {
    constructor(mesh, count) {
        this.mesh = mesh; this.free = [];
        for (let i = count - 1; i >= 0; i--) { this.free.push(i); mesh.setMatrixAt(i, ZERO); }
        mesh.instanceMatrix.needsUpdate = true;
    }
    take() { return this.free.length ? this.free.pop() : -1; }
    give(i) { if (i >= 0) { this.mesh.setMatrixAt(i, ZERO); this.mesh.instanceMatrix.needsUpdate = true; this.free.push(i); } }
    set(i, x, y, z, yaw, sc, stretch) {
        if (i < 0) return;
        _q.setFromAxisAngle(_v.set(0, 1, 0), yaw);
        _m4.compose(_sv.set(x, y, z), _q, new THREE.Vector3(sc, sc * (0.9 + (stretch ?? 0.5) * 0.2), sc));
        this.mesh.setMatrixAt(i, _m4);
        this.mesh.instanceMatrix.needsUpdate = true;
    }
}

export class Props {
    constructor(scene) {
        this.scene = scene;
        this.rng = makeRng(97531);

        const crownRound = new THREE.IcosahedronGeometry(1.5, 0);
        const crownPine = new THREE.ConeGeometry(1.3, 3.2, 7);
        const crownCyp = new THREE.ConeGeometry(0.7, 3.6, 6);
        const trunk = new THREE.CylinderGeometry(0.22, 0.3, 1.6, 6);

        this.pools = {
            crownG: new InstPool(instanced(crownRound, { color: 0x4f9e46, roughness: 0.9, flatShading: true }, 160), 160),
            crownO: new InstPool(instanced(crownRound, { color: 0xd8742f, roughness: 0.9, flatShading: true }, 160), 160),
            pine: new InstPool(instanced(crownPine, { color: 0x3e6b52, roughness: 0.9, flatShading: true }, 120), 120),
            cyp: new InstPool(instanced(crownCyp, { color: 0x3f6b3f, roughness: 0.9, flatShading: true }, 120), 120),
            trunk: new InstPool(instanced(trunk, { color: 0x6d4c33, roughness: 1 }, 300), 300),
            tulip: new InstPool(instanced(new THREE.BoxGeometry(2.2, 0.5, 6), { color: 0xe0507a, roughness: 0.9 }, 90), 90),
            tulipY: new InstPool(instanced(new THREE.BoxGeometry(2.2, 0.5, 6), { color: 0xe8c23a, roughness: 0.9 }, 90), 90),
            rock: new InstPool(instanced(new THREE.IcosahedronGeometry(1, 0), { color: 0x9a948c, roughness: 1, flatShading: true }, 80), 80),
            snowcap: new InstPool(instanced(new THREE.ConeGeometry(1.35, 1.0, 7), { color: 0xffffff, roughness: 0.8 }, 120), 120),
            tent: new InstPool(instanced(new THREE.ConeGeometry(1.6, 1.8, 4), { color: 0xe07a3f, roughness: 0.85, flatShading: true }, 24), 24),
            flag: new InstPool(instanced(new THREE.BoxGeometry(0.12, 2.6, 0.12), { color: 0xf5f2e8, roughness: 0.7 }, 40), 40),
        };
        for (const k in this.pools) scene.add(this.pools[k].mesh);

        // dynamické fyzikální propy — kužely + balíky slámy
        this.coneMesh = instanced(new THREE.ConeGeometry(0.24, 0.72, 8), { color: 0xff6a3d, roughness: 0.8 }, 36);
        this.hayMesh = instanced(new THREE.BoxGeometry(1.1, 0.85, 1.1), { color: 0xd8b862, roughness: 1 }, 20);
        scene.add(this.coneMesh); scene.add(this.hayMesh);
        this.cones = []; this.hays = [];
        for (let i = 0; i < 36; i++) {
            const e = { active: false, chunk: -1, scored: false, idx: i };
            e.ph = createProp('cone', e);
            this.cones.push(e); parkProp(e.ph, i);
        }
        for (let i = 0; i < 20; i++) {
            const e = { active: false, chunk: -1, scored: false, idx: i, hay: true };
            e.ph = createProp('hay', e);
            this.hays.push(e); parkProp(e.ph, i + 40);
        }

        this.rocks = [];          // {ph, x, z, r, s, i, chunk, nearAwarded}
        this.byChunk = new Map(); // chunkId -> záznamy k uvolnění
    }

    releaseAll() {
        for (const id of [...this.byChunk.keys()]) this.releaseChunk(id);
        this.byChunk.clear();
    }

    _own(chunkId, rec) {
        if (!this.byChunk.has(chunkId)) this.byChunk.set(chunkId, []);
        this.byChunk.get(chunkId).push(rec);
    }

    /** volané road hookem při stavbě chunku */
    populate(chunk, road) {
        const rng = this.rng;
        const mix = biomeMix(chunk.s0);
        const bio = mix.t > 0.5 ? mix.b : mix.a;

        for (let s = chunk.s0 + 6; s < chunk.s1 - 4; s += 10 + rng() * 14) {
            const side = rng() > 0.5 ? 1 : -1;
            const lat = side * (9 + rng() * 18);
            const p = road.pointAt(s, lat);
            this._tree(chunk.id, bio, p.x, p.z, rng);
        }
        // tulipánové pásy (Holandsko)
        if (bio.extra === 'tulips') {
            for (let s = chunk.s0 + 10; s < chunk.s1 - 10; s += 26 + rng() * 20) {
                const side = rng() > 0.5 ? 1 : -1;
                const p = road.pointAt(s, side * (8.5 + rng() * 4));
                const pool = rng() > 0.5 ? this.pools.tulip : this.pools.tulipY;
                const i = pool.take();
                pool.set(i, p.x, 0.2, p.z, road.headingAt(s), 1 + rng() * 0.6);
                this._own(chunk.id, { pool, idx: i });
            }
        }

        const seg = road.segmentAt(chunk.s0 + 20);
        const isCorner = seg && (seg.type === 'CORNER' || seg.type === 'HAIRPIN');

        // kužely na vnitřku zatáček (bodované, létají)
        if (isCorner && chunk.s0 > 250 && rng() < 0.75) {
            const inner = Math.sign(seg.k);
            for (let j = 0; j < 4; j++) {
                const c = this.cones.find(c => !c.active);
                if (!c) break;
                const s = chunk.s0 + 25 + j * 7;
                const p = road.pointAt(s, inner * 3.6);
                placeProp(c.ph, p.x, 0.4, p.z, 0);
                c.active = true; c.chunk = chunk.id; c.scored = false;
                this._own(chunk.id, { dyn: c, mesh: this.coneMesh, kind: 'cone' });
            }
        }
        // balíky slámy na výjezdu (v Alpách častěji)
        if (isCorner && chunk.s0 > 300 && rng() < (bio.extra === 'hay' ? 0.55 : 0.25)) {
            for (let j = 0; j < 2; j++) {
                const h = this.hays.find(h => !h.active);
                if (!h) break;
                const p = road.pointAt(chunk.s0 + 70 + j * 6, -Math.sign(seg.k) * 4.4);
                placeProp(h.ph, p.x, 0.45, p.z, rng() * 3);
                h.active = true; h.chunk = chunk.id; h.scored = false;
                this._own(chunk.id, { dyn: h, mesh: this.hayMesh, kind: 'hay' });
            }
        }
        // balvany — tvrdé překážky u kraje (od 400 m dál, ne u kempů)
        if (chunk.s0 > 400 && rng() < 0.65) {
            const nRocks = 1 + (rng() < 0.3 ? 1 : 0);
            for (let j = 0; j < nRocks; j++) {
                const s = chunk.s0 + 20 + rng() * 80;
                if (road.campZones.some(z => Math.abs(z.sc - s) < 70)) continue;
                const side = rng() > 0.5 ? 1 : -1;
                const p = road.pointAt(s, side * (4.9 + rng() * 1.4));
                const r = 0.8 + rng() * 0.7;
                const i = this.pools.rock.take();
                this.pools.rock.set(i, p.x, r * 0.5, p.z, rng() * 3, r * (bio.extra === 'rocksWhite' ? 1.05 : 1));
                const rec = { x: p.x, z: p.z, r, s, i, chunk: chunk.id, nearAwarded: false, hit: false, minD: 1e9 };
                rec.ph = createRock(p.x, p.z, r, rec);
                this.rocks.push(rec);
                this._own(chunk.id, { rock: rec });
            }
        }
    }

    _tree(chunkId, bio, x, z, rng) {
        const ti = this.pools.trunk.take();
        this.pools.trunk.set(ti, x, 0.8, z, 0, 1 + rng() * 0.4);
        this._own(chunkId, { pool: this.pools.trunk, idx: ti });
        let pool, y = 2.6;
        const sc = 1 + rng() * 0.7;
        if (bio.treeShape === 'pine') { pool = this.pools.pine; y = 2.8; }
        else if (bio.treeShape === 'cypress') { pool = this.pools.cyp; y = 3.0; }
        else pool = bio.treeCrown === 0xd8742f ? this.pools.crownO : this.pools.crownG;
        const ci = pool.take();
        pool.set(ci, x, y, z, rng() * 3, sc, rng());
        this._own(chunkId, { pool, idx: ci });
        if (bio.extra === 'snow' && bio.treeShape === 'pine') {
            const si = this.pools.snowcap.take();
            this.pools.snowcap.set(si, x, y + 1.3 * sc, z, 0, sc * 0.9);
            this._own(chunkId, { pool: this.pools.snowcap, idx: si });
        }
    }

    campVisual(zone, road, chunkId) {
        const p = road.pointAt(zone.sc, 8);
        const ti = this.pools.tent.take();
        this.pools.tent.set(ti, p.x, 0.9, p.z, 0.7, 1.2);
        const f1 = this.pools.flag.take(), f2 = this.pools.flag.take();
        const pa = road.pointAt(zone.s0, 5.2), pb = road.pointAt(zone.s1, 5.2);
        this.pools.flag.set(f1, pa.x, 1.3, pa.z, 0, 1);
        this.pools.flag.set(f2, pb.x, 1.3, pb.z, 0, 1);
        this._own(chunkId, { pool: this.pools.tent, idx: ti });
        this._own(chunkId, { pool: this.pools.flag, idx: f1 });
        this._own(chunkId, { pool: this.pools.flag, idx: f2 });
    }

    releaseChunk(chunkId) {
        const list = this.byChunk.get(chunkId);
        if (!list) return;
        for (const rec of list) {
            if (rec.pool) rec.pool.give(rec.idx);
            else if (rec.dyn) {
                rec.dyn.active = false;
                parkProp(rec.dyn.ph, rec.dyn.idx + (rec.kind === 'hay' ? 40 : 0));
                rec.mesh.setMatrixAt(rec.dyn.idx, ZERO);
                rec.mesh.instanceMatrix.needsUpdate = true;
            } else if (rec.rock) {
                this.pools.rock.give(rec.rock.i);
                removeBody(rec.rock.ph);
                const k = this.rocks.indexOf(rec.rock);
                if (k >= 0) this.rocks.splice(k, 1);
            }
        }
        this.byChunk.delete(chunkId);
    }

    /** synchronizace dynamických propů s fyzikou */
    sync() {
        this._syncArr(this.cones, this.coneMesh);
        this._syncArr(this.hays, this.hayMesh);
    }
    _syncArr(arr, mesh) {
        let dirty = false;
        for (const e of arr) {
            if (!e.active) continue;
            const t = e.ph.body.translation(), r = e.ph.body.rotation();
            _q.set(r.x, r.y, r.z, r.w);
            _m4.compose(_v.set(t.x, t.y, t.z), _q, _sv.set(1, 1, 1));
            mesh.setMatrixAt(e.idx, _m4);
            dirty = true;
        }
        if (dirty) mesh.instanceMatrix.needsUpdate = true;
    }
}
