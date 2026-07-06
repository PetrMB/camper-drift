// Riviera Run — všechny laditelné konstanty na jednom místě

export const CONFIG = {
    road: {
        sampleStep: 2,        // m mezi vzorky centerline
        chunkSamples: 64,     // 128 m na chunk
        chunksAhead: 6,
        chunksBehind: 2,
        width: 9,             // šířka silnice
        edgeLine: 0.28,       // šířka krajnice
    },

    elevation: {
        min: 4,               // nejnižší výška silnice nad mořem
        max: 22,              // nejvyšší (vrchol útesu)
        maxGrade: 0.07,       // max sklon
    },

    physics: {
        cruiseBase: 26,       // m/s základní tempomat
        cruiseBonusMax: 8,    // nárůst rychlosti s ujetou vzdáleností
        cruiseBonusPerKm: 1.6,
        accelGain: 1.4,
        brakeTarget: 9,       // cílová rychlost při brzdném smyku na rovince
        brakeGain: 2.2,
        cornerSlowK: 13,      // zpomalení podle křivosti před vozem
        cornerSlowMin: 0.8,

        gripFactor: 0.86,     // útlum boční rychlosti (grip)
        driftFactor: 0.985,   // útlum boční rychlosti (drift)
        gripLerp: 12,         // rychlost přechodu grip<->drift

        steerResponse: 9,     // lerp úhlové rychlosti
        steerLatMax: 3.3,     // max boční ofset řízením (m)
        steerLatLerp: 4.5,    // rychlost přesunu v pruhu
        steerDriftBias: 1.4,  // vliv řízení na drift (rad/s při plném vychýlení)
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
        fishtailAmp: 0.22,

        offroadLat: 5.4,
        offroadDrag: 0.42,
        offroadTime: 1.6,
        spinoutTime: 0.9,
        spinoutSpeed: 8,
        crashSpeed: 6.5,      // m/s — náraz do tvrdé překážky nad tuto rychlost = konec
        barrierCrashSpeed: 11, // náraz do zátarasu nad tuto rychlost = konec (pomalý dotek = jen kombo)
        railLat: 4.6,         // zídka u moře — za ní průraz (FX)
        seaFallLat: 6.1,      // za touto lat na straně moře vůz padá z útesu do moře
    },

    traffic: {
        startS: 260,          // od kolika metrů se objevuje provoz
        oncoming: 3,          // protijedoucí auta
        same: 2,              // pomalejší auta ve směru jízdy
        oncomingSpeed: [11, 16],  // m/s
        sameSpeed: [13, 17],
        laneOncoming: 2.3,    // lat protisměru (vlevo, pevnina)
        laneSame: -2.1,       // lat pomalých aut (vpravo, u moře)
        spawnAhead: [170, 420],
        despawnBehind: 70,
        cpClear: 60,          // odstup spawnu od policejních kontrol (m)
        hitS: 3.1,            // kolizní polodélka
        hitLat: 1.75,         // kolizní pološířka
        nearMissLat: 2.4,     // těsné minutí (rozdíl lat)
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
        propRateCap: 5,
        checkpoint: 500,        // čistý průjezd kontrolou
        comboMax: 8,
        distPerM: 1,
    },

    checkpoint: {
        firstAt: 450,
        spacing: 650,
        spacingJitter: 120,
        straightLen: 96,      // délka rovinky s kontrolou
        offset: 55,           // kde v rovince zátaras stojí
        gapHalf: 1.9,         // polovina šířky mezery
        gapLats: [-2.5, 0, 2.5], // možné pozice mezery
        barrierStep: 1.7,     // rozestup barikád
    },

    tunnel: {
        chance: 0.3,          // šance vložení tunelu za zatáčkou (tier 2+)
        lenMin: 44,
        lenMax: 76,
        lampStep: 10,
    },

    boats: {
        sailboats: 3,
        fishing: 2,
        yacht: 1,
        linerEvery: 2600,     // m — jak často připluje parník
        latMin: -38,          // vzdálenost od silnice (záporná = strana moře)
        latMax: -150,
    },

    cam: {
        dist: 8.6,
        height: 3.5,
        lookAhead: 11,
        lookUp: 1.2,
        spring: 4.6,
        ySpring: 5.5,
        fovBase: 62,
        fovSpeed: 14,
        fovDrift: 2,
        fovSlowmo: -8,
        shake: 0.14,
        driftLag: 0.055,
    },

    fx: {
        smokeCount: 224,
        confettiCount: 96,
        tireSegments: 360,
        slowmoScale: 0.35,
        slowmoTime: 0.4,
    },

    dayLength: 2000,          // m na denní dobu
    dayBlend: 260,            // m přechodové pásmo
};

export const IS_MOBILE =
    typeof navigator !== 'undefined' &&
    (navigator.maxTouchPoints > 1 || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));

export const QUALITY = IS_MOBILE
    ? { pixelRatio: 1.5, shadow: 1024, bloomScale: 0.5, antialias: false, smoke: 128, seaSegs: 40 }
    : { pixelRatio: Math.min(window.devicePixelRatio || 1, 2), shadow: 2048, bloomScale: 1, antialias: true, smoke: 224, seaSegs: 72 };

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
