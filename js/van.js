// Hymercar 1987 (Fiat Ducato Mk1) — procedurální low-poly model + arkádový drift controller
import * as THREE from 'three';
import { CONFIG, clamp, lerp, wrapAngle } from './config.js';
import { createVanBody } from './physics.js';

const P = CONFIG.physics;

// ---------- model ----------
function mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
        color, roughness: opts.rough ?? 0.75, metalness: opts.metal ?? 0.05,
        flatShading: !!opts.flat, ...opts.extra,
    });
}
function box(w, h, d, m, x, y, z) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    g.position.set(x, y, z);
    g.castShadow = true;
    return g;
}
/**
 * box s volitelně sešikmenou přední/zadní horní hranou (dropFront/dropBack táhne
 * hranu y=+h/2 na z=+-d/2 dolů) a volitelně zaoblenýma levou/pravou horní hranou
 * (bevel táhne hrany x=+-w/2,y=+h/2 dovnitř a dolů) — nízkopoly náhrada za hladkou
 * "half-pipe" klenbu: dá plochý, faset­ovaný "high-top" profil karavanové střechy.
 */
function slantRoof(w, h, d, m, x, y, z, { dropFront = 0, dropBack = 0, bevel = 0 } = {}) {
    // heightSegments=2 (přidá řádek vrcholů v y=0) drží boky svislé a zaoblí/sešikmí
    // jen HORNÍ hranu — jinak by se bevel/drop natáhl přes celou výšku boxu (komolý jehlan)
    const geo = new THREE.BoxGeometry(w, h, d, 1, bevel ? 2 : 1, 1);
    const pos = geo.attributes.position;
    const hh = h / 2, hw = w / 2, hd = d / 2;
    for (let i = 0; i < pos.count; i++) {
        if (Math.abs(pos.getY(i) - hh) < 1e-4) {
            let ny = hh;
            if (dropFront && Math.abs(pos.getZ(i) - hd) < 1e-4) ny -= dropFront;
            if (dropBack && Math.abs(pos.getZ(i) + hd) < 1e-4) ny -= dropBack;
            if (bevel) {
                const sx = Math.sign(pos.getX(i)) || 1;
                pos.setX(i, sx * (hw - bevel));
                ny -= bevel * 0.5;
            }
            pos.setY(i, ny);
        }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    const g = new THREE.Mesh(geo, m);
    g.position.set(x, y, z);
    g.castShadow = true;
    return g;
}

export function buildHymercar() {
    const g = new THREE.Group();
    const cream = mat(0xe4dcc4, { rough: 0.35 });           // krémová karoserie (lak)
    const creamDark = mat(0xcfc4a4, { rough: 0.4 });        // spodní práh / lišty
    const white = mat(0xf1f0ea, { rough: 0.4, flat: true }); // vysoký "high-top" střešní nástavec
    const glass = mat(0x14181f, { rough: 0.15, metal: 0.55, flat: true });
    const black = mat(0x1a1a1d, { rough: 0.65 });
    const grey = mat(0x7d7d82, { rough: 0.5, metal: 0.2 }); // nárazníky/lišty/rack
    const hubM = mat(0xc9c9c2, { rough: 0.35, metal: 0.4, flat: true });
    const tyreM = mat(0x17171a, { rough: 0.9, flat: true });
    const headM = mat(0xfff2c0, { extra: { emissive: 0xffe6a0, emissiveIntensity: 0.9 } });
    const tailM = mat(0xa02a22, { extra: { emissive: 0x7a1810, emissiveIntensity: 0.75 } });
    const amberM = mat(0xd98a2b, { extra: { emissive: 0xa85e10, emissiveIntensity: 0.5 } });
    const plateM = mat(0xf2f2ea, { rough: 0.5 });

    // --- hlavní hull (krémová karoserie, kabina + obytná skříň) ---
    g.add(box(2.05, 1.04, 4.35, cream, 0, 1.10, -0.15));            // hlavní trup
    g.add(box(2.07, 0.1, 4.35, creamDark, 0, 0.60, -0.15));         // spodní práh (přesahuje pod hull — žádná koplanární hrana)

    // --- kapota (krátký, plochý nos Fiat Ducato — jen mírné sešikmení) ---
    g.add(slantRoof(1.95, 0.46, 0.5, cream, 0, 1.15, 2.15, { dropFront: 0.08 }));

    // --- čelní sklo (skloněné) + A-sloupky ---
    const ws = box(1.86, 0.82, 0.06, glass, 0, 1.68, 1.66);
    ws.rotation.x = -0.32;
    g.add(ws);
    g.add(box(0.12, 0.6, 0.3, cream, -0.95, 1.72, 1.75));  // A-sloupky, sahají až k patě střešního náběhu
    g.add(box(0.12, 0.6, 0.3, cream, 0.95, 1.72, 1.75));
    g.add(box(1.8, 0.07, 0.16, black, 0, 1.33, 1.86));     // clona pod sklem — ostřeji odliší kapotu od kabiny

    // --- STŘECHA — jedna souvislá "high-top" hmota (žádná druhá bublina nad kabinou) ---
    // 1) náběh hned za čelním sklem — KRÁTKÝ a strmý (skoro srázný), ne pozvolná rampa:
    //    nízko u A-sloupků (~2.02) -> plná výška (2.66) během ~0.35 m
    g.add(slantRoof(2.08, 1.06, 0.35, white, 0, 2.13, 1.575, { dropFront: 0.64, bevel: 0.18 }));
    // 2) hlavní plochá klenba — svislé boky, zaoblená jen horní hrana (fasetovaně), NE půlkruh
    g.add(slantRoof(2.08, 1.06, 3.2, white, 0, 2.13, -0.2, { bevel: 0.18 }));
    // 3) mírné zúžení těsně před zadní stěnou
    g.add(slantRoof(2.08, 1.06, 0.5, white, 0, 2.13, -2.05, { dropBack: 0.28, bevel: 0.18 }));
    // lišta na švu klenba/hull (schová spáru, dá to hranu)
    g.add(box(2.1, 0.05, 4.35, creamDark, 0, 1.625, -0.15));
    // zvýšené okénko přesně na náběhu (charakteristický detail Hymeru)
    g.add(box(0.4, 0.32, 0.04, glass, 0, 1.9, 1.62));
    // ventilace na střeše
    g.add(box(0.4, 0.06, 0.3, grey, 0.1, 2.6, 1.55));               // poklop nad kabinou (na náběhu)
    g.add(box(0.5, 0.07, 0.35, grey, 0.1, 2.66, -0.4));             // vent na hlavní klenbě
    // střešní ližiny (rack) při zadní části klenby
    g.add(box(0.05, 0.05, 1.5, grey, -0.72, 2.7, -1.05));
    g.add(box(0.05, 0.05, 1.5, grey, 0.72, 2.7, -1.05));

    // --- boční okna ---
    g.add(box(2.08, 0.4, 0.8, glass, 0, 1.38, 1.1));                // přední boční (kabina)
    g.add(box(2.08, 0.38, 1.3, glass, 0, 1.35, -1.05));             // obytné okno
    // zadní okna (naznačují dvoukřídlé dveře)
    g.add(box(0.55, 0.42, 0.04, glass, -0.42, 1.35, -2.33));
    g.add(box(0.55, 0.42, 0.04, glass, 0.42, 1.35, -2.33));
    g.add(box(0.03, 0.9, 0.05, black, 0, 1.15, -2.34));             // spára dveří

    // --- pruh (jeden tenký černý pod okny, jako na předloze) ---
    g.add(box(2.08, 0.07, 4.3, black, 0, 1.24, -0.15));

    // --- maska, světla, nárazníky (nos) ---
    g.add(box(1.5, 0.24, 0.06, black, 0, 1.0, 2.42));               // mřížka
    g.add(box(0.32, 0.15, 0.06, headM, -0.72, 1.05, 2.43));         // světlomety (obdélníkové)
    g.add(box(0.32, 0.15, 0.06, headM, 0.72, 1.05, 2.43));
    g.add(box(0.15, 0.1, 0.05, amberM, -0.95, 0.95, 2.43));         // blinkry
    g.add(box(0.15, 0.1, 0.05, amberM, 0.95, 0.95, 2.43));
    g.add(box(2.05, 0.22, 0.18, grey, 0, 0.55, 2.35));              // přední nárazník
    g.add(box(0.46, 0.13, 0.03, plateM, 0, 0.78, 2.44));            // přední SPZ

    // --- záď ---
    g.add(box(2.05, 0.22, 0.18, grey, 0, 0.55, -2.4));              // zadní nárazník
    g.add(box(0.16, 0.28, 0.05, tailM, -0.85, 1.0, -2.36));         // koncovky
    g.add(box(0.16, 0.28, 0.05, tailM, 0.85, 1.0, -2.36));
    g.add(box(0.46, 0.13, 0.03, plateM, 0, 0.85, -2.35));           // zadní SPZ

    // --- zrcátka ---
    g.add(box(0.06, 0.2, 0.16, black, -1.09, 1.62, 1.55));
    g.add(box(0.06, 0.2, 0.16, black, 1.09, 1.62, 1.55));

    // --- kola ---
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
    const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.28, 8);
    const wheels = [];
    const wPos = [[-0.92, 1.55], [0.92, 1.55], [-0.92, -1.45], [0.92, -1.45]];
    for (let i = 0; i < 4; i++) {
        const grp = new THREE.Group();
        const t = new THREE.Mesh(wheelGeo, tyreM); t.rotation.z = Math.PI / 2; t.castShadow = true;
        const h = new THREE.Mesh(hubGeo, hubM); h.rotation.z = Math.PI / 2;
        const spin = new THREE.Group(); spin.add(t); spin.add(h);
        grp.add(spin);
        grp.position.set(wPos[i][0], 0.36, wPos[i][1]);
        grp.userData.spin = spin;
        grp.userData.front = i < 2;
        g.add(grp);
        wheels.push(grp);
    }

    // vnitřní pivot pro náklon karoserie (kola se nenaklání)
    const bodyTilt = new THREE.Group();
    const bodyParts = [...g.children.filter(c => !wheels.includes(c))];
    for (const c of bodyParts) { g.remove(c); bodyTilt.add(c); }
    g.add(bodyTilt);

    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return { group: g, wheels, bodyTilt };
}

// ---------- controller ----------
export const VanState = { GRIP: 0, DRIFT: 1, RECOVER: 2, SPINOUT: 3, CRASHED: 4, FALLING: 5 };

export class Van {
    constructor(scene) {
        const m = buildHymercar();
        this.mesh = m.group;
        this.wheels = m.wheels;
        this.bodyTilt = m.bodyTilt;
        scene.add(this.mesh);

        const ph = createVanBody(0, 0.95, 4);
        this.body = ph.body;
        this.col = ph.col;

        this.state = VanState.GRIP;
        this.grip = P.gripFactor;
        this.slipDeg = 0;
        this.speed = 0;
        this.vF = 0;
        this.s = 0; this.lat = 0;
        this.visY = 10; this.slope = 0;      // výška a sklon silnice (vizuální vrstva)
        this.steerLat = 0;                   // cílový boční ofset od řízení
        this.driftSign = 0;
        this._pendSign = 0; this._pendT = 0;
        this._recoverT = 0;
        this._spinT = 0;
        this.offroad = false;
        this._offT = 0;
        this._t = 0;
        this.braking = false;
        this.dist = 0;
        this.fallVy = 0;
        this._splashed = false;
        this._pitchQ = new THREE.Quaternion();
        // snapshoty posledních dvou fyzikálních kroků pro interpolované vykreslení
        this._snapA = { x: 0, y: 0.95, z: 4, visY: 10, q: new THREE.Quaternion() };
        this._snapB = { x: 0, y: 0.95, z: 4, visY: 10, q: new THREE.Quaternion() };
        this._yawRate = 0;
    }

    reset() {
        this.body.setTranslation({ x: 0, y: 0.95, z: 4 }, true);
        this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        if (this.body.setEnabledRotations) this.body.setEnabledRotations(false, true, false, true);
        this.state = VanState.GRIP;
        this.grip = P.gripFactor;
        this.driftSign = 0; this._pendT = 0; this._recoverT = 0; this._spinT = 0;
        this._offT = 0; this.offroad = false; this.dist = 0; this.slipDeg = 0; this.speed = 0;
        this.steerLat = 0; this.visY = 10; this.slope = 0;
        this.fallVy = 0; this._splashed = false;
    }

    get yaw() {
        const q = this.body.rotation();
        const fx = 2 * (q.x * q.z + q.w * q.y);
        const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
        return Math.atan2(fx, fz);
    }
    get pos() { return this.body.translation(); }

    crash() {
        this.state = VanState.CRASHED;
        if (this.body.setEnabledRotations) this.body.setEnabledRotations(true, true, true, true);
        this.body.applyTorqueImpulse({ x: 40 + Math.random() * 60, y: (Math.random() - 0.5) * 120, z: 40 + Math.random() * 60 }, true);
        this.body.applyImpulse({ x: 0, y: 55, z: 0 }, true);
    }

    /** utržení přes hranu útesu — vůz letí do moře; (outX,outZ) = jednotkový směr od silnice k moři */
    startFall(outX, outZ) {
        if (this.state === VanState.FALLING || this.state === VanState.CRASHED) return;
        this.state = VanState.FALLING;
        this.fallVy = 2.4;                     // malý odskok přes hranu
        this._splashed = false;
        if (this.body.setEnabledRotations) this.body.setEnabledRotations(true, true, true, true);
        // zaruč odlet od stěny útesu (spodek stěny je dál v moři než hrana)
        const v = this.body.linvel();
        const out = v.x * outX + v.z * outZ;
        if (out < 6) this.body.setLinvel({ x: v.x + outX * (6 - out), y: 0, z: v.z + outZ * (6 - out) }, true);
        this.body.applyTorqueImpulse({ x: 25, y: (Math.random() - 0.5) * 30, z: -35 }, true);
    }

    /** hlavní krok controlleru; input = {drift:boolean, steer:-1..1} */
    update(dt, input, road) {
        this._t += dt;
        const held = input.drift;
        const steer = input.steer || 0;
        if (this.state === VanState.CRASHED) { this._snapshot(); return; }
        if (this.state === VanState.FALLING) {
            if (!this._splashed) {
                this.fallVy -= 9.81 * dt;
                this.visY += this.fallVy * dt;
                if (this.visY <= 0.1) {
                    this._splashed = true;
                    const v = this.body.linvel();
                    this.body.setLinvel({ x: v.x * 0.25, y: 0, z: v.z * 0.25 }, true); // voda zabrzdí
                    if (this.onSplash) this.onSplash();
                }
            } else {
                this.visY = Math.max(-1.7, this.visY - 0.8 * dt); // pomalé potopení
            }
            this.speed = Math.hypot(this.body.linvel().x, this.body.linvel().z);
            this._snapshot();
            return;
        }

        const p = this.pos;
        const yaw = this.yaw;
        const v = this.body.linvel();

        const proj = road.project(p.x, p.z);
        this.s = proj.s; this.lat = proj.lat;
        this.visY = proj.y; this.slope = proj.slope;

        // řízení: šipky posouvají cílovou stopu, po puštění drží pozici (bez auto-rovnání do středu)
        this.steerLat = clamp(this.steerLat + steer * P.steerLatRate * dt, -P.steerLatMax, P.steerLatMax);
        const look = Math.max(P.lookaheadMin, Math.abs(this.vF) * P.lookaheadT);
        const kAhead = road.kappaAt(this.s + look);
        const kNow = proj.kappa;

        // rozklad rychlosti do rámce vozu
        const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
        let vF = v.x * sinY + v.z * cosY;
        let vL = v.x * cosY - v.z * sinY;
        const speedMag = Math.hypot(v.x, v.z);

        // slip
        this.slipDeg = speedMag > 2 ? wrapAngle(Math.atan2(v.x, v.z) - yaw) * 180 / Math.PI : 0;
        const slipRad = this.slipDeg * Math.PI / 180;

        // --- stavový automat ---
        if (this.state === VanState.SPINOUT) {
            this._spinT -= dt;
            if (this._spinT <= 0) { this.state = VanState.RECOVER; this._recoverT = 0; }
        } else if (held && (this.state === VanState.GRIP || this.state === VanState.RECOVER)) {
            this.state = VanState.DRIFT;
        } else if (!held && this.state === VanState.DRIFT) {
            this.state = VanState.RECOVER; this._recoverT = 0;
        }
        if (this.state === VanState.RECOVER) {
            this._recoverT += dt;
            if (Math.abs(this.slipDeg) < 6 && this._recoverT > 0.2) this.state = VanState.GRIP;
        }

        // hystereze směru driftu
        const sgnA = Math.abs(kAhead) > P.kappaHyst ? Math.sign(kAhead) : 0;
        if (sgnA !== 0 && sgnA !== this.driftSign) {
            if (this._pendSign === sgnA) { this._pendT += dt; if (this._pendT > P.hystTime) { this.driftSign = sgnA; this._pendT = 0; } }
            else { this._pendSign = sgnA; this._pendT = 0; }
        }
        if (this.driftSign === 0 && sgnA !== 0) this.driftSign = sgnA;

        const straightAhead = Math.abs(kAhead) < P.kappaStraight && Math.abs(kNow) < P.kappaStraight;
        this.braking = this.state === VanState.DRIFT && straightAhead;

        // --- podélná rychlost (auto-plyn) ---
        const cruise = P.cruiseBase + Math.min(P.cruiseBonusMax, this.dist / 1000 * P.cruiseBonusPerKm);
        let target, gain;
        if (this.braking) { target = P.brakeTarget; gain = P.brakeGain; }
        else if (this.state === VanState.SPINOUT) { target = P.spinoutSpeed; gain = 2; }
        else {
            const slow = clamp(1 - Math.abs(kAhead) * P.cornerSlowK, P.cornerSlowMin, 1);
            target = cruise * slow; gain = P.accelGain;
        }
        vF += (target - vF) * Math.min(1, gain * dt);

        // --- off-road ---
        this.offroad = Math.abs(this.lat) > P.offroadLat;
        if (this.offroad) {
            vF *= Math.pow(P.offroadDrag, dt);
            this._offT += dt;
            if (this._offT > P.offroadTime && this.state !== VanState.SPINOUT) {
                this.state = VanState.SPINOUT; this._spinT = P.spinoutTime;
                if (this.onSpinout) this.onSpinout();
            }
        } else this._offT = Math.max(0, this._offT - dt * 2);

        // --- grip / boční útlum ---
        const gTarget = this.state === VanState.DRIFT ? P.driftFactor
            : this.state === VanState.SPINOUT ? 0.99
            : P.gripFactor;
        this.grip += (gTarget - this.grip) * Math.min(1, P.gripLerp * dt);
        vL *= Math.pow(this.grip, dt * 60);

        // --- řízení (yaw rate) ---
        let yr;
        const latErr = this.lat - this.steerLat; // odchylka od zvolené stopy
        if (this.state === VanState.SPINOUT) {
            yr = this.body.angvel().y * 0.98;
        } else if (this.state === VanState.DRIFT && !this.braking) {
            const mag = Math.max(Math.abs(kNow), Math.abs(kAhead), P.driftKappaMin);
            yr = this.driftSign * mag * Math.max(vF, 8) * P.driftSteerMul;
            yr += steer * P.steerDriftBias * clamp(vF / 20, 0, 1); // řízení ovlivňuje smyk
        } else if (this.braking) {
            yr = kNow * vF + Math.sin(this._t * P.fishtailFreq) * P.fishtailAmp * clamp(vF / 15, 0, 1);
            yr += steer * P.steerDriftBias * 0.8;
        } else {
            const headingTarget = proj.heading + clamp(-latErr * P.latCorr, -P.latCorrMax, P.latCorrMax);
            const err = wrapAngle(headingTarget - yaw);
            yr = kNow * vF + P.kP * err;
            if (this.state === VanState.RECOVER) yr -= P.kSlip * slipRad;
        }
        const w = this.body.angvel().y;
        const wNew = w + (yr - w) * Math.min(1, P.steerResponse * dt);
        this.body.setAngvel({ x: 0, y: wNew, z: 0 }, true);

        // --- zápis rychlosti zpět ---
        const nvx = sinY * vF + cosY * vL;
        const nvz = cosY * vF - sinY * vL;
        this.body.setLinvel({ x: nvx, y: 0, z: nvz }, true);
        if (Math.abs(p.y - 0.95) > 0.02) this.body.setTranslation({ x: p.x, y: 0.95, z: p.z }, true);

        this.vF = vF;
        this.speed = speedMag;
        this.dist += Math.max(0, vF) * dt;

        this._snapshot(wNew);
    }

    /** ulož stav fyzikálního kroku pro interpolované vykreslení */
    _snapshot(yawRate = 0) {
        const p = this.pos, q = this.body.rotation();
        const A = this._snapA, B = this._snapB;
        A.x = B.x; A.y = B.y; A.z = B.z; A.visY = B.visY; A.q.copy(B.q);
        B.x = p.x; B.y = p.y; B.z = p.z; B.visY = this.visY; B.q.set(q.x, q.y, q.z, q.w);
        this._yawRate = yawRate;
    }

    /** srovná oba snapshoty na aktuální stav (start / restart, žádné doklouzání) */
    snapNow() {
        this._snapshot(this._yawRate);
        this._snapshot(this._yawRate);
    }

    /** per-frame vykreslení; alpha = poloha mezi posledními dvěma fyzikálními kroky */
    render(alpha, dt) {
        const A = this._snapA, B = this._snapB;
        // výška silnice je vizuální vrstva nad plochou fyzikou
        this.mesh.position.set(
            lerp(A.x, B.x, alpha),
            lerp(A.y, B.y, alpha) - 0.95 + lerp(A.visY, B.visY, alpha),
            lerp(A.z, B.z, alpha));
        this.mesh.quaternion.copy(A.q).slerp(B.q, alpha);
        const wrecked = this.state === VanState.CRASHED || this.state === VanState.FALLING;
        if (!wrecked) {
            // sklon silnice -> podélný náklon celého vozu
            const pitch = -Math.atan(this.slope);
            this._pitchQ.setFromAxisAngle({ x: 1, y: 0, z: 0 }, pitch);
            this.mesh.quaternion.multiply(this._pitchQ);

            // náklon karoserie do smyku + houpání
            const slipRad = this.slipDeg * Math.PI / 180;
            const roll = clamp(-slipRad * 0.45, -0.16, 0.16) + Math.sin(this._t * 7) * 0.006 * clamp(this.vF / 20, 0, 1);
            const pitchB = clamp(-(this.braking ? 0.06 : 0), -0.08, 0.05);
            this.bodyTilt.rotation.z += (roll - this.bodyTilt.rotation.z) * Math.min(1, dt * 8);
            this.bodyTilt.rotation.x += (pitchB - this.bodyTilt.rotation.x) * Math.min(1, dt * 6);
            // kola
            const steer = clamp(this._yawRate * 0.28, -0.45, 0.45);
            for (const wgrp of this.wheels) {
                wgrp.userData.spin.rotation.x += this.vF * dt / 0.36;
                if (wgrp.userData.front) wgrp.rotation.y += (steer - wgrp.rotation.y) * Math.min(1, dt * 10);
            }
        }
    }

    /** světové pozice zadních kol (pro stopy pneumatik) */
    rearWheelPos(out0, out1) {
        const yaw = this.yaw, p = this.pos;
        const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
        const bx = -sinY * 1.45, bz = -cosY * 1.45;
        out0.set(p.x + bx + cosY * 0.92, this.visY + 0.06, p.z + bz - sinY * 0.92);
        out1.set(p.x + bx - cosY * 0.92, this.visY + 0.06, p.z + bz + sinY * 0.92);
    }
}
