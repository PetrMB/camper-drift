// Riviera Run — všechny laditelné konstanty na jednom místě

export const CONFIG = {
    road: {
        sampleStep: 2,        // m mezi vzorky centerline
        chunkSamples: 64,     // 128 m na chunk
        chunksAhead: 6,
        chunksBehind: 2,
        width: 9,             // šířka silnice
        edgeLine: 0.28,       // šířka krajnice
        centerDash: 3,        // m délka segmentu středové čáry
        centerGap: 6,         // m mezera mezi segmenty
        centerWidth: 0.15,    // m šířka středové čáry
        wheelTrackOffset: 1.7,  // m od osy — pozice vyjetých pruhů kol
        wheelTrackWidth: 0.9,   // m šířka vyjetého pruhu
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
        steerLatRate: 5.5,    // m/s posunu stopy při plném vychýlení (stopa drží, nevrací se)
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

    props: {
        reflectorSpacing: 12,  // m — odrazky na zídce u moře
        bollardSpacing: 18,    // m — patníky na pevninské straně
        bushSpacingMin: 7,     // m — keříky (levandule/oliva)
        bushSpacingMax: 16,
        boulderChance: 0.35,   // šance balvanu u krajnice na chunk
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
        dist: 9.6,
        height: 5.0,          // výš než střecha vozu — vidět přes něj na překážky
        lookAhead: 22,        // pohled dál dopředu = víc silnice v záběru
        lookUp: 0.9,
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

    sea: {
        ampBoostNear: 0.4,        // max. násobek amplitudy vln blízko kamery
        ampBoostDist: 140,        // m — do jaké vzdálenosti boost dozní
        sunShininessNarrow: 90,   // úzký spekulární lalok (jádro sluneční stopy) — sníženo z 200, dřív přes pow() zesiloval per-pixel aliasing třpytu do šachovnice
        sunShininessWide: 7,      // širší měkký glow kolem stopy — dál rozšířeno (nižší exponent), ať je třpyt vidět z víc úhlů/kamerových natočení i v poledne
        sunShininessWideNight: 30, // v noci mnohem užší lalok — široký na řídké síti dělá ostré ploché skvrny
        sunWideMix: 0.3,          // váha širšího glow vůči úzkému laloku — s clampem barvy (viz shader) může zůstat vyšší, aniž by při západu zaplavil hladinu
        sunWideMixNightScale: 0.4, // ztlumení wide laloku v noci
        sunGlintStrength: 1.3,    // celková síla odlesku — sníženo z 2.4, s clampem barvy (viz shader) dává úzkou zářivou dráhu místo floodlightu
        sunGlintNight: 0.2,       // ztlumení v noci (měsíční stříbrná stopa)
        specFadeNear: 55,         // m — odlesk dozní k nule mezi near/far (potlačí aliasing periodických vln u obzoru)
        specFadeFar: 190,
        glitterAmp: 0.012,        // síla mikro-třpytu — láme lalok na jiskřičky (dál sníženo, viz i frekvence + fade níže)
        glitterFadeNear: 22,      // m — od této vzdálenosti mikro-třpyt začíná mizet (drží ho jen blízko kamery)
        glitterFadeFar: 45,       // m — za touto vzdáleností je mikro-třpyt už nulový -> žádný per-pixel screen-door na zbytku hladiny
        foamThreshold: 0.78,      // práh výška+strmost -> zpěněný hřeben (sníženo z 1.55 — reálný rozsah vH/vSteep [0..~2.5] ho nikdy nepřekročil, pěna se nikdy nezobrazila)
        foamSoftness: 0.3,        // šířka přechodu prahu (smoothstep)
        foamSteepWeight: 2.6,     // váha strmosti vlny v prahu pěny (zvýšeno, ať strmé hřebeny pěnu spíš vyvolají)
        foamIntensity: 0.55,      // krytí bílou barvou v hřebeni (mírně sníženo z 0.75, ať jsou čepičky jemné a jen občasné, ne plná bílá plocha)
        shoreDist: 100,           // m od kamery — dosah mělčinového tyrkysu
        shoreStrength: 0.5,       // síla mělčinového přísvitu blízko pobřeží/kamery
    },

    dayLength: 2000,          // m na denní dobu
    dayBlend: 260,            // m přechodové pásmo

    sky: {
        sunSizeLow: 30,        // poloměr slunečního kotouče nízko nad obzorem (m)
        sunSizeHigh: 12,       // poloměr vysoko na obloze (v poledne)
        sunGlowLow: 100,       // poloměr měkkého glow sprite (nízko)
        sunGlowHigh: 40,       // poloměr glow sprite (vysoko)
        sunCoreBoostLow: 0.9,  // multiplikátor jasu jádra nízko nad obzorem (< 1 aby jádro nevypálilo bloomem do bíla; jas dodává sunGlow)
        sunCoreBoostHigh: 1.6, // multiplikátor jasu jádra vysoko na obloze (menší bílé slunce může být jasnější)
        sunHeightMin: 0.22,    // rozsah normalizované výšky slunce (sunDir.y) pro škálování
        sunHeightMax: 0.395,   // odpovídá sunDir.y poledního slunce (sunPos [30,25,-50]) => heightN ~= 1
        moonSize: 22,
        moonGlowSize: 70,
        starRadius: 430,       // poloměr kopule s hvězdami
        flareOffsets: [0.3, 0.56, 0.86],   // pozice na ose slunce->střed obrazu (0=u slunce, 1=u středu)
        flareSizes: [11, 20, 8],
        flareOpac: [0.6, 0.45, 0.3],       // výrazně čitelnější na teplé obloze (studenější barva, viz Sky)
        flareColor: 0xdcecff,   // studený kontrastní tón (odlišný od teplé oblohy)
        streakSize: [130, 3.2], // [délka, výška] horizontálního "anamorfního" streak prvku (m)
        streakOpac: 0.4,
    },

    // post-processing — filmový arkádový look (NFS Hot Pursuit): bloom + grading pass
    post: {
        // bloom (UnrealBloomPass) — jemně zesíleno oproti výchozím hodnotám three.js,
        // ať světla/slunce/odrazky víc žhnou, ale slunce na obloze nesmí vypálit půl obrazu
        bloomStrength: 0.42,
        bloomRadius: 0.6,
        bloomThreshold: 0.88,

        // grading pass (vlastní ShaderPass, vložený před OutputPass)
        contrast: 1.06,          // kontrast kolem pivotu 0.5 (1 = beze změny)
        saturation: 1.15,        // sytost barev, luma-preserving (1 = beze změny)
        vignette: 0.30,          // síla ztmavení v rozích (0..1)
        vignetteRadius: 0.58,    // poloměr (0=střed, 1=roh), od kterého vinětace začíná narůstat
        vignetteSoftness: 0.42,  // šířka přechodu — čím víc, tím měkčí okraj (nezasahuje střed/silnici)
        aberrationPx: 1.5,       // chromatická aberace na okraji obrazu (px), 0 ve středu
        aberrationStart: 0.35,   // poloměr (0=střed, 1=roh), od kterého aberace začíná narůstat
        tintAmount: 0.55,        // síla teplotního nádechu stínů podle denní doby (0 = vypnuto)
        tintNight: [-0.018, -0.006, 0.036],  // studený (modrý) nádech stínů v noci
        tintWarm: [0.032, 0.013, -0.02],     // teplý (oranžový) nádech stínů za západu/rána

        // speed-tint — jemné zesílení kontrastu/aberace na krajích při vysoké rychlosti (uSpeed 0..1)
        speedNorm: 34,             // m/s odpovídající uSpeed = 1 (~max tempomatu, viz physics.cruiseBase+cruiseBonusMax)
        speedContrastBoost: 0.05,  // přídavek ke kontrastu při plné rychlosti
        speedAberrationPx: 1.0,    // přídavek k CA na okraji obrazu (px) při plné rychlosti
    },
};

export const IS_MOBILE =
    typeof navigator !== 'undefined' &&
    (navigator.maxTouchPoints > 1 || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));

export const QUALITY = IS_MOBILE
    ? {
        pixelRatio: 1.5, shadow: 1024, bloomScale: 0.5, antialias: false, smoke: 128, seaSegs: 40, stars: 380,
        reflACount: 55, reflBCount: 20, bollardCount: 35, bushCount: 80, boulderCount: 10,
    }
    : {
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2), shadow: 2048, bloomScale: 1, antialias: true, smoke: 224, seaSegs: 72, stars: 750,
        reflACount: 100, reflBCount: 40, bollardCount: 70, bushCount: 160, boulderCount: 20,
    };

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
