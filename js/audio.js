// WebAudio syntéza — žádné externí soubory: motor, pískání pneumatik, bodové dingy
export class GameAudio {
    constructor() {
        this.ctx = null;
        this.muted = localStorage.getItem('camperDrift.muted') === '1';
        this.ready = false;
    }

    /** volat z prvního uživatelského gesta (iOS unlock) */
    unlock() {
        if (this.ready) { this.ctx.resume(); return; }
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) { return; }
        const c = this.ctx;
        this.master = c.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        // tunelový filtr mezi masterem a výstupem (echo/tlumení v tunelu)
        this.tunnelLP = c.createBiquadFilter();
        this.tunnelLP.type = 'lowpass';
        this.tunnelLP.frequency.value = 20000;
        const comp = c.createDynamicsCompressor();
        this.master.connect(this.tunnelLP); this.tunnelLP.connect(comp); comp.connect(c.destination);

        // — motor: 2 rozladěné saw + sub sinus -> lowpass
        this.engGain = c.createGain(); this.engGain.gain.value = 0;
        this.engFilter = c.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 500;
        this.engGain.connect(this.engFilter); this.engFilter.connect(this.master);
        this.oscA = c.createOscillator(); this.oscA.type = 'sawtooth'; this.oscA.detune.value = -8;
        this.oscB = c.createOscillator(); this.oscB.type = 'sawtooth'; this.oscB.detune.value = 8;
        this.oscSub = c.createOscillator(); this.oscSub.type = 'sine';
        for (const o of [this.oscA, this.oscB, this.oscSub]) { o.frequency.value = 55; o.connect(this.engGain); o.start(); }
        // chug LFO
        this.lfo = c.createOscillator(); this.lfo.frequency.value = 4;
        this.lfoGain = c.createGain(); this.lfoGain.gain.value = 0.04;
        this.lfo.connect(this.lfoGain); this.lfoGain.connect(this.engGain.gain); this.lfo.start();

        // — screech: šum -> bandpass
        const len = c.sampleRate;
        const buf = c.createBuffer(1, len, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noise = c.createBufferSource(); this.noise.buffer = buf; this.noise.loop = true;
        this.bp = c.createBiquadFilter(); this.bp.type = 'bandpass'; this.bp.frequency.value = 900; this.bp.Q.value = 1.2;
        this.scGain = c.createGain(); this.scGain.gain.value = 0;
        this.noise.connect(this.bp); this.bp.connect(this.scGain); this.scGain.connect(this.master);
        this.noise.start();
        this.wob = c.createOscillator(); this.wob.frequency.value = 11;
        this.wobG = c.createGain(); this.wobG.gain.value = 180;
        this.wob.connect(this.wobG); this.wobG.connect(this.bp.frequency); this.wob.start();

        // — moře: hluboce filtrovaný šum s pomalým dechem vln
        this.waveSrc = c.createBufferSource(); this.waveSrc.buffer = buf; this.waveSrc.loop = true;
        const waveLP = c.createBiquadFilter(); waveLP.type = 'lowpass'; waveLP.frequency.value = 320; waveLP.Q.value = 0.4;
        this.waveGain = c.createGain(); this.waveGain.gain.value = 0.05;
        this.waveSrc.connect(waveLP); waveLP.connect(this.waveGain); this.waveGain.connect(this.master);
        this.waveSrc.start();
        this.waveLFO = c.createOscillator(); this.waveLFO.frequency.value = 0.11;
        this.waveLFOG = c.createGain(); this.waveLFOG.gain.value = 0.028;
        this.waveLFO.connect(this.waveLFOG); this.waveLFOG.connect(this.waveGain.gain); this.waveLFO.start();

        this.ready = true;
        c.resume();
    }

    /** tlumení v tunelu (t = true uvnitř) */
    tunnel(inside) {
        if (!this.ready) return;
        const t = this.ctx.currentTime;
        this.tunnelLP.frequency.linearRampToValueAtTime(inside ? 1100 : 20000, t + 0.25);
        this.waveGain.gain.linearRampToValueAtTime(inside ? 0.005 : 0.05, t + 0.25);
    }

    /** racek — klouzavé dvojité zakřičení, neagresivní */
    gull() {
        if (!this.ready || this.muted) return;
        const c = this.ctx, t0 = c.currentTime;
        for (let i = 0; i < 2; i++) {
            const o = c.createOscillator(); o.type = 'triangle';
            const st = t0 + i * 0.28;
            o.frequency.setValueAtTime(1750 + Math.random() * 250, st);
            o.frequency.exponentialRampToValueAtTime(950, st + 0.22);
            const g = c.createGain();
            g.gain.setValueAtTime(0.0001, st);
            g.gain.exponentialRampToValueAtTime(0.07, st + 0.04);
            g.gain.exponentialRampToValueAtTime(0.0001, st + 0.26);
            o.connect(g); g.connect(this.master);
            o.start(st); o.stop(st + 0.3);
        }
    }

    /** houkání zaoceánského parníku — hluboký dvojtón v dálce */
    shipHorn() {
        if (!this.ready || this.muted) return;
        const c = this.ctx, t0 = c.currentTime;
        [0, 1.1].forEach(off => {
            [82, 110].forEach(f => {
                const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
                const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
                const g = c.createGain();
                g.gain.setValueAtTime(0.0001, t0 + off);
                g.gain.linearRampToValueAtTime(0.09, t0 + off + 0.15);
                g.gain.setValueAtTime(0.09, t0 + off + 0.7);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 1.0);
                o.connect(lp); lp.connect(g); g.connect(this.master);
                o.start(t0 + off); o.stop(t0 + off + 1.1);
            });
        });
    }

    /** krátké přátelské police "whoop" při čistém průjezdu */
    whoop() {
        if (!this.ready || this.muted) return;
        const c = this.ctx, t0 = c.currentTime;
        const o = c.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(600, t0);
        o.frequency.exponentialRampToValueAtTime(1350, t0 + 0.28);
        const g = c.createGain();
        g.gain.setValueAtTime(0.12, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.32);
        o.connect(g); g.connect(this.master);
        o.start(t0); o.stop(t0 + 0.35);
    }

    setMuted(m) {
        this.muted = m;
        localStorage.setItem('camperDrift.muted', m ? '1' : '0');
        if (this.master) this.master.gain.value = m ? 0 : 0.5;
    }

    /** speedNorm 0..1, slip 0..1, timeScale (slow-mo tape-stop efekt) */
    drive(speedNorm, slip, timeScale, running) {
        if (!this.ready) return;
        const t = this.ctx.currentTime;
        const f = (55 + speedNorm * 70) * (0.4 + 0.6 * timeScale);
        this.oscA.frequency.linearRampToValueAtTime(f, t + 0.08);
        this.oscB.frequency.linearRampToValueAtTime(f * 1.005, t + 0.08);
        this.oscSub.frequency.linearRampToValueAtTime(f / 2, t + 0.08);
        this.engFilter.frequency.linearRampToValueAtTime(400 + speedNorm * 1000, t + 0.1);
        this.engGain.gain.linearRampToValueAtTime(running ? 0.09 + speedNorm * 0.06 : 0, t + 0.15);
        this.scGain.gain.linearRampToValueAtTime(running ? slip * speedNorm * 0.16 : 0, t + 0.05);
    }

    _ding(freqs, dur = 0.22, type = 'triangle', vol = 0.25) {
        if (!this.ready || this.muted) return;
        const c = this.ctx, t0 = c.currentTime;
        freqs.forEach((f, i) => {
            const o = c.createOscillator(); o.type = type; o.frequency.value = f;
            const g = c.createGain();
            g.gain.setValueAtTime(vol, t0 + i * 0.07);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.07 + dur);
            o.connect(g); g.connect(this.master);
            o.start(t0 + i * 0.07); o.stop(t0 + i * 0.07 + dur + 0.02);
        });
    }

    driftTick() { this._ding([880], 0.08, 'triangle', 0.06); }
    cleanCorner() { this._ding([880, 1320], 0.2); }
    nearMiss() { this._ding([1760], 0.15, 'sine', 0.2); }
    prop() { this._ding([440 + Math.random() * 120], 0.1, 'square', 0.08); }
    campPerfect(combo) { const b = 660 * Math.pow(1.06, combo); this._ding([b, b * 1.25, b * 1.5, b * 2], 0.3, 'triangle', 0.3); }
    campGood() { this._ding([660, 830], 0.25); }
    comboLost() { this._ding([330, 262], 0.3, 'sawtooth', 0.12); }
    crash() {
        if (!this.ready || this.muted) return;
        const c = this.ctx, t0 = c.currentTime;
        const src = c.createBufferSource(); src.buffer = this.noise.buffer;
        const f = c.createBiquadFilter(); f.type = 'lowpass';
        f.frequency.setValueAtTime(2200, t0); f.frequency.exponentialRampToValueAtTime(90, t0 + 0.5);
        const g = c.createGain();
        g.gain.setValueAtTime(0.6, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(t0); src.stop(t0 + 0.6);
        this._ding([80, 60], 0.5, 'sawtooth', 0.3);
    }

    /** kratší tupý náraz — proražení zídky */
    railSmash() {
        if (!this.ready || this.muted) return;
        const c = this.ctx, t0 = c.currentTime;
        const src = c.createBufferSource(); src.buffer = this.noise.buffer;
        const f = c.createBiquadFilter(); f.type = 'lowpass';
        f.frequency.setValueAtTime(1600, t0); f.frequency.exponentialRampToValueAtTime(160, t0 + 0.22);
        const g = c.createGain();
        g.gain.setValueAtTime(0.4, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.26);
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(t0); src.stop(t0 + 0.3);
    }

    /** dopad do vody */
    splash() {
        if (!this.ready || this.muted) return;
        const c = this.ctx, t0 = c.currentTime;
        const src = c.createBufferSource(); src.buffer = this.noise.buffer;
        const f = c.createBiquadFilter(); f.type = 'bandpass';
        f.Q.value = 0.8;
        f.frequency.setValueAtTime(900, t0);
        f.frequency.exponentialRampToValueAtTime(2600, t0 + 0.12);
        f.frequency.exponentialRampToValueAtTime(300, t0 + 0.9);
        const g = c.createGain();
        g.gain.setValueAtTime(0.001, t0);
        g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.0);
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(t0); src.stop(t0 + 1.05);
    }
}
