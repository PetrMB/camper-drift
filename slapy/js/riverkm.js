/* ============ Říční kilometráž: projekce polohy na osu Vltavy ============
   RIVER_AXIS (js/data/river.js) je lomená čára [[lat,lon],...] vedená po ose
   nádrže od hráze Slapy proti proudu, s kalibrací RIVER_KM_CAL
   [{i: index bodu, km: říční km}] podle oficiální kilometráže Vltavy. */
const RiverKM = (() => {
  let cum = null; // kumulativní vzdálenost podél osy [m]

  function build() {
    cum = [0];
    for (let i = 1; i < RIVER_AXIS.length; i++) {
      const [a, b] = [RIVER_AXIS[i - 1], RIVER_AXIS[i]];
      cum[i] = cum[i - 1] + GPS.haversine(a[0], a[1], b[0], b[1]);
    }
  }

  /* lineární interpolace km podle kalibračních bodů */
  function distToKm(d) {
    const cal = RIVER_KM_CAL;
    let j = 1;
    while (j < cal.length - 1 && d > cum[cal[j].i]) j++;
    const a = cal[j - 1], b = cal[j];
    const da = cum[a.i], db = cum[b.i];
    if (db === da) return a.km;
    return a.km + (b.km - a.km) * (d - da) / (db - da);
  }

  /* nejbližší bod na ose + vzdálenost od osy */
  function project(lat, lon) {
    if (!cum) build();
    let best = { dist: Infinity, along: 0 };
    for (let i = 1; i < RIVER_AXIS.length; i++) {
      const [alat, alon] = RIVER_AXIS[i - 1];
      const [blat, blon] = RIVER_AXIS[i];
      // rovinná aproximace v okolí segmentu (dostatečná pro <50 km)
      const kx = Math.cos(alat * Math.PI / 180) * 111320;
      const ky = 110574;
      const ax = 0, ay = 0;
      const bx = (blon - alon) * kx, by = (blat - alat) * ky;
      const px = (lon - alon) * kx, py = (lat - alat) * ky;
      const len2 = bx * bx + by * by;
      let t = len2 ? ((px - ax) * bx + (py - ay) * by) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const dx = px - t * bx, dy = py - t * by;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < best.dist) {
        best = { dist, along: cum[i - 1] + t * (cum[i] - cum[i - 1]) };
      }
    }
    return { km: distToKm(best.along), offAxis: best.dist };
  }

  /* souřadnice bodu na ose pro daný říční km (pro km značky na mapě) */
  function kmToPoint(km) {
    if (!cum) build();
    const cal = RIVER_KM_CAL;
    let j = 1;
    while (j < cal.length - 1 && km > cal[j].km) j++;
    const a = cal[j - 1], b = cal[j];
    const d = cum[a.i] + (cum[b.i] - cum[a.i]) * (km - a.km) / (b.km - a.km);
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    const [alat, alon] = RIVER_AXIS[i - 1];
    const [blat, blon] = RIVER_AXIS[i];
    return [alat + (blat - alat) * t, alon + (blon - alon) * t];
  }

  return { project, kmToPoint };
})();
