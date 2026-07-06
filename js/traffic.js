// Provoz na pobřežní silnici — protijedoucí a pomalejší auta (arkádově, bez fyziky)
import * as THREE from 'three';
import { CONFIG, makeRng } from './config.js';

const TR = CONFIG.traffic;

const PALETTE = [0xc94f3b, 0x3b6fc9, 0xd8c04a, 0x58a86a, 0xd8d4cc, 0x7a4fa0, 0xe08a3c];

function std(p) { return new THREE.MeshStandardMaterial(p); }

function buildCar(color) {
    const g = new THREE.Group();
    const body = std({ color, roughness: 0.5, metalness: 0.15 });
    const dark = std({ color: 0x1a1a1e, roughness: 0.8 });
    const glass = std({ color: 0x222a34, roughness: 0.25, metalness: 0.3 });
    const add = (w, h, d, m, x, y, z) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        b.position.set(x, y, z); b.castShadow = true; g.add(b); return b;
    };
    add(1.72, 0.5, 3.9, body, 0, 0.58, 0);            // spodek
    add(1.5, 0.46, 2.0, body, 0, 1.04, -0.25);        // kabina
    add(1.42, 0.36, 0.06, glass, 0, 1.06, 0.82);      // čelní sklo
    add(1.42, 0.32, 0.06, glass, 0, 1.04, -1.3);      // zadní sklo
    add(1.53, 0.3, 1.6, glass, 0, 1.03, -0.25);       // boční okna
    // světla (svítí i v noci)
    const head = std({ color: 0xfff2c0, emissive: 0xffedb0, emissiveIntensity: 1.2 });
    const tail = std({ color: 0xa02820, emissive: 0x901810, emissiveIntensity: 1.0 });
    add(0.3, 0.12, 0.05, head, -0.6, 0.62, 1.97);
    add(0.3, 0.12, 0.05, head, 0.6, 0.62, 1.97);
    add(0.26, 0.12, 0.05, tail, -0.6, 0.66, -1.97);
    add(0.26, 0.12, 0.05, tail, 0.6, 0.66, -1.97);
    // kola
    const wg = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8);
    [[-0.8, 1.25], [0.8, 1.25], [-0.8, -1.25], [0.8, -1.25]].forEach(p => {
        const w = new THREE.Mesh(wg, dark);
        w.rotation.z = Math.PI / 2; w.position.set(p[0], 0.3, p[1]);
        g.add(w);
    });
    g.rotation.order = 'YXZ';
    return g;
}

export class Traffic {
    /** hooks: { onHit(car), onNearMiss(car) } */
    constructor(scene, hooks) {
        this.scene = scene;
        this.hooks = hooks || {};
        this.rng = makeRng(13579);
        this.cars = [];
        const mk = dir => {
            const mesh = buildCar(PALETTE[Math.floor(this.rng() * PALETTE.length)]);
            mesh.visible = false;
            scene.add(mesh);
            this.cars.push({ mesh, dir, active: false, s: 0, lat: 0, speed: 0, cool: 1 + this.rng() * 4, hit: false, nearAwarded: false, minD: 1e9, x: 0, z: 0 });
        };
        for (let i = 0; i < TR.oncoming; i++) mk(-1);
        for (let i = 0; i < TR.same; i++) mk(1);
    }

    reset() {
        for (const c of this.cars) { c.active = false; c.mesh.visible = false; c.cool = 1 + this.rng() * 4; }
    }

    _nearCheckpoint(road, s, r) {
        return road.checkpoints.some(cp => cp.state === 'pending' && Math.abs(cp.s - s) < r);
    }

    _spawn(c, van, road) {
        const s = van.s + TR.spawnAhead[0] + this.rng() * (TR.spawnAhead[1] - TR.spawnAhead[0]);
        if (this._nearCheckpoint(road, s, TR.cpClear)) return;
        // nespawnovat dvě auta ve stejném pruhu těsně u sebe
        for (const o of this.cars) {
            if (o !== c && o.active && o.dir === c.dir && Math.abs(o.s - s) < 40) return;
        }
        const [v0, v1] = c.dir < 0 ? TR.oncomingSpeed : TR.sameSpeed;
        c.speed = v0 + this.rng() * (v1 - v0);
        c.lat = (c.dir < 0 ? TR.laneOncoming : TR.laneSame) + (this.rng() - 0.5) * 0.5;
        c.s = s;
        c.active = true; c.hit = false; c.nearAwarded = false; c.minD = 1e9;
        c.mesh.visible = true;
    }

    update(dt, van, road, running) {
        for (const c of this.cars) {
            if (!c.active) {
                if (van.s < TR.startS) continue;
                c.cool -= dt;
                if (c.cool <= 0) { c.cool = 1 + this.rng() * 3; this._spawn(c, van, road); }
                continue;
            }
            c.s += c.dir * c.speed * dt;
            // zmizí za vozem, moc daleko vpředu, nebo u kontroly (protisměr by projel zátarasem)
            if (c.s < van.s - TR.despawnBehind || c.s > van.s + TR.spawnAhead[1] + 120
                || (c.dir < 0 && this._nearCheckpoint(road, c.s, 30))) {
                c.active = false; c.mesh.visible = false;
                continue;
            }
            const p = road.pointAt(c.s, c.lat);
            c.x = p.x; c.z = p.z;
            c.mesh.position.set(p.x, p.y, p.z);
            c.mesh.rotation.y = road.headingAt(c.s) + (c.dir < 0 ? Math.PI : 0);
            c.mesh.rotation.x = Math.atan(road.slopeAt(c.s)) * (c.dir < 0 ? 1 : -1);

            if (!running) continue;
            // kolize a těsné míjení vůči vozu
            const ds = van.s - c.s, dlat = van.lat - c.lat;
            if (!c.hit && Math.abs(ds) < TR.hitS && Math.abs(dlat) < TR.hitLat) {
                c.hit = true;
                if (this.hooks.onHit) this.hooks.onHit(c);
            }
            if (!c.nearAwarded && !c.hit) {
                if (Math.abs(ds) < 5) c.minD = Math.min(c.minD, Math.abs(dlat));
                if (ds > 5) {
                    c.nearAwarded = true;
                    if (c.minD < TR.nearMissLat && van.speed > CONFIG.score.nearMissSpeed && this.hooks.onNearMiss) {
                        this.hooks.onNearMiss(c);
                    }
                }
            }
        }
    }
}
