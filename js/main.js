// Camper Drift: Euro Trip — vstupní bod: bootstrap, herní smyčka, stavový automat
import * as THREE from 'three';
import { CONFIG, QUALITY, IS_MOBILE, clamp, lerp } from './config.js';
import { initPhysics, stepPhysics } from './physics.js';
import { Road } from './road.js';
import { Van, VanState } from './van.js';
import { WorldEnv, Props, biomeMix } from './biomes.js';
import { setupRenderer, setupComposer, Sky, Ridges, CameraRig, Particles, TireMarks } from './effects.js';
import { GameAudio } from './audio.js';
import { Score } from './score.js';
import { HUD } from './hud.js';

const FIXED = 1 / 60;

class Game {
    async init() {
        const canvas = document.getElementById('game');
        this.renderer = setupRenderer(canvas, QUALITY);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(CONFIG.cam.fovBase, window.innerWidth / window.innerHeight, 0.1, 800);

        await initPhysics();

        this.env = new WorldEnv(this.scene, QUALITY);
        this.sky = new Sky(this.scene);
        this.ridges = new Ridges(this.scene);
        this.props = new Props(this.scene);
        this.road = new Road(this.scene, {
            onChunkProps: (chunk, road) => this.props.populate(chunk, road),
            onChunkRelease: id => this.props.releaseChunk(id),
            onCampZone: (zone, chunk, road) => this.props.campVisual(zone, road, chunk.id),
        });
        this.van = new Van(this.scene);
        this.van.onSpinout = () => this._onSpinout();
        this.rig = new CameraRig(this.camera);
        this.rig.snapTo(this.van);

        const post = setupComposer(this.renderer, this.scene, this.camera, QUALITY);
        this.composer = post.composer;
        this.bloom = post.bloom;

        this.smoke = new Particles(this.scene, QUALITY.smoke, 1.15, { opacity: 0.5 });
        this.confetti = new Particles(this.scene, CONFIG.fx.confettiCount, 0.5, { opacity: 0.95, gravity: -7 });
        this.tire = new TireMarks(this.scene, CONFIG.fx.tireSegments);

        this.audio = new GameAudio();
        this.score = new Score();
        this.hud = new HUD();
        this.hud.setBest(this.score.best);
        this.hud.screen('start');

        this.state = 'start';       // start | run | over
        this.held = false;
        this.timeScale = 1;
        this.slowmoT = 0;
        this.crashT = 0;
        this.overGuard = 0;
        this.acc = 0;
        this.last = performance.now();
        this._smokeAlt = 0;
        this._wl = new THREE.Vector3(); this._wr = new THREE.Vector3();
        // sledování zatáček (čistá zatáčka)
        this._seg = null; this._segDrift = 0; this._segDirty = false;

        this._bindInput();
        this._bindResize();
        const params = new URLSearchParams(location.search);
        if (params.has('debug')) this._debugPanel();
        if (params.has('autotest')) {
            // headless smoke-test: auto start + periodický drift
            setTimeout(() => this._startRun(), 800);
            setInterval(() => { this.held = !this.held; }, 1600);
        }

        // idle náhled prostředí i v menu
        this.env.update(0, this.van.pos);
        this.sky.update(0, this.camera.position, this.env.sun.position.clone().normalize());

        requestAnimationFrame(t => this._frame(t));
    }

    // ---------- vstup ----------
    _bindInput() {
        const down = e => {
            if (e.target.closest && e.target.closest('.no-drive')) return;
            this.audio.unlock();
            if (this.state === 'start') { this._startRun(); return; }
            if (this.state === 'over') {
                if (performance.now() - this.overGuard > 500) this._restart();
                return;
            }
            this.held = true;
        };
        const up = () => { this.held = false; };
        window.addEventListener('pointerdown', down);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        window.addEventListener('keydown', e => {
            if (e.repeat) return;
            if (e.code === 'Space') { e.preventDefault(); down(e); }
        });
        window.addEventListener('keyup', e => { if (e.code === 'Space') up(); });

        const mute = document.getElementById('btn-mute');
        mute.textContent = this.audio.muted ? '🔇' : '🔊';
        mute.addEventListener('pointerdown', e => {
            e.stopPropagation();
            this.audio.unlock();
            this.audio.setMuted(!this.audio.muted);
            mute.textContent = this.audio.muted ? '🔇' : '🔊';
        });
    }

    _bindResize() {
        window.addEventListener('resize', () => {
            const w = window.innerWidth, h = window.innerHeight;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
            this.composer.setSize(w, h);
        });
    }

    // ---------- stavy ----------
    _startRun() {
        this.state = 'run';
        this.hud.screen('run');
        this.held = false;
    }

    _restart() {
        this.props.releaseAll();
        this.road.reset(Math.floor(Math.random() * 1e9));
        this.van.reset();
        this.score.reset();
        this.tire.reset();
        this.rig.snapTo(this.van);
        this.timeScale = 1; this.slowmoT = 0; this.crashT = 0;
        this._seg = null; this._segDrift = 0; this._segDirty = false;
        this.hud.setBest(this.score.best);
        this.hud.screen('run');
        this.state = 'run';
        this.held = false;
    }

    _gameOver() {
        const rec = this.score.finish();
        this.hud.gameOver(this.score, rec);
        this.hud.setBest(this.score.best);
        this.state = 'over';
        this.overGuard = performance.now();
    }

    _crash() {
        if (this.van.state === VanState.CRASHED) return;
        this.van.crash();
        this.audio.crash();
        this.crashT = 1.7;
        // prachová exploze
        const p = this.van.pos;
        for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 9;
            this.smoke.spawn(p.x, 0.6 + Math.random(), p.z,
                Math.cos(a) * sp, 2 + Math.random() * 5, Math.sin(a) * sp,
                0.9 + Math.random() * 0.5, 0.45, 0.4, 0.36);
        }
    }

    _onSpinout() {
        if (this.score.comboLost()) {
            this.audio.comboLost();
            this.hud.popup('KOMBO ZTRACENO', 'bad', null, null);
        }
    }

    // ---------- kolize ----------
    _contact(a, b) {
        const pair = (t) => a.type === t ? a : b.type === t ? b : null;
        const van = pair('van');
        if (!van) return;
        const rock = pair('rock');
        const prop = pair('prop');
        if (rock) {
            rock.ref.hit = true;
            if (this.van.speed > CONFIG.physics.crashSpeed && this.van.state !== VanState.CRASHED) {
                this._crash();
            } else {
                this.hud.vignettePulse();
            }
        } else if (prop && this.state === 'run') {
            const e = prop.ref;
            if (e && !e.scored) {
                e.scored = true;
                const pts = this.score.prop(performance.now() / 1000);
                if (pts > 0) {
                    this.audio.prop();
                    const t = e.ph.body.translation();
                    this.hud.popup(`+${pts}`, 'prop', new THREE.Vector3(t.x, 1.2, t.z), this.camera);
                }
            }
        }
    }

    // ---------- herní logika (fixed step) ----------
    _step(dt) {
        const van = this.van;
        van.update(dt, this.held && this.state === 'run', this.road);
        stepPhysics(dt, (a, b) => this._contact(a, b));
        this.road.ensure(van.s);
        this.props.sync();

        if (this.state !== 'run') return;
        if (van.state === VanState.CRASHED) return;

        const drifting = Math.abs(van.slipDeg) > CONFIG.score.slipMinDeg && !van.offroad && van.speed > 6;

        // skóre za drift + vzdálenost
        this.score.driftTick(dt, drifting, van.speed);
        this.score.distance(Math.max(0, van.vF) * dt);

        // kouř / prach
        this._smokeAlt ^= 1;
        if ((drifting || van.offroad) && van.speed > 6 && this._smokeAlt) {
            van.rearWheelPos(this._wl, this._wr);
            const off = van.offroad;
            const [r, g, b] = off ? [0.55, 0.47, 0.35] : [0.88, 0.88, 0.9];
            for (const w of [this._wl, this._wr]) {
                this.smoke.spawn(w.x, 0.25, w.z,
                    (Math.random() - 0.5) * 2, 1.2 + Math.random() * 1.5, (Math.random() - 0.5) * 2,
                    0.55 + Math.random() * 0.35, r, g, b);
            }
        }
        van.rearWheelPos(this._wl, this._wr);
        this.tire.add(this._wl, this._wr, drifting);

        this._corners(dt, drifting);
        this._nearMiss();
        this._camps(dt);
    }

    _corners(dt, drifting) {
        const seg = this.road.segmentAt(this.van.s);
        if (seg !== this._seg) {
            // vyhodnocení opuštěné zatáčky
            if (this._seg && (this._seg.type === 'CORNER' || this._seg.type === 'HAIRPIN')
                && this._segDrift >= CONFIG.score.cleanCornerMinDrift && !this._segDirty) {
                const pts = this.score.cleanCorner();
                this.audio.cleanCorner();
                this.hud.popup(`ČISTÁ ZATÁČKA +${pts}`, 'clean', this.van.mesh.position, this.camera);
            }
            this._seg = seg; this._segDrift = 0; this._segDirty = false;
        }
        if (drifting) this._segDrift += dt;
        if (this.van.offroad || this.van.state === VanState.SPINOUT) this._segDirty = true;
    }

    _nearMiss() {
        const van = this.van, p = van.pos;
        for (const rock of this.props.rocks) {
            if (rock.nearAwarded || rock.hit) continue;
            const d = Math.hypot(p.x - rock.x, p.z - rock.z);
            if (d < (rock.minD ?? 1e9)) rock.minD = d;
            if (van.s > rock.s + 4) {
                rock.nearAwarded = true;
                if (rock.minD < rock.r + CONFIG.score.nearMissDist && van.speed > CONFIG.score.nearMissSpeed) {
                    const pts = this.score.nearMiss();
                    this.audio.nearMiss();
                    this.hud.vignettePulse();
                    this.hud.popup(`TĚSNĚ! +${pts}`, 'near', new THREE.Vector3(rock.x, 1.5, rock.z), this.camera);
                }
            }
        }
    }

    _camps(dt) {
        const C = CONFIG.camp;
        const van = this.van;
        const zone = this.road.nextZone(van.s);
        if (!zone) { this.hud.campBanner(null); return; }

        const distTo = zone.s0 - van.s;
        this.hud.campBanner(distTo < 300 ? Math.max(0, distTo) : null);

        if (van.s > zone.s0 - 2) { zone.entered = true; }
        if (zone.entered) zone.enterT += dt;

        const back = van.s - C.vanHalfLen, front = van.s + C.vanHalfLen;
        const stopped = van.speed < C.stopSpeed && van.s > zone.s0 - C.vanHalfLen;

        let grade = null;
        if (stopped) {
            const inside = back >= zone.s0 && front <= zone.s1 && Math.abs(van.lat) < CONFIG.road.width / 2;
            if (inside && Math.abs(van.s - zone.sc) <= C.perfectDist) grade = 'perfect';
            else if (inside) grade = 'good';
            else grade = 'miss';
        } else if (van.s > zone.s1 + 10) {
            grade = 'miss';
        } else if (zone.entered && zone.enterT > C.timeout) {
            grade = 'miss';
        }
        if (!grade) return;

        zone.state = 'done';
        const hadCombo = this.score.combo > 1;
        const pts = this.score.camp(grade);
        this.hud.campResult(grade, pts, this.score.combo);
        if (grade === 'perfect') {
            this.audio.campPerfect(this.score.combo);
            this.slowmoT = CONFIG.fx.slowmoTime;
            const c = this.road.pointAt(zone.sc, 0);
            for (let i = 0; i < 70; i++) {
                const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 6;
                this.confetti.spawn(c.x, 1 + Math.random(), c.z,
                    Math.cos(a) * sp, 4 + Math.random() * 6, Math.sin(a) * sp,
                    1 + Math.random() * 0.8,
                    0.4 + Math.random() * 0.6, 0.4 + Math.random() * 0.6, 0.4 + Math.random() * 0.6);
            }
        } else if (grade === 'good') {
            this.audio.campGood();
        } else {
            if (hadCombo) this.audio.comboLost();
        }
    }

    // ---------- hlavní smyčka ----------
    _frame(now) {
        requestAnimationFrame(t => this._frame(t));
        let real = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;

        // slow-mo
        if (this.slowmoT > 0) {
            this.slowmoT -= real;
            this.timeScale = CONFIG.fx.slowmoScale;
        } else {
            this.timeScale = Math.min(1, this.timeScale + real * 3);
        }
        const dt = real * this.timeScale;

        if (this.state !== 'start') {
            this.acc += dt;
            let n = 0;
            while (this.acc >= FIXED && n < 5) {
                this._step(FIXED);
                this.acc -= FIXED; n++;
            }
        }

        // crash sekvence
        if (this.crashT > 0) {
            this.crashT -= real;
            if (this.crashT <= 0 && this.state === 'run') this._gameOver();
        }

        // prostředí + kamera + částice
        const van = this.van;
        this.env.update(van.s, van.pos);
        const sunDir = this.env.sun.position.clone().sub(this.env.sun.target.position).normalize();
        this.sky.update(van.s, this.camera.position, sunDir);
        this.ridges.update(van.s, this.camera.position, van.s);
        this.rig.update(real, van, this.timeScale);
        this.smoke.update(dt);
        this.confetti.update(dt);

        // HUD + zvuk
        if (this.state === 'run') {
            const bio = biomeMix(van.s).a;
            this.hud.update(this.score, van, `${bio.emoji} ${bio.name}`);
        }
        this.audio.drive(
            clamp(van.speed / 28, 0, 1),
            clamp(Math.abs(van.slipDeg) / 35, 0, 1),
            this.timeScale,
            this.state === 'run' && van.state !== VanState.CRASHED
        );

        this.composer.render();
    }

    // ---------- debug panel ----------
    _debugPanel() {
        const P = CONFIG.physics;
        const keys = ['cruiseBase', 'driftSteerMul', 'driftFactor', 'gripFactor', 'steerResponse', 'kP', 'brakeGain'];
        const box = document.createElement('div');
        box.className = 'no-drive';
        box.style.cssText = 'position:fixed;left:8px;top:80px;z-index:50;background:rgba(0,0,0,.7);color:#fff;padding:10px;font:11px monospace;border-radius:8px';
        for (const k of keys) {
            const row = document.createElement('div');
            const val = P[k];
            row.innerHTML = `<label>${k} <span id="dv-${k}">${val}</span><br>
                <input type="range" min="${val * 0.3}" max="${val * 2.5}" step="${val / 100}" value="${val}" style="width:150px"></label>`;
            row.querySelector('input').addEventListener('input', e => {
                P[k] = parseFloat(e.target.value);
                row.querySelector(`#dv-${k}`).textContent = P[k].toFixed(3);
            });
            box.appendChild(row);
        }
        const info = document.createElement('div');
        info.id = 'dbg-info';
        box.appendChild(info);
        document.body.appendChild(box);
        setInterval(() => {
            info.textContent = `calls:${this.renderer.info.render.calls} slip:${this.van.slipDeg.toFixed(0)}° s:${this.van.s.toFixed(0)}`;
        }, 500);
    }
}

const game = new Game();
game.init().catch(err => {
    console.error(err);
    const el = document.getElementById('boot-error');
    if (el) { el.classList.remove('hidden'); el.textContent = 'Chyba při načítání: ' + err.message; }
});
