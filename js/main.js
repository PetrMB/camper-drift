// Riviera Run — vstupní bod: bootstrap, herní smyčka, stavový automat
import * as THREE from 'three';
import { CONFIG, QUALITY, IS_MOBILE, clamp } from './config.js';
import { initPhysics, stepPhysics } from './physics.js';
import { Road } from './road.js';
import { Van, VanState } from './van.js';
import { WorldEnv, Props, Sea, Fleet, biomeMix } from './biomes.js';
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
        this.camera = new THREE.PerspectiveCamera(CONFIG.cam.fovBase, window.innerWidth / window.innerHeight, 0.1, 900);

        await initPhysics();

        this.audio = new GameAudio();
        this.env = new WorldEnv(this.scene, QUALITY);
        this.sky = new Sky(this.scene);
        this.ridges = new Ridges(this.scene);
        this.sea = new Sea(this.scene, QUALITY);
        this.props = new Props(this.scene);
        this.fleet = new Fleet(this.scene, () => this.audio.shipHorn());
        this.road = new Road(this.scene, {
            onChunkProps: (chunk, road) => this.props.populate(chunk, road),
            onChunkRelease: id => this.props.releaseChunk(id),
            onCheckpoint: (cp, chunk, road) => this.props.buildCheckpoint(cp, chunk, road),
        });
        this.van = new Van(this.scene);
        this.van.onSpinout = () => this._onSpinout();
        this.rig = new CameraRig(this.camera);

        const post = setupComposer(this.renderer, this.scene, this.camera, QUALITY);
        this.composer = post.composer;
        this.bloom = post.bloom;

        this.smoke = new Particles(this.scene, QUALITY.smoke, 1.15, { opacity: 0.5 });
        this.confetti = new Particles(this.scene, CONFIG.fx.confettiCount, 0.5, { opacity: 0.95, gravity: -7 });
        this.tire = new TireMarks(this.scene, CONFIG.fx.tireSegments);

        this.score = new Score();
        this.hud = new HUD();
        this.hud.setBest(this.score.best);
        this.hud.screen('start');

        this.state = 'start';       // start | run | over
        this.input = { drift: false, steer: 0 };
        this._keys = { left: false, right: false };
        this._touchSteer = 0;
        this._touchDrift = false;
        this.timeScale = 1;
        this.slowmoT = 0;
        this.crashT = 0;
        this.overGuard = 0;
        this.acc = 0;
        this.t = 0;
        this.last = performance.now();
        this._smokeAlt = 0;
        this._wl = new THREE.Vector3(); this._wr = new THREE.Vector3();
        this._seg = null; this._segDrift = 0; this._segDirty = false;
        this._wasTunnel = false;
        this._nextGull = 5 + Math.random() * 8;

        // reset výchozí výšky vozu podle silnice
        this.van.visY = this.road.yAt(4);
        this.rig.snapTo(this.van);

        this._bindInput();
        this._bindResize();
        const params = new URLSearchParams(location.search);
        if (params.has('debug')) this._debugPanel();
        if (params.has('autotest')) {
            window.__game = this;
            window.__tp = (s, lat = 0) => {   // testovací teleport na s-pozici
                const p = this.road.pointAt(s, lat);
                this.road._projIdx = this.road._idxOfS(s);
                this.van.body.setTranslation({ x: p.x, y: 0.95, z: p.z }, true);
                const a = this.road.headingAt(s);
                this.van.body.setRotation({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }, true);
                this.van.visY = this.road.yAt(s);
                this.rig.snapTo(this.van);
            };
            setTimeout(() => this._startRun(), 800);
        }

        this.env.update(0, this.van.pos, this.road);
        requestAnimationFrame(t => this._frame(t));
    }

    // ---------- vstup ----------
    _bindInput() {
        const start = () => {
            this.audio.unlock();
            if (this.state === 'start') { this._startRun(); return true; }
            if (this.state === 'over') {
                if (performance.now() - this.overGuard > 500) this._restart();
                return true;
            }
            return false;
        };

        // klávesnice
        window.addEventListener('keydown', e => {
            if (e.repeat) return;
            if (e.code === 'Space') { e.preventDefault(); if (!start()) this.input.drift = true; }
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') this._keys.left = true;
            if (e.code === 'ArrowRight' || e.code === 'KeyD') this._keys.right = true;
            if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD')) start();
        });
        window.addEventListener('keyup', e => {
            if (e.code === 'Space') this.input.drift = false;
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') this._keys.left = false;
            if (e.code === 'ArrowRight' || e.code === 'KeyD') this._keys.right = false;
        });

        // dotyk/myš: levá & pravá třetina = řízení, prostředek = drift
        const zones = new Map(); // pointerId -> 'left'|'right'|'drift'
        const zoneOf = x => {
            const w = window.innerWidth;
            if (x < w * 0.36) return 'left';
            if (x > w * 0.64) return 'right';
            return 'drift';
        };
        const applyZones = () => {
            let s = 0, d = false;
            for (const z of zones.values()) {
                if (z === 'left') s -= 1;
                else if (z === 'right') s += 1;
                else d = true;
            }
            this._touchSteer = clamp(s, -1, 1);
            this._touchDrift = d;
        };
        window.addEventListener('pointerdown', e => {
            if (e.target.closest && e.target.closest('.no-drive')) return;
            if (start()) return;
            zones.set(e.pointerId, zoneOf(e.clientX));
            applyZones();
        });
        const drop = e => { zones.delete(e.pointerId); applyZones(); };
        window.addEventListener('pointerup', drop);
        window.addEventListener('pointercancel', drop);

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
        this.input.drift = false;
    }

    _restart() {
        this.props.releaseAll();
        this.road.reset(Math.floor(Math.random() * 1e9));
        this.van.reset();
        this.van.visY = this.road.yAt(4);
        this.score.reset();
        this.tire.reset();
        this.fleet.reset();
        this.rig.snapTo(this.van);
        this.timeScale = 1; this.slowmoT = 0; this.crashT = 0;
        this._seg = null; this._segDrift = 0; this._segDirty = false;
        this.hud.setBest(this.score.best);
        this.hud.screen('run');
        this.state = 'run';
        this.input.drift = false;
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
        const p = this.van.pos, y = this.van.visY;
        for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 9;
            this.smoke.spawn(p.x, y + 0.6 + Math.random(), p.z,
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
        const pair = t => a.type === t ? a : b.type === t ? b : null;
        const van = pair('van');
        if (!van) return;
        const rock = pair('rock');
        const police = pair('police');
        const prop = pair('prop');
        if (police) {
            if (this.van.state !== VanState.CRASHED) this._crash();
        } else if (rock) {
            rock.ref.hit = true;
            if (this.van.speed > CONFIG.physics.crashSpeed && this.van.state !== VanState.CRASHED) {
                this._crash();
            } else {
                this.hud.vignettePulse();
            }
        } else if (prop && this.state === 'run') {
            const e = prop.ref;
            if (e && e.cp && e.cp.state === 'pending') e.cp.dirty = true;
            if (e && !e.scored) {
                e.scored = true;
                this.hud.vignettePulse();
                const t = e.ph.body.translation();
                this.hud.popup('🚧', 'bad', new THREE.Vector3(t.x, (e.yOff || 0) + 1.2, t.z), this.camera);
            }
            // náraz do zátarasu v rychlosti = konec jízdy (barikády přitom odletí)
            if (this.van.speed > CONFIG.physics.barrierCrashSpeed && this.van.state !== VanState.CRASHED) {
                this._crash();
            }
        }
    }

    // ---------- herní logika (fixed step) ----------
    _step(dt) {
        const van = this.van;
        const keySteer = (this._keys.right ? 1 : 0) - (this._keys.left ? 1 : 0);
        const steer = clamp(keySteer + this._touchSteer, -1, 1);
        const drift = (this.input.drift || this._touchDrift) && this.state === 'run';
        van.update(dt, { drift, steer: this.state === 'run' ? steer : 0 }, this.road);
        stepPhysics(dt, (a, b) => this._contact(a, b));
        this.road.ensure(van.s);
        this.props.sync();

        if (this.state !== 'run') return;
        if (van.state === VanState.CRASHED) return;

        const drifting = Math.abs(van.slipDeg) > CONFIG.score.slipMinDeg && !van.offroad && van.speed > 6;

        this.score.driftTick(dt, drifting, van.speed);
        this.score.distance(Math.max(0, van.vF) * dt);

        this._smokeAlt ^= 1;
        if ((drifting || van.offroad) && van.speed > 6 && this._smokeAlt) {
            van.rearWheelPos(this._wl, this._wr);
            const off = van.offroad;
            const [r, g, b] = off ? [0.55, 0.47, 0.35] : [0.88, 0.88, 0.9];
            for (const w of [this._wl, this._wr]) {
                this.smoke.spawn(w.x, w.y + 0.2, w.z,
                    (Math.random() - 0.5) * 2, 1.2 + Math.random() * 1.5, (Math.random() - 0.5) * 2,
                    0.55 + Math.random() * 0.35, r, g, b);
            }
        }
        van.rearWheelPos(this._wl, this._wr);
        this.tire.add(this._wl, this._wr, drifting);

        this._corners(dt, drifting);
        this._nearMiss();
        this._checkpoints(dt);
    }

    _corners(dt, drifting) {
        const seg = this.road.segmentAt(this.van.s);
        if (seg !== this._seg) {
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
            if (d < rock.minD) rock.minD = d;
            if (van.s > rock.s + 4) {
                rock.nearAwarded = true;
                if (rock.minD < rock.r + CONFIG.score.nearMissDist && van.speed > CONFIG.score.nearMissSpeed) {
                    const pts = this.score.nearMiss();
                    this.audio.nearMiss();
                    this.hud.vignettePulse();
                    this.hud.popup(`TĚSNĚ! +${pts}`, 'near', new THREE.Vector3(rock.x, this.van.visY + 1.5, rock.z), this.camera);
                }
            }
        }
    }

    _checkpoints(dt) {
        const van = this.van;
        const cp = this.road.nextCheckpoint(van.s);
        if (!cp) { this.hud.campBanner(null); return; }

        const distTo = cp.s - van.s;
        this.hud.campBanner(distTo < 300 && distTo > -5 ? Math.max(0, distTo) : null);

        // vyhodnocení po průjezdu linií zátarasu
        if (van.s > cp.s + 3) {
            cp.state = 'done';
            const clean = !cp.dirty;
            const hadCombo = this.score.combo > 1;
            const pts = this.score.checkpoint(clean);
            this.hud.campResult(clean ? 'clean' : 'dirty', pts, this.score.combo);
            if (clean) {
                this.audio.whoop();
                this.slowmoT = CONFIG.fx.slowmoTime;
                const c = this.road.pointAt(cp.s, cp.gapLat);
                for (let i = 0; i < 50; i++) {
                    const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5;
                    this.confetti.spawn(c.x, c.y + 1, c.z,
                        Math.cos(a) * sp, 3 + Math.random() * 5, Math.sin(a) * sp,
                        0.8 + Math.random() * 0.7,
                        0.4 + Math.random() * 0.6, 0.4 + Math.random() * 0.6, 0.4 + Math.random() * 0.6);
                }
            } else if (hadCombo) {
                this.audio.comboLost();
            }
        }
    }

    // ---------- hlavní smyčka ----------
    _frame(now) {
        requestAnimationFrame(t => this._frame(t));
        let real = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;
        this.t += real;

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

        if (this.crashT > 0) {
            this.crashT -= real;
            if (this.crashT <= 0 && this.state === 'run') this._gameOver();
        }

        const van = this.van;
        this.env.update(van.s, van.pos, this.road);
        const sunDir = this.env.sun.position.clone().sub(this.env.sun.target.position).normalize();
        this.sky.update(van.s, this.camera.position, sunDir);
        this.ridges.update(van.s, this.camera.position, van.s);
        this.sea.update(this.t, van.s, this.camera.position, this.scene.fog);
        this.fleet.update(dt, this.t, van.s, this.road);
        this.props.strobe(this.t);
        this.rig.update(real, van, this.timeScale);
        this.smoke.update(dt);
        this.confetti.update(dt);

        // tunelová akustika
        const inTunnel = this.road.inTunnel(van.s);
        if (inTunnel !== this._wasTunnel) {
            this._wasTunnel = inTunnel;
            this.audio.tunnel(inTunnel);
        }
        // racci (jen venku)
        this._nextGull -= real;
        if (this._nextGull <= 0) {
            this._nextGull = 8 + Math.random() * 9;
            if (!inTunnel && this.state !== 'over') this.audio.gull();
        }

        if (this.state === 'run') {
            const bio = biomeMix(van.s).a;
            this.hud.update(this.score, van, `${bio.emoji} ${bio.name} · POBŘEŽÍ`);
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
        const keys = ['cruiseBase', 'driftSteerMul', 'driftFactor', 'gripFactor', 'steerLatMax', 'steerDriftBias', 'kP'];
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
            info.textContent = `calls:${this.renderer.info.render.calls} slip:${this.van.slipDeg.toFixed(0)}° s:${this.van.s.toFixed(0)} y:${this.van.visY.toFixed(1)}`;
        }, 500);
    }
}

const game = new Game();
game.init().catch(err => {
    console.error(err);
    const el = document.getElementById('boot-error');
    if (el) { el.classList.remove('hidden'); el.textContent = 'Chyba při načítání: ' + err.message; }
});
