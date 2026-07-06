// Skóre, combo, statistiky runu, rekord v localStorage
import { CONFIG } from './config.js';

const S = CONFIG.score;

export class Score {
    constructor() {
        this.best = 0;
        try { this.best = JSON.parse(localStorage.getItem('camperDrift.best') || '{}').score || 0; } catch (e) { }
        this.reset();
    }

    reset() {
        this.score = 0;
        this.combo = 1;
        this.dist = 0;
        this.stats = {
            drifts: 0, longestDrift: 0, cleanCorners: 0,
            nearMisses: 0, props: 0, perfectCamps: 0, goodCamps: 0, bestCombo: 1,
        };
        this._driftAcc = 0;
        this._curDrift = 0;
        this._distAcc = 0;
        this._propT = 0;
        this._propN = 0;
    }

    get comboM() { return this.combo; }

    /** vrací body přičtené tento tick (pro ticker), 0 jinak */
    driftTick(dt, drifting, speed) {
        if (!drifting) {
            if (this._curDrift > 1) this.stats.drifts++;
            this.stats.longestDrift = Math.max(this.stats.longestDrift, this._curDrift);
            this._curDrift = 0;
            return 0;
        }
        this._curDrift += speed * dt;
        this._driftAcc += dt;
        if (this._driftAcc >= S.driftTickInterval) {
            this._driftAcc -= S.driftTickInterval;
            const pts = S.driftTick * this.combo;
            this.score += pts;
            return pts;
        }
        return 0;
    }

    distance(ds) {
        this._distAcc += ds * S.distPerM;
        if (this._distAcc >= 1) {
            const whole = Math.floor(this._distAcc);
            this._distAcc -= whole;
            this.score += whole;
        }
        this.dist += ds;
    }

    cleanCorner() { const p = S.cleanCorner * this.combo; this.score += p; this.stats.cleanCorners++; return p; }
    nearMiss() { const p = S.nearMiss * this.combo; this.score += p; this.stats.nearMisses++; return p; }

    prop(t) {
        if (t - this._propT > 1) { this._propT = t; this._propN = 0; }
        if (this._propN >= S.propRateCap) return 0;
        this._propN++;
        const p = S.prop * this.combo;
        this.score += p; this.stats.props++;
        return p;
    }

    camp(grade) {
        if (grade === 'perfect') {
            const p = S.campPerfect * this.combo;
            this.score += p;
            this.combo = Math.min(S.comboMax, this.combo + 1);
            this.stats.perfectCamps++;
            this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
            return p;
        }
        if (grade === 'good') {
            const p = S.campGood * this.combo;
            this.score += p;
            this.combo = Math.min(S.comboMax, this.combo + 1);
            this.stats.goodCamps++;
            this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
            return p;
        }
        this.combo = 1;
        return 0;
    }

    comboLost() { const had = this.combo > 1; this.combo = 1; return had; }

    /** konec runu -> true pokud nový rekord */
    finish() {
        const rec = this.score > this.best;
        if (rec) {
            this.best = this.score;
            try {
                localStorage.setItem('camperDrift.best', JSON.stringify({ score: this.score, dist: Math.round(this.dist) }));
            } catch (e) { }
        }
        return rec;
    }
}
