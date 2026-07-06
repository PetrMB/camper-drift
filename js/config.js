// Camper Drift: Euro Trip — všechny laditelné konstanty na jednom místě

export const CONFIG = {
    road: {
        sampleStep: 2,        // m mezi vzorky centerline
        chunkSamples: 64,     // 128 m na chunk
        chunksAhead: 6,
        chunksBehind: 2,
        width: 9,             // šířka silnice
        edgeLine: 0.28,       // šířka krajnice
    },

    physics: {
        cruiseBase: 26,       // m/s základní tempomat
        cruiseBonusMax: 8,    // nárůst rychlosti s ujetou vzdáleností
        cruiseBonusPerKm: 1.6,
        accelGain: 1.4,
        brakeTarget: 2.5,     // cílová rychlost při brzdném smyku
        brakeGain: 2.8,
        cornerSlowK: 13,      // zpomalení podle křivosti před vozem
        cornerSlowMin: 0.8,

        gripFactor: 0.86,     // útlum boční rychlosti (grip)
        driftFactor: 0.985,   // útlum boční rychlosti (drift)
        gripLerp: 12,         // rychlost přechodu grip<->drift

        steerResponse: 9,     // lerp úhlové rychlosti
        driftSteerMul: 2.6,   // o kolik víc se stáčí nos v driftu
        driftKappaMin: 0.015, // minimální "apex" křivost driftu
        kP: 3.2,              // PD sledování silnice
        latCorr: 0.085,
        latCorrMax: 0.35,
        kSlip: 2.0,           // protiřízení při RECOVER
        lookaheadT: 0.8,      // s dopředu pro čtení zatáčky
        lookaheadMin: 10,     // m minimálně

        kappaStraight: 1 / 400,   // pod tímto = rovinka => brzdný smyk
        kappaHyst: 1 / 300,       // hystereze změny směru driftu
        hystTime: 0.15,

        fishtailFreq: 8.5,
        fishtailAmp: 0.32,

        offroadLat: 5.4,
        offroadDrag: 0.42,
        offroadTime: 1.6,
        spinoutTime: 0.9,
        spinoutSpeed: 8,
        crashSpeed: 6.5,      // m/s — náraz do balvanu nad tuto rychlost = konec
    },

    score: {
        driftTick: 5,           // bodů / 0.1 s driftu
        driftTickInterval: 0.1,
        slipMinDeg: 12,
        cleanCorner: 100,
        cleanCornerMinDrift: 0.8, // s driftu v zatáčce
        nearMiss: 50,
        nearMissSpeed: 15,
        nearMissDist: 2.6,
        prop: 10,
        propRateCap: 5,         // max bodovaných propů za sekundu
        campPerfect: 1000,
        campGood: 400,
        comboMax: 8,
        distPerM: 1,
    },

    camp: {
        firstAt: 500,
        spacing: 680,
        spacingJitter: 120,
        straightLen: 96,      // délka rovinky s kempem
        zoneLen: 13,
        zoneOffset: 52,       // kde v rovince zóna leží
        stopSpeed: 0.6,
        perfectDist: 2.2,
        timeout: 6,
        vanHalfLen: 2.3,
    },

    cam: {
        dist: 8.6,
        height: 3.5,
        lookAhead: 11,
        lookUp: 1.2,
        spring: 4.6,
        fovBase: 62,
        fovSpeed: 14,
        fovDrift: 2,
        fovSlowmo: -8,
        shake: 0.14,
        driftLag: 0.055,      // boční prodleva kamery při skluzu
    },

    fx: {
        smokeCount: 224,
        confettiCount: 96,
        tireSegments: 360,
        slowmoScale: 0.3,
        slowmoTime: 0.55,     // reálné sekundy
    },

    biomeLength: 2400,        // m na biom
    biomeBlend: 220,          // m přechodové pásmo
};

export const IS_MOBILE =
    typeof navigator !== 'undefined' &&
    (navigator.maxTouchPoints > 1 || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));

export const QUALITY = IS_MOBILE
    ? { pixelRatio: 1.5, shadow: 1024, bloomScale: 0.5, antialias: false, smoke: 128 }
    : { pixelRatio: Math.min(window.devicePixelRatio || 1, 2), shadow: 2048, bloomScale: 1, antialias: true, smoke: 224 };

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}
// deterministický RNG (mulberry32)
export function makeRng(seed) {
    let s = seed >>> 0;
    return function () {
        s |= 0; s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
