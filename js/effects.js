// Rendering pipeline, obloha + parallax hřebeny, chase kamera, částice, stopy pneumatik
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
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
    const PP = CONFIG.post;
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const size = new THREE.Vector2(window.innerWidth * quality.bloomScale, window.innerHeight * quality.bloomScale);
    const bloom = new UnrealBloomPass(size, PP.bloomStrength, PP.bloomRadius, PP.bloomThreshold);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    // grading pass AŽ ZA OutputPassem: composer běží nad lineárním HDR bufferem (HalfFloat
    // render target) a teprve OutputPass dělá ACES tonemapping + sRGB konverzi. Kontrast/vinětace/
    // aberace jsou definované pro zobrazovací (0..1, gamma) prostor — zkoušelo se vložit tento pass
    // před OutputPass dle původního zadání, ale kontrast s pivotem 0.5 aplikovaný na lineární HDR
    // hodnoty (noční obloha ~0.02-0.05) drasticky propaloval stíny do černé (ověřeno screenshoty).
    // Za OutputPassem pracuje nad už vyladěným obrazem stejně jako typický LUT/vignette v enginu.
    const grading = new GradingPass();
    composer.addPass(grading);
    return { composer, bloom, grading };
}

// ---------- grading pass — kontrast/saturace/vinětace/chromatická aberace ----------
// Poslední fullscreen ShaderPass, za OutputPassem — pracuje nad finálním tonemapovaným
// a sRGB-zakódovaným obrazem (viz komentář v setupComposer výše), takže hodnoty v CONFIG.post
// (kontrast kolem pivotu 0.5 apod.) odpovídají běžnému zobrazovacímu rozsahu 0..1.
const GradingShader = {
    name: 'GradingShader',
    uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uContrast: { value: CONFIG.post.contrast },
        uSaturation: { value: CONFIG.post.saturation },
        uVignette: { value: CONFIG.post.vignette },
        uVignetteRadius: { value: CONFIG.post.vignetteRadius },
        uVignetteSoftness: { value: CONFIG.post.vignetteSoftness },
        uAberration: { value: CONFIG.post.aberrationPx },
        uAberrationStart: { value: CONFIG.post.aberrationStart },
        uShadowTint: { value: new THREE.Vector3(0, 0, 0) },
        uTintAmount: { value: CONFIG.post.tintAmount },
        uSpeed: { value: 0 },                                        // 0..1, viz main.js
        uSpeedContrastBoost: { value: CONFIG.post.speedContrastBoost },
        uSpeedAberrationPx: { value: CONFIG.post.speedAberrationPx },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 uResolution;
        uniform float uContrast;
        uniform float uSaturation;
        uniform float uVignette;
        uniform float uVignetteRadius;
        uniform float uVignetteSoftness;
        uniform float uAberration;
        uniform float uAberrationStart;
        uniform vec3 uShadowTint;
        uniform float uTintAmount;
        uniform float uSpeed;
        uniform float uSpeedContrastBoost;
        uniform float uSpeedAberrationPx;
        varying vec2 vUv;

        void main() {
            vec2 uv = vUv;
            vec2 toCenter = uv - 0.5;
            float rawDist = length(toCenter);           // 0 (střed) .. ~0.7071 (roh)
            float dist = rawDist * 1.41421356;           // normalizováno na 0..1 (roh = 1.0)
            vec2 dir = rawDist > 0.0001 ? toCenter / rawDist : vec2(0.0);

            // --- chromatická aberace: R/B kanály se rozestoupí od středu, roste s dist a rychlostí ---
            float edgeT = smoothstep(uAberrationStart, 1.0, dist);
            float aberPx = (uAberration + uSpeed * uSpeedAberrationPx) * edgeT;
            vec2 off = dir * (aberPx / uResolution);
            vec4 baseCol = texture2D(tDiffuse, uv);
            float r = texture2D(tDiffuse, uv + off).r;
            float g = baseCol.g;
            float b = texture2D(tDiffuse, uv - off).b;
            vec3 color = vec3(r, g, b);

            // --- kontrast kolem pivotu 0.5, mírně zesílený při vysoké rychlosti ---
            float contrast = uContrast + uSpeed * uSpeedContrastBoost;
            color = (color - 0.5) * contrast + 0.5;

            // --- saturace, luma-preserving ---
            float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
            color = mix(vec3(luma), color, uSaturation);

            // --- jemný teplotní nádech stínů podle denní doby (modrá v noci, teplá za soumraku) ---
            float shadowMask = 1.0 - smoothstep(0.0, 0.45, luma);
            color += uShadowTint * shadowMask * uTintAmount;

            // --- měkká vinětace jen v rozích, čistý střed = silnice zůstává čitelná ---
            float vig = 1.0 - uVignette * smoothstep(uVignetteRadius, uVignetteRadius + uVignetteSoftness, dist);
            color *= vig;

            gl_FragColor = vec4(max(color, 0.0), baseCol.a);
        }`,
};

export class GradingPass extends ShaderPass {
    constructor() {
        super(GradingShader);
        this._tintNight = new THREE.Vector3(...CONFIG.post.tintNight);
        this._tintWarm = new THREE.Vector3(...CONFIG.post.tintWarm);
    }
    // render target (a tedy i texel) je vždy o velikosti skutečného framebufferu — composer
    // volá setSize při vytvoření i při resize, takže px->uv převod v shaderu zůstává přesný
    setSize(width, height) {
        this.uniforms.uResolution.value.set(width, height);
    }
    // nádech stínů podle denní doby — volá se z hlavní smyčky (main.js) s ujetou vzdáleností s,
    // stejně jako Sky.update/Ridges.update; při neznámé/neutrální denní době zůstává nádech nulový
    update(s) {
        const { a, b, t } = biomeMix(s);
        const nightOf = biome => biome.name === 'NOC' ? 1 : 0;
        const warmOf = biome => (biome.name === 'ZÁPAD SLUNCE' || biome.name === 'RÁNO') ? 1 : 0;
        const night = lerp(nightOf(a), nightOf(b), t);
        const warm = lerp(warmOf(a), warmOf(b), t);
        this.uniforms.uShadowTint.value.set(0, 0, 0)
            .addScaledVector(this._tintNight, night)
            .addScaledVector(this._tintWarm, warm);
    }
}

// ---------- textury pro slunce/měsíc/hvězdy (měkký glow, ostřejší jádro) ----------
let _glowTex = null;
function glowTexture() {
    if (_glowTex) return _glowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    _glowTex = new THREE.CanvasTexture(c);
    return _glowTex;
}
let _coreTex = null;
function coreTexture() {
    if (_coreTex) return _coreTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    _coreTex = new THREE.CanvasTexture(c);
    return _coreTex;
}

// ---------- obloha (gradient dome) + slunce/měsíc/hvězdy/lens flare ----------
export class Sky {
    constructor(scene, quality) {
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

        // sluneční kotouč: jádro + měkký glow (žhne v bloomu), velikost/barva podle výšky
        this.sunColor = new THREE.Color(0xfff2d0);
        this.sunCore = new THREE.Sprite(new THREE.SpriteMaterial({
            map: coreTexture(), color: 0xfff2d0, fog: false, depthWrite: false, transparent: true,
        }));
        this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTexture(), color: 0xffb060, fog: false, depthWrite: false, transparent: true,
            blending: THREE.AdditiveBlending,
        }));
        scene.add(this.sunGlow);
        scene.add(this.sunCore);

        // měsíc: jádro + glow — sdílí pozici jediného směrového světla, viditelný jen v noci
        this.moonCore = new THREE.Sprite(new THREE.SpriteMaterial({
            map: coreTexture(), color: 0xdfe6ff, fog: false, depthWrite: false, transparent: true,
        }));
        this.moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTexture(), color: 0x8fa0e0, fog: false, depthWrite: false, transparent: true,
            blending: THREE.AdditiveBlending,
        }));
        scene.add(this.moonGlow);
        scene.add(this.moonCore);

        // lens flare — sprite prvky na ose slunce->střed obrazu, additivní, bez depth testu.
        // Studenější/kontrastnější barva než teplá obloha, ať je efekt čitelný i za západu.
        const SK = CONFIG.sky;
        this.flares = SK.flareOffsets.map(() => {
            const spr = new THREE.Sprite(new THREE.SpriteMaterial({
                map: glowTexture(), color: SK.flareColor, fog: false, depthTest: false, depthWrite: false,
                transparent: true, blending: THREE.AdditiveBlending, opacity: 0,
            }));
            spr.renderOrder = 20;
            scene.add(spr);
            return spr;
        });
        // horizontální anamorfní "streak" přes sluneční kotouč — čitelný NFS-style prvek.
        // Sedí přímo na pozici slunce (ne blízko kamery jako flare řetěz), proto depthTest necháváme
        // zapnutý — schová se stejně jako kotouč, když je slunce za terénem/hřebeny.
        this.streak = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTexture(), color: SK.flareColor, fog: false, depthWrite: false,
            transparent: true, blending: THREE.AdditiveBlending, opacity: 0,
        }));
        this.streak.renderOrder = 20;
        scene.add(this.streak);

        // hvězdy — Points na kopuli oblohy, jemné blikání (per-vertex twinkle v shaderu)
        const starCount = quality?.stars ?? 500;
        const rng = makeRng(1337);
        const pos = new Float32Array(starCount * 3);
        const seed = new Float32Array(starCount);
        const size = new Float32Array(starCount);
        for (let i = 0; i < starCount; i++) {
            const u = rng(), v = rng();
            const theta = u * Math.PI * 2;
            const phi = Math.acos(1 - v * 0.9); // víc hvězd u zenitu, řídne u obzoru
            const r = SK.starRadius;
            pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            pos[i * 3 + 1] = r * Math.cos(phi);
            pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
            seed[i] = rng() * 10;
            size[i] = 1.1 + rng() * 2.2;
        }
        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        starGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
        starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
        this.starUniforms = { uTime: { value: 0 }, uOpacity: { value: 0 } };
        const starMat = new THREE.ShaderMaterial({
            uniforms: this.starUniforms, transparent: true, depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexShader: `
                attribute float aSeed; attribute float aSize;
                uniform float uTime;
                varying float vTw;
                void main(){
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mv;
                    vTw = 0.5 + 0.5 * sin(uTime * (1.2 + aSeed * 0.3) + aSeed * 7.0);
                    gl_PointSize = aSize * (300.0 / -mv.z);
                }`,
            fragmentShader: `
                uniform float uOpacity;
                varying float vTw;
                void main(){
                    vec2 uv = gl_PointCoord - 0.5;
                    float d = length(uv);
                    float a = smoothstep(0.5, 0.0, d);
                    if (a <= 0.01) discard;
                    gl_FragColor = vec4(1.0, 1.0, 1.0, a * (0.4 + 0.6 * vTw) * uOpacity);
                }`,
        });
        this.stars = new THREE.Points(starGeo, starMat);
        this.stars.frustumCulled = false;
        this.stars.renderOrder = -9;
        scene.add(this.stars);

        this._fwd = new THREE.Vector3();
        this._ndc = new THREE.Vector3();
        this._rayPt = new THREE.Vector3();
        this._dir = new THREE.Vector3();
        this._sunWorld = new THREE.Vector3();
    }
    update(s, camera, sunDir) {
        const camPos = camera.position;
        const { a, b, t } = biomeMix(s);
        lerpColor(this.uniforms.top.value, a.sky[0], b.sky[0], t);
        lerpColor(this.uniforms.mid.value, a.sky[1], b.sky[1], t);
        lerpColor(this.uniforms.bot.value, a.sky[2], b.sky[2], t);
        this.mesh.position.copy(camPos);

        // noční váha (0 = den, 1 = plná noc) — plynule prolíná hvězdy/měsíc/slunce
        const nightOf = biome => biome.name === 'NOC' ? 1 : 0;
        const night = lerp(nightOf(a), nightOf(b), t);
        const sunVis = 1 - night;

        this._sunWorld.copy(camPos).addScaledVector(sunDir, 420);

        // velikost slunce podle výšky nad obzorem (nízko = velké oranžové, vysoko = menší bílé)
        const SK = CONFIG.sky;
        const heightN = clamp((sunDir.y - SK.sunHeightMin) / (SK.sunHeightMax - SK.sunHeightMin), 0, 1);
        const coreSize = lerp(SK.sunSizeLow, SK.sunSizeHigh, heightN);
        const glowSize = lerp(SK.sunGlowLow, SK.sunGlowHigh, heightN);
        lerpColor(this.sunColor, a.sun, b.sun, t);

        // boost jádra škáluje s výškou slunce — nízko (západ) zůstává sytě oranžové, jen
        // vysoko na obloze (poledne) je jádro jasnější/bělejší, aby se po tonemappingu nevypralo do bíla
        const coreBoost = lerp(SK.sunCoreBoostLow, SK.sunCoreBoostHigh, heightN);
        this.sunCore.position.copy(this._sunWorld);
        this.sunCore.scale.setScalar(coreSize);
        this.sunCore.material.color.copy(this.sunColor).multiplyScalar(coreBoost);
        this.sunCore.material.opacity = sunVis;
        this.sunGlow.position.copy(this._sunWorld);
        this.sunGlow.scale.setScalar(glowSize);
        this.sunGlow.material.color.copy(this.sunColor).multiplyScalar(1.15);
        // nízko nad obzorem slabší glow, ať additivní součet s jádrem nepřepálí kotouč do běla
        this.sunGlow.material.opacity = lerp(0.38, 0.6, heightN) * sunVis;

        // měsíc + hvězdy — mizí/objevují se plynule s noční váhou
        this.moonCore.position.copy(this._sunWorld);
        this.moonCore.scale.setScalar(SK.moonSize);
        this.moonCore.material.opacity = night;
        this.moonGlow.position.copy(this._sunWorld);
        this.moonGlow.scale.setScalar(SK.moonGlowSize);
        this.moonGlow.material.opacity = 0.5 * night;

        this.stars.position.copy(camPos);
        this.starUniforms.uTime.value = performance.now() * 0.001;
        this.starUniforms.uOpacity.value = night;

        // lens flare — jen když je slunce před kamerou a v rozumné blízkosti středu záběru
        camera.getWorldDirection(this._fwd);
        const facing = this._fwd.dot(sunDir);
        this._ndc.copy(this._sunWorld).project(camera);
        const offAxis = Math.hypot(this._ndc.x, this._ndc.y);
        const edgeFade = clamp(1 - (offAxis - 0.85) / 0.5, 0, 1);
        const flareStrength = facing > 0.05 ? edgeFade * sunVis * clamp(facing, 0, 1) : 0;

        for (let i = 0; i < this.flares.length; i++) {
            const spr = this.flares[i];
            if (flareStrength <= 0.001) { spr.material.opacity = 0; continue; }
            const ft = SK.flareOffsets[i];
            const fx = this._ndc.x * (1 - ft), fy = this._ndc.y * (1 - ft);
            this._rayPt.set(fx, fy, 0.5).unproject(camera);
            this._dir.copy(this._rayPt).sub(camPos).normalize();
            spr.position.copy(camPos).addScaledVector(this._dir, 6 + ft * 10);
            spr.scale.setScalar(SK.flareSizes[i]);
            spr.material.opacity = SK.flareOpac[i] * flareStrength;
        }

        // horizontální streak přímo přes sluneční kotouč (anamorfní highlight)
        if (flareStrength <= 0.001) {
            this.streak.material.opacity = 0;
        } else {
            this.streak.position.copy(this._sunWorld);
            this.streak.scale.set(SK.streakSize[0] * (0.7 + 0.3 * flareStrength), SK.streakSize[1], 1);
            this.streak.material.opacity = SK.streakOpac * flareStrength;
        }
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
        const yaw = van.yaw, p = van.mesh.position; // interpolovaná pozice (bez cukání)
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
