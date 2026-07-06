// Pobřežní prostředí: denní doby, moře s vlnami, lodě, útes, tunely,
// policejní kontroly a instancované propy
import * as THREE from 'three';
import { CONFIG, clamp, lerp, makeRng } from './config.js';
import { createProp, createRock, createPolice, removeBody, parkProp, placeProp } from './physics.js';

// ---------- denní doby (nahrazují biomy; pole kompatibilní s effects.js) ----------
export const BIOMES = [
    {
        name: 'POLEDNE', emoji: '☀️',
        sky: [0x3fa8f0, 0x9fd8ff, 0xfff3d0], fog: 0xdff0ff, fogNear: 170, fogFar: 560,
        sun: 0xfff1cf, sunInt: 3.0, sunPos: [30, 95, -50], hemi: [0xbfe8ff, 0x88a878],
        ridge: [0x8fc4e0, 0x6aa8cc, 0x4d88ae],
        sea: [0x1470a8, 0x4fc0d8], land: 0x9dbb6a, cliff: 0xb09a80,
    },
    {
        name: 'ZÁPAD SLUNCE', emoji: '🌅',
        sky: [0x6f5f9e, 0xff9d6f, 0xffd9a0], fog: 0xf0cfa8, fogNear: 130, fogFar: 470,
        sun: 0xff9a4d, sunInt: 2.6, sunPos: [-80, 24, -45], hemi: [0xe8b898, 0x8a7a58],
        ridge: [0xc49a88, 0x9d7468, 0x6e5050],
        sea: [0x2a4878, 0xff9d6f], land: 0x8aa058, cliff: 0xc09878,
    },
    {
        name: 'NOC', emoji: '🌙',
        sky: [0x101f3a, 0x24406a, 0x4a6a90], fog: 0x24344e, fogNear: 100, fogFar: 400,
        sun: 0xa8c4f0, sunInt: 1.4, sunPos: [40, 60, -60], hemi: [0x4a6088, 0x2e4048],
        ridge: [0x36486a, 0x2a3a58, 0x1e2c46],
        sea: [0x0e2844, 0x2a5878], land: 0x40604a, cliff: 0x585264,
    },
    {
        name: 'RÁNO', emoji: '🌄',
        sky: [0x6fa8d8, 0xc8e0f0, 0xffe8c0], fog: 0xe8f0f8, fogNear: 110, fogFar: 460,
        sun: 0xffe0a8, sunInt: 2.2, sunPos: [85, 40, 30], hemi: [0xc8e0f0, 0x88a070],
        ridge: [0xa8c4d8, 0x84a8c4, 0x6088a8],
        sea: [0x1a6090, 0x6fc8d0], land: 0x94b468, cliff: 0xa8927a,
    },
];

export function biomeMix(s) {
    const L = CONFIG.dayLength, B = CONFIG.dayBlend;
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

// ---------- moře s vlnami ----------
export class Sea {
    constructor(scene, quality) {
        this.uniforms = {
            uTime: { value: 0 },
            uDeep: { value: new THREE.Color(0x1470a8) },
            uLight: { value: new THREE.Color(0x4fc0d8) },
            uFogColor: { value: new THREE.Color(0xdff0ff) },
            uFogNear: { value: 170 },
            uFogFar: { value: 560 },
        };
        const geo = new THREE.PlaneGeometry(1600, 1600, quality.seaSegs, quality.seaSegs);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: `
                uniform float uTime;
                varying float vH; varying float vDist;
                void main(){
                    vec4 wp = modelMatrix * vec4(position, 1.0);
                    float h = sin(wp.x * 0.08 + uTime * 0.9) * 0.5
                            + sin(wp.z * 0.11 + uTime * 0.7) * 0.4
                            + sin((wp.x + wp.z) * 0.045 + uTime * 0.5) * 0.6;
                    wp.y += h * 0.35;
                    vH = h;
                    vec4 mv = viewMatrix * wp;
                    vDist = -mv.z;
                    gl_Position = projectionMatrix * mv;
                }`,
            fragmentShader: `
                uniform vec3 uDeep; uniform vec3 uLight;
                uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
                varying float vH; varying float vDist;
                void main(){
                    vec3 c = mix(uDeep, uLight, clamp(vH * 0.35 + 0.45, 0.0, 1.0));
                    float f = clamp((vDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
                    gl_FragColor = vec4(mix(c, uFogColor, f), 1.0);
                }`,
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.y = 0;
        this.mesh.renderOrder = -8;
        this.mesh.frustumCulled = false;
        scene.add(this.mesh);
    }
    update(t, s, camPos, fog) {
        this.uniforms.uTime.value = t;
        const { a, b, t: mt } = biomeMix(s);
        lerpColor(this.uniforms.uDeep.value, a.sea[0], b.sea[0], mt);
        lerpColor(this.uniforms.uLight.value, a.sea[1], b.sea[1], mt);
        this.uniforms.uFogColor.value.copy(fog.color);
        this.uniforms.uFogNear.value = fog.near;
        this.uniforms.uFogFar.value = fog.far;
        this.mesh.position.x = Math.round(camPos.x / 8) * 8;
        this.mesh.position.z = Math.round(camPos.z / 8) * 8;
    }
}

// ---------- prostředí (světla / mlha / tónování materiálů silnice) ----------
export class WorldEnv {
    constructor(scene, quality) {
        this.scene = scene;
        scene.fog = new THREE.Fog(0xdff0ff, 170, 560);

        this.hemi = new THREE.HemisphereLight(0xbfe8ff, 0x88a878, 0.9);
        scene.add(this.hemi);

        this.sun = new THREE.DirectionalLight(0xfff1cf, 3.0);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(quality.shadow, quality.shadow);
        const sc = this.sun.shadow.camera;
        sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 10; sc.far = 360;
        this.sun.shadow.bias = -0.0004;
        scene.add(this.sun);
        scene.add(this.sun.target);
    }

    /** roadMats: {landMat, cliffMat} pro tónování podle denní doby */
    update(s, vanPos, roadMats) {
        const { a, b, t } = biomeMix(s);
        lerpColor(this.scene.fog.color, a.fog, b.fog, t);
        this.scene.fog.near = lerp(a.fogNear, b.fogNear, t);
        this.scene.fog.far = lerp(a.fogFar, b.fogFar, t);
        lerpColor(this.sun.color, a.sun, b.sun, t);
        this.sun.intensity = lerp(a.sunInt, b.sunInt, t);
        lerpColor(this.hemi.color, a.hemi[0], b.hemi[0], t);
        lerpColor(this.hemi.groundColor, a.hemi[1], b.hemi[1], t);
        if (roadMats) {
            lerpColor(roadMats.landMat.color, a.land, b.land, t);
            lerpColor(roadMats.cliffMat.color, a.cliff, b.cliff, t);
        }
        const sx = lerp(a.sunPos[0], b.sunPos[0], t), sy = lerp(a.sunPos[1], b.sunPos[1], t), sz = lerp(a.sunPos[2], b.sunPos[2], t);
        const gx = Math.round(vanPos.x / 4) * 4, gz = Math.round(vanPos.z / 4) * 4;
        this.sun.position.set(gx + sx, sy + 10, gz + sz);
        this.sun.target.position.set(gx, 0, gz);
    }
}

// ---------- pomůcky pro instancování ----------
function instanced(geo, mat, count) {
    const m = new THREE.InstancedMesh(geo, mat, count);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true;
    m.count = count;
    m.frustumCulled = false;
    return m;
}
function std(params) { return new THREE.MeshStandardMaterial(params); }
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
    set(i, x, y, z, yaw, sc, scy) {
        if (i < 0) return;
        _q.setFromAxisAngle(_v.set(0, 1, 0), yaw);
        _m4.compose(_sv.set(x, y, z), _q, new THREE.Vector3(sc, scy ?? sc, sc));
        this.mesh.setMatrixAt(i, _m4);
        this.mesh.instanceMatrix.needsUpdate = true;
    }
}

// pruhovaná textura pro barikády
function stripeTexture() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 16;
    const g = c.getContext('2d');
    for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#e84e3c' : '#f5f0e8';
        g.fillRect(i * 8, 0, 8, 16);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    return t;
}

// ---------- policejní auto (pool malých Group) ----------
function buildPoliceCar(strobeR, strobeB) {
    const g = new THREE.Group();
    const white = std({ color: 0xf0f0ee, roughness: 0.5 });
    const blue = std({ color: 0x1a3a8c, roughness: 0.55 });
    const dark = std({ color: 0x16161a, roughness: 0.8 });
    const glass = std({ color: 0x202830, roughness: 0.25 });
    const add = (w, h, d, m, x, y, z) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        b.position.set(x, y, z); b.castShadow = true; g.add(b); return b;
    };
    add(1.8, 0.55, 4.4, white, 0, 0.62, 0);          // spodek
    add(1.82, 0.32, 4.42, blue, 0, 0.95, 0);         // modrý pruh
    add(1.6, 0.5, 2.2, white, 0, 1.35, -0.2);        // kabina
    add(1.5, 0.4, 0.06, glass, 0, 1.35, 0.95);       // čelní sklo
    // maják
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.3), strobeR);
    r.position.set(-0.25, 1.72, -0.2); g.add(r);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.3), strobeB);
    b2.position.set(0.25, 1.72, -0.2); g.add(b2);
    // kola
    const wg = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 8);
    [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]].forEach(p => {
        const w = new THREE.Mesh(wg, dark);
        w.rotation.z = Math.PI / 2; w.position.set(p[0], 0.32, p[1]);
        g.add(w);
    });
    return g;
}

// ---------- lodě ----------
function buildBoat(type) {
    const g = new THREE.Group();
    const hullW = std({ color: 0xf0ede4, roughness: 0.6 });
    const wood = std({ color: 0x8a6a4a, roughness: 0.8 });
    const add = (w, h, d, m, x, y, z) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        b.position.set(x, y, z); g.add(b); return b;
    };
    if (type === 'sail') {
        add(1.4, 0.8, 4.5, hullW, 0, 0.3, 0);
        add(0.08, 5, 0.08, wood, 0, 3, 0.3);
        const sail = new THREE.Mesh(new THREE.ConeGeometry(1.5, 4.2, 3), std({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide }));
        sail.scale.z = 0.06; sail.position.set(0, 3, -0.6);
        g.add(sail);
    } else if (type === 'fish') {
        add(2, 1, 5.5, std({ color: 0x3868a8, roughness: 0.7 }), 0, 0.45, 0);
        add(1.5, 1.1, 1.8, hullW, 0, 1.4, -0.8);
        add(0.08, 2.2, 0.08, wood, 0, 2, 1.5);
    } else if (type === 'yacht') {
        add(2.2, 1, 8, hullW, 0, 0.5, 0);
        add(1.8, 0.9, 4, std({ color: 0xe8e4d8, roughness: 0.5 }), 0, 1.4, -0.5);
        add(1.2, 0.7, 2, std({ color: 0x304858, roughness: 0.35 }), 0, 2.1, -0.2);
    } else { // liner — zaoceánský parník
        add(7, 3.2, 42, std({ color: 0x2a3444, roughness: 0.6 }), 0, 1.6, 0);
        add(6.2, 1.6, 30, std({ color: 0xf0eee8, roughness: 0.55 }), 0, 4, 0);
        add(5.2, 1.4, 20, std({ color: 0xf0eee8, roughness: 0.55 }), 0, 5.4, -1);
        const win = std({ color: 0xffe9a0, roughness: 0.4, emissive: 0xffd070, emissiveIntensity: 0.9 });
        add(7.15, 0.35, 34, win, 0, 2.6, 0);
        add(6.35, 0.3, 26, win, 0, 4.35, 0);
        const funnel = std({ color: 0xc84438, roughness: 0.6 });
        const fg = new THREE.CylinderGeometry(0.9, 1.1, 2.6, 10);
        [-4, 4].forEach(z => {
            const f = new THREE.Mesh(fg, funnel);
            f.position.set(0, 7, z); g.add(f);
        });
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = type === 'liner'; });
    return g;
}

export class Fleet {
    constructor(scene, onHorn) {
        this.scene = scene;
        this.onHorn = onHorn;
        this.rng = makeRng(24680);
        const B = CONFIG.boats;
        this.boats = [];
        const mk = (type, speed) => {
            const mesh = buildBoat(type);
            this.scene.add(mesh);
            const b = { mesh, type, s: 0, lat: 0, speed, phase: this.rng() * 6.28, dir: this.rng() > 0.5 ? 1 : -1, active: type !== 'liner' };
            this.boats.push(b);
            return b;
        };
        for (let i = 0; i < B.sailboats; i++) mk('sail', 1.2 + this.rng());
        for (let i = 0; i < B.fishing; i++) mk('fish', 2 + this.rng());
        for (let i = 0; i < B.yacht; i++) mk('yacht', 4 + this.rng() * 2);
        this.liner = mk('liner', 3);
        this.liner.active = false;
        this.liner.mesh.visible = false;
        this.nextLinerS = CONFIG.boats.linerEvery;
        this._seeded = false;
    }

    reset() {
        this._seeded = false;
        this.nextLinerS = CONFIG.boats.linerEvery;
        this.liner.active = false; this.liner.mesh.visible = false;
    }

    _respawn(b, vanS) {
        const B = CONFIG.boats;
        b.s = vanS + 120 + this.rng() * 320;
        b.lat = B.latMin - this.rng() * (Math.abs(B.latMax) - Math.abs(B.latMin));
        b.dir = this.rng() > 0.5 ? 1 : -1;
    }

    update(dt, t, vanS, road) {
        if (!this._seeded) {
            this._seeded = true;
            for (const b of this.boats) if (b.type !== 'liner') this._respawn(b, vanS - 100);
        }
        // parník připlouvá vzácně
        if (!this.liner.active && vanS > this.nextLinerS) {
            this.liner.active = true;
            this.liner.mesh.visible = true;
            this.liner.s = vanS + 300;
            this.liner.lat = -120 - this.rng() * 40;
            this.liner.dir = -1;
            this.nextLinerS = vanS + CONFIG.boats.linerEvery;
            if (this.onHorn) this.onHorn();
        }
        for (const b of this.boats) {
            if (!b.active) continue;
            b.s += b.speed * b.dir * dt;
            if (b.s < vanS - 200 || b.s > vanS + 520) {
                if (b.type === 'liner') { b.active = false; b.mesh.visible = false; continue; }
                this._respawn(b, vanS);
            }
            const p = road.pointAt(b.s, b.lat);
            const bob = Math.sin(t * 0.8 + b.phase);
            b.mesh.position.set(p.x, (b.type === 'liner' ? 0 : 0.1) + bob * (b.type === 'liner' ? 0.08 : 0.22), p.z);
            b.mesh.rotation.set(
                Math.sin(t * 0.6 + b.phase) * 0.04,
                road.headingAt(b.s) + (b.dir > 0 ? 0 : Math.PI),
                bob * 0.05
            );
        }
    }
}

// ---------- propy, tunely, kontroly ----------
export class Props {
    constructor(scene) {
        this.scene = scene;
        this.rng = makeRng(97531);

        this.pools = {
            pine: new InstPool(instanced(new THREE.ConeGeometry(1.4, 3.4, 7), std({ color: 0x3e7a52, roughness: 0.9, flatShading: true }), 140), 140),
            cyp: new InstPool(instanced(new THREE.ConeGeometry(0.65, 3.8, 6), std({ color: 0x2e5a3c, roughness: 0.9, flatShading: true }), 120), 120),
            trunk: new InstPool(instanced(new THREE.CylinderGeometry(0.2, 0.28, 1.6, 6), std({ color: 0x6d4c33, roughness: 1 }), 220), 220),
            wall: new InstPool(instanced(new THREE.BoxGeometry(3.2, 0.55, 0.35), std({ color: 0xd8cfc0, roughness: 0.95 }), 220), 220),
            rock: new InstPool(instanced(new THREE.IcosahedronGeometry(1, 0), std({ color: 0x8a8078, roughness: 1, flatShading: true }), 40), 40),
            lamp: new InstPool(instanced(new THREE.BoxGeometry(0.5, 0.12, 0.9), std({ color: 0xfff0c0, emissive: 0xffe9a0, emissiveIntensity: 1.6 }), 60), 60),
        };
        for (const k in this.pools) this.pools[k].mesh.receiveShadow = false;
        for (const k in this.pools) scene.add(this.pools[k].mesh);

        // barikády (dynamická tělesa, pruhované)
        const stripeMat = std({ map: stripeTexture(), roughness: 0.7 });
        this.barrierMesh = instanced(new THREE.BoxGeometry(1.55, 0.5, 0.22), stripeMat, 24);
        scene.add(this.barrierMesh);
        this.barriers = [];
        for (let i = 0; i < 24; i++) {
            const e = { active: false, idx: i, yOff: 0, cp: null };
            e.ph = createProp('barrier', e);
            this.barriers.push(e); parkProp(e.ph, i);
        }

        // policejní auta (pool 3) se sdílenými strobe materiály
        this.strobeR = std({ color: 0xc0342a, emissive: 0xff2010, emissiveIntensity: 2 });
        this.strobeB = std({ color: 0x2038c0, emissive: 0x2040ff, emissiveIntensity: 0.2 });
        this.cars = [];
        for (let i = 0; i < 3; i++) {
            const mesh = buildPoliceCar(this.strobeR, this.strobeB);
            mesh.visible = false;
            scene.add(mesh);
            this.cars.push({ mesh, busy: false, ph: null });
        }

        // tunelové materiály
        this.tunnelWallMat = std({ color: 0x3a3a42, roughness: 1 });
        this.tunnelDarkMat = new THREE.MeshBasicMaterial({ color: 0x16161c });
        this.portalMat = std({ color: 0x9a8a74, roughness: 1, flatShading: true });

        this.rocks = [];          // tvrdé překážky na silnici
        this.byChunk = new Map();
    }

    strobe(t) {
        const on = Math.floor(t * 4) % 2 === 0;
        this.strobeR.emissiveIntensity = on ? 2.4 : 0.15;
        this.strobeB.emissiveIntensity = on ? 0.15 : 2.4;
    }

    releaseAll() {
        for (const id of [...this.byChunk.keys()]) this.releaseChunk(id);
        this.byChunk.clear();
    }

    _own(chunkId, rec) {
        if (!this.byChunk.has(chunkId)) this.byChunk.set(chunkId, []);
        this.byChunk.get(chunkId).push(rec);
    }

    populate(chunk, road) {
        const rng = this.rng;
        const tunnels = road.tunnelsIn(chunk.s0, chunk.s1);
        const inTunnel = s => tunnels.some(tg => s >= tg.s0 - 4 && s <= tg.s1 + 4);
        const nearCp = s => road.checkpoints.some(cp => Math.abs(cp.s - s) < 50);

        // stromy na pevninské straně
        for (let s = chunk.s0 + 6; s < chunk.s1 - 4; s += 12 + rng() * 16) {
            if (inTunnel(s)) continue;
            const lat = 8 + rng() * 22;
            const p = road.pointAt(s, lat);
            const y = p.y + lat * 0.055; // pevnina stoupá
            const ti = this.pools.trunk.take();
            this.pools.trunk.set(ti, p.x, y + 0.8, p.z, 0, 1 + rng() * 0.4);
            this._own(chunk.id, { pool: this.pools.trunk, idx: ti });
            const pool = rng() > 0.45 ? this.pools.pine : this.pools.cyp;
            const ci = pool.take();
            pool.set(ci, p.x, y + 2.9, p.z, rng() * 3, 0.9 + rng() * 0.7);
            this._own(chunk.id, { pool, idx: ci });
        }

        // kamenná zídka podél moře (dlouhá osa kvádru po směru silnice)
        for (let s = chunk.s0 + 1.5; s < chunk.s1 - 1; s += 3.1) {
            if (inTunnel(s)) continue;
            const p = road.pointAt(s, -(CONFIG.road.width / 2 + 0.45));
            const wi = this.pools.wall.take();
            this.pools.wall.set(wi, p.x, p.y + 0.22, p.z, road.headingAt(s) - Math.PI / 2, 1);
            this._own(chunk.id, { pool: this.pools.wall, idx: wi });
        }

        // tunelové tubusy
        for (const tg of tunnels) {
            const a = Math.max(tg.s0, chunk.s0), b = Math.min(tg.s1, chunk.s1);
            if (b - a < 4) continue;
            this._buildTunnelPart(chunk, road, a, b, tg);
        }

        // spadlý kámen NA silnici (řídce — teď se mu dá vyhnout řízením)
        if (chunk.s0 > 500 && rng() < 0.35) {
            const s = chunk.s0 + 20 + rng() * 80;
            if (!inTunnel(s) && !nearCp(s)) {
                const lat = (rng() - 0.5) * 6;
                const p = road.pointAt(s, lat);
                const r = 0.7 + rng() * 0.5;
                const i = this.pools.rock.take();
                this.pools.rock.set(i, p.x, p.y + r * 0.45, p.z, rng() * 3, r);
                const rec = { x: p.x, z: p.z, r, s, i, hit: false, nearAwarded: false, minD: 1e9 };
                rec.ph = createRock(p.x, p.z, r, rec);
                this.rocks.push(rec);
                this._own(chunk.id, { rock: rec });
            }
        }
    }

    _buildTunnelPart(chunk, road, sA, sB, seg) {
        const i0 = road._idxOfS(sA), i1 = road._idxOfS(sB);
        const W = CONFIG.road.width / 2 + 0.6, H = 4.7;
        const P = (sm, lat, yo) => [sm.x + Math.cos(sm.a) * lat, sm.y + yo, sm.z - Math.sin(sm.a) * lat];
        const meshes = [
            road._strip(i0, i1, sm => P(sm, W, 0), sm => P(sm, W, H), this.tunnelWallMat),
            road._strip(i0, i1, sm => P(sm, -W, H), sm => P(sm, -W, 0), this.tunnelWallMat),
            road._strip(i0, i1, sm => P(sm, -W, H), sm => P(sm, W, H), this.tunnelDarkMat),
        ];
        for (const m of meshes) { this.scene.add(m); this._own(chunk.id, { mesh: m }); }
        // stropní lampy
        for (let s = sA + 4; s < sB - 2; s += CONFIG.tunnel.lampStep) {
            const p = road.pointAt(s, 0, H - 0.35);
            const li = this.pools.lamp.take();
            this.pools.lamp.set(li, p.x, p.y, p.z, road.headingAt(s), 1);
            this._own(chunk.id, { pool: this.pools.lamp, idx: li });
        }
        // portály (jen na skutečných koncích tunelu uvnitř chunku)
        for (const end of [seg.s0, seg.s1]) {
            if (end < chunk.s0 || end >= chunk.s1) continue;
            const p = road.pointAt(end, 0);
            const a = road.headingAt(end);
            const portal = new THREE.Group();
            const mk = (w, h, d, x, y) => {
                const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.portalMat);
                b.position.set(x, y, 0); b.castShadow = true; portal.add(b);
            };
            mk(1.4, H + 2.2, 2.4, -(W + 0.6), (H + 2.2) / 2);
            mk(1.4, H + 2.2, 2.4, W + 0.6, (H + 2.2) / 2);
            mk(2 * W + 2.6, 1.8, 2.4, 0, H + 0.9);
            portal.position.set(p.x, p.y, p.z);
            portal.rotation.y = a;
            this.scene.add(portal);
            this._own(chunk.id, { group: portal });
        }
    }

    /** postaví policejní kontrolu (hook z road) */
    buildCheckpoint(cp, chunk, road) {
        const y = road.yAt(cp.s);
        cp.roadY = y;
        // barikády přes silnici kromě mezery
        const lats = [];
        for (let l = -3.4; l <= 3.41; l += CONFIG.checkpoint.barrierStep) lats.push(l);
        cp.barriers = [];
        for (const lat of lats) {
            if (Math.abs(lat - cp.gapLat) < CONFIG.checkpoint.gapHalf) continue;
            const e = this.barriers.find(b => !b.active);
            if (!e) break;
            const p = road.pointAt(cp.s, lat);
            placeProp(e.ph, p.x, 0.45, p.z, road.headingAt(cp.s));
            e.active = true; e.yOff = y; e.cp = cp;
            cp.barriers.push(e);
            this._own(chunk.id, { dyn: e });
        }
        // policejní auto na krajnici (tvrdá překážka)
        const car = this.cars.find(c => !c.busy);
        if (car) {
            const p = road.pointAt(cp.s + 6, 6.9);
            car.mesh.position.set(p.x, p.y + 0.4, p.z);
            car.mesh.rotation.y = road.headingAt(cp.s) + 0.5;
            car.mesh.visible = true;
            car.busy = true;
            car.ph = createPolice(p.x, p.z, cp);
            this._own(chunk.id, { car });
        }
    }

    releaseChunk(chunkId) {
        const list = this.byChunk.get(chunkId);
        if (!list) return;
        for (const rec of list) {
            if (rec.pool) rec.pool.give(rec.idx);
            else if (rec.dyn) {
                rec.dyn.active = false; rec.dyn.cp = null;
                parkProp(rec.dyn.ph, rec.dyn.idx);
                this.barrierMesh.setMatrixAt(rec.dyn.idx, ZERO);
                this.barrierMesh.instanceMatrix.needsUpdate = true;
            } else if (rec.rock) {
                this.pools.rock.give(rec.rock.i);
                removeBody(rec.rock.ph);
                const k = this.rocks.indexOf(rec.rock);
                if (k >= 0) this.rocks.splice(k, 1);
            } else if (rec.mesh) {
                this.scene.remove(rec.mesh); rec.mesh.geometry.dispose();
            } else if (rec.group) {
                this.scene.remove(rec.group);
                rec.group.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
            } else if (rec.car) {
                rec.car.busy = false; rec.car.mesh.visible = false;
                removeBody(rec.car.ph); rec.car.ph = null;
            }
        }
        this.byChunk.delete(chunkId);
    }

    /** synchronizace barikád s fyzikou (+ výškový offset silnice) */
    sync() {
        let dirty = false;
        for (const e of this.barriers) {
            if (!e.active) continue;
            const t = e.ph.body.translation(), r = e.ph.body.rotation();
            _q.set(r.x, r.y, r.z, r.w);
            _m4.compose(_v.set(t.x, t.y + e.yOff, t.z), _q, _sv.set(1, 1, 1));
            this.barrierMesh.setMatrixAt(e.idx, _m4);
            dirty = true;
        }
        if (dirty) this.barrierMesh.instanceMatrix.needsUpdate = true;
    }
}
