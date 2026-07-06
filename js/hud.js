// DOM HUD — obrazovky, skóre, combo, banner kempu, plovoucí popupy, vignette
import * as THREE from 'three';

const $ = id => document.getElementById(id);
const _v = new THREE.Vector3();

export class HUD {
    constructor() {
        this.el = {
            start: $('screen-start'), over: $('screen-over'),
            score: $('hud-score'), combo: $('hud-combo'), speed: $('hud-speed'),
            best: $('hud-best'), bestStart: $('start-best'),
            camp: $('camp-banner'), campDist: $('camp-dist'), campBar: $('camp-bar-fill'),
            result: $('camp-result'),
            vignette: $('vignette'),
            popups: $('popups'),
            biome: $('hud-biome'),
            overScore: $('over-score'), overStats: $('over-stats'), overRecord: $('over-record'),
            mute: $('btn-mute'),
            hudTop: $('hud-top'),
        };
        // pool popupů
        this.pool = [];
        for (let i = 0; i < 10; i++) {
            const d = document.createElement('div');
            d.className = 'popup';
            this.el.popups.appendChild(d);
            this.pool.push(d);
        }
        this.poolI = 0;
        this._resultT = null;
    }

    screen(name) {
        this.el.start.classList.toggle('hidden', name !== 'start');
        this.el.over.classList.toggle('hidden', name !== 'over');
        this.el.hudTop.classList.toggle('hidden', name === 'start');
    }

    setBest(v) {
        this.el.bestStart.textContent = v > 0 ? `NEJLEPŠÍ: ${fmt(v)}` : 'ZAJEĎ PRVNÍ REKORD!';
        this.el.best.textContent = v > 0 ? `TOP ${fmt(v)}` : '';
    }

    update(score, van, biomeName) {
        this.el.score.textContent = fmt(Math.floor(score.score));
        this.el.speed.textContent = `${Math.round(van.speed * 3.6)} km/h`;
        const c = score.combo;
        this.el.combo.textContent = `×${c}`;
        this.el.combo.className = 'combo' + (c >= 6 ? ' hot' : c >= 3 ? ' warm' : '');
        this.el.biome.textContent = biomeName;
    }

    campBanner(distM) {
        if (distM === null) { this.el.camp.classList.add('hidden'); return; }
        this.el.camp.classList.remove('hidden');
        this.el.campDist.textContent = `${Math.max(0, Math.round(distM))} m`;
        this.el.campBar.style.width = `${Math.max(0, Math.min(100, 100 - distM / 3))}%`;
    }

    campResult(grade, pts, combo) {
        const el = this.el.result;
        if (grade === 'perfect') { el.textContent = `⛺ PERFEKT! +${fmt(pts)}  ×${combo}`; el.className = 'camp-result perfect'; }
        else if (grade === 'good') { el.textContent = `⛺ DOBRÝ! +${fmt(pts)}  ×${combo}`; el.className = 'camp-result good'; }
        else { el.textContent = '⛺ UJELO TI TO — kombo ztraceno'; el.className = 'camp-result miss'; }
        clearTimeout(this._resultT);
        this._resultT = setTimeout(() => el.classList.add('hidden'), 1400);
    }

    popup(text, cls, worldPos, camera) {
        const d = this.pool[this.poolI]; this.poolI = (this.poolI + 1) % this.pool.length;
        d.textContent = text;
        d.className = `popup show ${cls || ''}`;
        let x = window.innerWidth / 2, y = window.innerHeight * 0.42;
        if (worldPos && camera) {
            _v.copy(worldPos).project(camera);
            x = (_v.x * 0.5 + 0.5) * window.innerWidth;
            y = (-_v.y * 0.5 + 0.5) * window.innerHeight;
        }
        x += (Math.random() - 0.5) * 60;
        d.style.left = `${x}px`; d.style.top = `${y}px`;
        // restart animace
        void d.offsetWidth;
        d.classList.add('anim');
        setTimeout(() => d.classList.remove('show', 'anim'), 900);
    }

    vignettePulse() {
        this.el.vignette.classList.remove('pulse');
        void this.el.vignette.offsetWidth;
        this.el.vignette.classList.add('pulse');
    }

    gameOver(score, isRecord) {
        this.el.overScore.textContent = fmt(Math.floor(score.score));
        this.el.overRecord.classList.toggle('hidden', !isRecord);
        const st = score.stats;
        this.el.overStats.innerHTML = `
            <tr><td>Vzdálenost</td><td>${(score.dist / 1000).toFixed(2)} km</td></tr>
            <tr><td>Nejdelší drift</td><td>${Math.round(st.longestDrift)} m</td></tr>
            <tr><td>Čisté zatáčky</td><td>${st.cleanCorners}</td></tr>
            <tr><td>Perfektní kempy</td><td>${st.perfectCamps}</td></tr>
            <tr><td>Dobré kempy</td><td>${st.goodCamps}</td></tr>
            <tr><td>Těsné míjení</td><td>${st.nearMisses}</td></tr>
            <tr><td>Sražené kužely</td><td>${st.props}</td></tr>
            <tr><td>Nejvyšší kombo</td><td>×${st.bestCombo}</td></tr>`;
        this.screen('over');
    }
}

export function fmt(n) {
    return n.toLocaleString('cs-CZ');
}
