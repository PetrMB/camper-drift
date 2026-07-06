// Rendering pipeline, obloha + parallax hřebeny, chase kamera, částice, stopy pneumatik
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG, clamp, lerp, makeRng } from './config.js';
import { biomeMix, lerpColor } from './biomes.js';

const CC = CONFIG.cam;

export function setupRenderer(canvas, quality) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias, powerPreference: 'high-performance' });
    renderer.setPixelRatio(quality.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    return renderer;
}

export function setupComposer(renderer, scene, camera, quality) {
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const size = new THREE.Vector2(window.innerWidth * quality.bloomScale, window.innerHeight * quality.bloomScale);
    const bloom = new UnrealBloomPass(size, 0.35, 0.6, 0.85);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    return { composer, bloom };
}

// ---------- obloha (gradient dome) + slunce ----------
export class Sky {
    constructor(scene) {
        const geo = new THREE.SphereGeometry(460, 24, 12);
        this.uniforms = {
            top: { value: new THREE.Color(0x6fb4f5) },
            mid: { value: new THREE.Color(0xbfe0ff) },
            bot: { value: new THREE.Color(0xffeccb) },
        };
        const mat = new THREE.ShaderMaterial({
            side: THREE.BackSide, fog: false, depthWrite: false,
            uniforms: this.uniforms,
            vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
            fragmentShader: `
                uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
                void main(){
                    float h = normalize(vP).y;
                    vec3 c = h > 0.15 ? mix(mid, top, smoothstep(0.15, 0.7, h))
                                      : mix(bot, mid, smoothstep(-0.08, 0.15, h));
                    gl_FragColor = vec4(c, 1.0);
                }`,
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.renderOrder = -10;
        scene.add(this.mesh);

        // sluneční kotouč (žhne v bloomu)
        this.sunBall = new THREE.Mesh(
            new THREE.SphereGeometry(14, 12, 12),
            new THREE.MeshBasicMaterial({ color: 0xfff2d0, fog: false })
        );
        scene.add(this.sunBall);
    }
    update(s, camPos, sunDir) {
        const { a, b, t } = biomeMix(s);
        lerpColor(this.uniforms.top.value, a.sky[0], b.sky[0], t);
        lerpColor(this.uniforms.mid.value, a.sky[1], b.sky[1], t);
        lerpColor(this.uniforms.bot.value, a.sky[2], b.sky[2], t);
        this.mesh.position.copy(camPos);
        this.sunBall.position.copy(camPos).addScaledVector(sunDir, 420);
    }
}

// ---------- parallax hřebeny hor (prstence kolem kamery) ----------
export class Ridges {
    constructor(scene) {
        this.layers = [];
        const rng = makeRng(4242);
        const defs = [
            { r: 170, h: 26, seg: 90, par: 0.28 },
            { r: 280, h: 46, seg: 90, par: 0.12 },
            { r: 400, h: 78, seg: 80, par: 0.05 },
        ];
        for (const d of defs) {
            const geo = this._ring(d.r, d.h, d.seg, rng);
            const mat = new THREE.MeshBasicMaterial({ color: 0x88a8c8, fog: false, transparent: true, opacity: 1 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.renderOrder = -5;
            scene.add(mesh);
            this.layers.push({ mesh, par: d.par });
        }
    }
    _ring(radius, height, segs, rng) {
        // pás: spodní kruh na y=-6, horní zubatý okraj
        const pos = [], idx = [];
        const heights = [];
        for (let i = 0; i < segs; i++) {
            const f = i / segs * Math.PI * 2;
            heights.push(height * (0.35 + 0.65 * Math.abs(
                Math.sin(f * 3 + rng() * 0.5) * 0.6 + Math.sin(f * 7 + rng()) * 0.3 + Math.sin(f * 13) * 0.15
            )));
        }
        for (let i = 0; i <= segs; i++) {
            const ii = i % segs;
            const a = i / segs * Math.PI * 2;
            const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
            pos.push(x, -8, z);
            pos.push(x, heights[ii], z);
            if (i < segs) {
                const b = i * 2;
                idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        return g;
    }
    update(s, camPos, travelS) {
        const { a, b, t } = biomeMix(s);
        for (let i = 0; i < 3; i++) {
            const L = this.layers[i];
            lerpColor(L.mesh.material.color, a.ridge[i], b.ridge[i], t);
            L.mesh.position.set(camPos.x, 0, camPos.z);
            L.mesh.rotation.y = travelS * 0.0016 * (i + 1) * L.par * 8; // pomalé sunutí = parallax
        }
    }
}

// ---------- chase kamera ----------
export class CameraRig {
    constructor(camera) {
        this.cam = camera;
        this.pos = new THREE.Vector3(0, CC.height, -CC.dist);
        this.look = new THREE.Vector3();
        this.shakeT = 0;
        this.fovExtra = 0;
    }
    snapTo(van) {
        const yaw = van.yaw, p = van.pos;
        this.pos.set(p.x - Math.sin(yaw) * CC.dist, (van.visY || 0) + CC.height, p.z - Math.cos(yaw) * CC.dist);
    }
    update(dt, van, timeScale) {
        const yaw = van.yaw, p = van.pos;
        const roadY = van.visY || 0;
        const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
        const slip = van.slipDeg / 180 * Math.PI;
        // cíl: za vozem + boční offset proti smyku (drift čitelný z boku)
        const latOff = clamp(slip * 60 * CC.driftLag, -2.2, 2.2);
        const tx = p.x - sinY * CC.dist + cosY * latOff;
        const tz = p.z - cosY * CC.dist - sinY * latOff;
        const k = Math.min(1, CC.spring * dt);
        this.pos.x += (tx - this.pos.x) * k;
        this.pos.z += (tz - this.pos.z) * k;
        // výška sleduje silnici měkčí pružinou -> na hřebenech kamera "plave"
        this.pos.y += (roadY + CC.height - this.pos.y) * Math.min(1, CC.ySpring * dt);

        this.shakeT += dt * 30;
        const sh = CC.shake * clamp(Math.abs(van.slipDeg) / 30, 0, 1) * clamp(van.speed / 20, 0, 1);
        const shx = (Math.sin(this.shakeT * 1.3) + Math.sin(this.shakeT * 2.7)) * 0.5 * sh;
        const shy = (Math.sin(this.shakeT * 1.7) + Math.sin(this.shakeT * 3.1)) * 0.5 * sh;

        this.cam.position.set(this.pos.x + shx, this.pos.y + shy, this.pos.z);
        this.look.set(p.x + sinY * CC.lookAhead, roadY + CC.lookUp, p.z + cosY * CC.lookAhead);
        this.cam.lookAt(this.look);

        const speedNorm = clamp(van.speed / 28, 0, 1);
        const drift = Math.abs(van.slipDeg) > 12 ? CC.fovDrift : 0;
        const slow = timeScale < 0.95 ? CC.fovSlowmo : 0;
        const fovT = CC.fovBase + CC.fovSpeed * speedNorm + drift + slow;
        this.cam.fov += (fovT - this.cam.fov) * Math.min(1, dt * 5);
        this.cam.updateProjectionMatrix();
    }
}

// ---------- částice (kouř / prach / konfety) ----------
let _dotTex = null;
function dotTexture() {
    if (_dotTex) return _dotTex;
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(16, 16, 2, 16, 16, 15);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    _dotTex = new THREE.CanvasTexture(c);
    return _dotTex;
}

export class Particles {
    constructor(scene, count, size, opts = {}) {
        this.count = count;
        this.pos = new Float32Array(count * 3);
        this.col = new Float32Array(count * 3);
        this.vel = new Float32Array(count * 3);
        this.life = new Float32Array(count);
        this.maxLife = new Float32Array(count);
        this.head = 0;
        for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -100;

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
        this.points = new THREE.Points(geo, new THREE.PointsMaterial({
            size, vertexColors: true, transparent: true, opacity: opts.opacity ?? 0.55,
            depthWrite: false, sizeAttenuation: true, map: dotTexture(),
        }));
        this.points.frustumCulled = false;
        this.gravity = opts.gravity ?? 0;
        scene.add(this.points);
    }
    spawn(x, y, z, vx, vy, vz, life, r, g, b) {
        const i = this.head; this.head = (this.head + 1) % this.count;
        this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
        this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
        this.life[i] = life; this.maxLife[i] = life;
        this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    }
    update(dt) {
        for (let i = 0; i < this.count; i++) {
            if (this.life[i] <= 0) continue;
            this.life[i] -= dt;
            if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -100; continue; }
            this.vel[i * 3 + 1] += this.gravity * dt;
            this.pos[i * 3] += this.vel[i * 3] * dt;
            this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
            this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
        }
        this.points.geometry.attributes.position.needsUpdate = true;
        this.points.geometry.attributes.color.needsUpdate = true;
    }
}

// ---------- stopy pneumatik (nezávislé quady, ring buffer) ----------
export class TireMarks {
    constructor(scene, segments) {
        this.n = segments;
        this.pos = new Float32Array(segments * 6 * 3); // 6 vrcholů (2 trojúhelníky) na segment
        this.head = 0;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
        this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: 0x16161a, transparent: true, opacity: 0.32, depthWrite: false,
        }));
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 1;
        scene.add(this.mesh);
        this._lastL = new THREE.Vector3();
        this._lastR = new THREE.Vector3();
        this._has = false;
        this.reset();
    }
    add(l, r, drifting) {
        if (!drifting) { this._has = false; return; }
        if (!this._has) { this._lastL.copy(l); this._lastR.copy(r); this._has = true; return; }
        if (this._lastL.distanceToSquared(l) < 0.09) return;
        const o = this.head * 18; this.head = (this.head + 1) % this.n;
        const set = (k, v) => { this.pos[o + k] = v.x; this.pos[o + k + 1] = v.y; this.pos[o + k + 2] = v.z; };
        // quad: lastL, lastR, L / lastR, R, L
        set(0, this._lastL); set(3, this._lastR); set(6, l);
        set(9, this._lastR); set(12, r); set(15, l);
        this._lastL.copy(l); this._lastR.copy(r);
        this.mesh.geometry.attributes.position.needsUpdate = true;
    }
    reset() {
        for (let i = 0; i < this.pos.length; i += 3) this.pos[i + 1] = -100;
        this._has = false;
        this.mesh.geometry.attributes.position.needsUpdate = true;
    }
}
