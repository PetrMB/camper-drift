/* ============ GPS: poloha, rychlost, kurz, záznam plavby ============ */
const GPS = (() => {
  const state = {
    on: false,
    watchId: null,
    fix: null,          // poslední GeolocationPosition
    speedKmh: null,     // vyhlazená rychlost
    course: null,       // stupně 0-360
    track: [],          // [{lat,lon,t,spd}]
    trackOn: false,
    trackDist: 0,       // m
    trackStart: null,
    maxSpeed: 0,
    anchor: null,       // {lat,lon,radius}
    listeners: [],
  };

  const R = 6371000;
  function haversine(lat1, lon1, lat2, lon2) {
    const toR = Math.PI / 180;
    const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function bearing(lat1, lon1, lat2, lon2) {
    const toR = Math.PI / 180;
    const y = Math.sin((lon2 - lon1) * toR) * Math.cos(lat2 * toR);
    const x = Math.cos(lat1 * toR) * Math.sin(lat2 * toR) -
      Math.sin(lat1 * toR) * Math.cos(lat2 * toR) * Math.cos((lon2 - lon1) * toR);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function onFix(pos) {
    const prev = state.fix;
    state.fix = pos;
    const { latitude: lat, longitude: lon, speed, heading } = pos.coords;

    // rychlost: preferuj GPS speed, jinak dopočti z posunu
    let kmh = null;
    if (speed != null && !Number.isNaN(speed)) {
      kmh = speed * 3.6;
    } else if (prev) {
      const dt = (pos.timestamp - prev.timestamp) / 1000;
      if (dt > 0.5) kmh = haversine(prev.coords.latitude, prev.coords.longitude, lat, lon) / dt * 3.6;
    }
    if (kmh != null) {
      state.speedKmh = state.speedKmh == null ? kmh : state.speedKmh * 0.6 + kmh * 0.4;
      if (state.speedKmh < 0.6) state.speedKmh = 0;
      if (state.trackOn && state.speedKmh > state.maxSpeed) state.maxSpeed = state.speedKmh;
    }

    // kurz: GPS heading jen při pohybu, jinak z posunu
    if (heading != null && !Number.isNaN(heading) && (state.speedKmh || 0) > 1) {
      state.course = heading;
    } else if (prev && (state.speedKmh || 0) > 1.5) {
      const d = haversine(prev.coords.latitude, prev.coords.longitude, lat, lon);
      if (d > 3) state.course = bearing(prev.coords.latitude, prev.coords.longitude, lat, lon);
    }

    // záznam trasy
    if (state.trackOn) {
      const last = state.track[state.track.length - 1];
      if (!last || haversine(last.lat, last.lon, lat, lon) > 5) {
        if (last) state.trackDist += haversine(last.lat, last.lon, lat, lon);
        state.track.push({ lat, lon, t: pos.timestamp, spd: state.speedKmh || 0 });
      }
    }

    state.listeners.forEach(f => f(state));
  }

  function onErr(err) {
    state.on = false;
    state.watchId = null;
    state.listeners.forEach(f => f(state, err));
  }

  return {
    state,
    haversine,
    bearing,
    onUpdate(f) { state.listeners.push(f); },

    start() {
      if (state.watchId != null || !navigator.geolocation) return;
      state.on = true;
      state.watchId = navigator.geolocation.watchPosition(onFix, onErr, {
        enableHighAccuracy: true, maximumAge: 1000, timeout: 15000,
      });
    },
    stop() {
      if (state.watchId != null) navigator.geolocation.clearWatch(state.watchId);
      state.watchId = null;
      state.on = false;
      state.speedKmh = null;
    },

    startTrack() {
      state.trackOn = true;
      state.track = [];
      state.trackDist = 0;
      state.maxSpeed = 0;
      state.trackStart = Date.now();
    },
    stopTrack() { state.trackOn = false; },

    /* export zaznamenané trasy jako GPX soubor */
    exportGpx() {
      if (!state.track.length) return null;
      const pts = state.track.map(p =>
        `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><time>${new Date(p.t).toISOString()}</time></trkpt>`
      ).join("\n      ");
      const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Slapy Navigátor" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Plavba Slapy ${new Date(state.trackStart).toLocaleDateString("cs")}</name>
    <trkseg>
      ${pts}
    </trkseg>
  </trk>
</gpx>`;
      const blob = new Blob([gpx], { type: "application/gpx+xml" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `plavba-slapy-${new Date(state.trackStart).toISOString().slice(0, 16).replace(/[:T]/g, "-")}.gpx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      return true;
    },

    /* kotevní hlídka */
    setAnchor(radius) {
      if (!state.fix) return false;
      state.anchor = { lat: state.fix.coords.latitude, lon: state.fix.coords.longitude, radius };
      return true;
    },
    clearAnchor() { state.anchor = null; },
    anchorDrift() {
      if (!state.anchor || !state.fix) return null;
      return haversine(state.anchor.lat, state.anchor.lon,
        state.fix.coords.latitude, state.fix.coords.longitude);
    },
  };
})();
