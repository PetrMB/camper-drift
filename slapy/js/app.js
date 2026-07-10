/* ============ Slapy Navigátor — hlavní logika ============ */
(() => {
  "use strict";

  /* ---------- mapa a podklady ---------- */
  const map = L.map("map", {
    center: [49.795, 14.401],
    zoom: 13,
    zoomControl: false,
    attributionControl: true,
    maxBounds: [[49.50, 13.95], [49.95, 14.70]],
    maxBoundsViscosity: 0.6,
  });
  L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

  const BASES = {
    ztm: L.tileLayer("https://ags.cuzk.gov.cz/arcgis1/rest/services/ZTM_WM/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 20, maxNativeZoom: 19,
      attribution: "© <a href='https://cuzk.gov.cz'>ČÚZK</a>",
    }),
    orto: L.tileLayer("https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO_WM/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 20, maxNativeZoom: 19,
      attribution: "© <a href='https://cuzk.gov.cz'>ČÚZK</a> ortofoto",
    }),
    osm: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>",
    }),
  };
  const seamark = L.tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", {
    maxZoom: 18, opacity: 0.9,
    attribution: "© <a href='https://www.openseamap.org'>OpenSeaMap</a>",
  });

  let currentBase = localStorage.getItem("slapy.base") || "ztm";
  if (!BASES[currentBase]) currentBase = "ztm";
  BASES[currentBase].addTo(map);
  let seamarkOn = localStorage.getItem("slapy.seamark") !== "0";
  if (seamarkOn) seamark.addTo(map);

  /* ---------- osa řeky + km značky ---------- */
  L.polyline(RIVER_AXIS, { color: "#2fb4ff", weight: 1.5, opacity: 0.5, dashArray: "6 8", interactive: false }).addTo(map);
  const kmLayer = L.layerGroup().addTo(map);
  const KM_MIN = RIVER_KM_CAL[0].km, KM_MAX = RIVER_KM_CAL[RIVER_KM_CAL.length - 1].km;
  for (let km = Math.ceil(KM_MIN); km <= Math.floor(KM_MAX); km++) {
    const pt = RiverKM.kmToPoint(km);
    L.marker(pt, {
      interactive: false,
      icon: L.divIcon({ className: "km-label", html: `<div>${km}</div>`, iconSize: [30, 14], iconAnchor: [15, 7] }),
    }).addTo(kmLayer);
  }
  map.on("zoomend", () => {
    const z = map.getZoom();
    if (z >= 13 && !map.hasLayer(kmLayer)) map.addLayer(kmLayer);
    if (z < 13 && map.hasLayer(kmLayer)) map.removeLayer(kmLayer);
  });

  /* ---------- zóny ---------- */
  const zoneLayer = L.layerGroup().addTo(map);
  ZONES.forEach(z => {
    const style = {
      danger: { color: "#ff4d4d", fillColor: "#ff4d4d", fillOpacity: 0.22, weight: 2 },
      ski: { color: "#ffb02f", fillColor: "#ffb02f", fillOpacity: 0.18, weight: 2 },
      swim: { color: "#35d07f", fillColor: "#35d07f", fillOpacity: 0.18, weight: 2 },
      info: { color: "#2fb4ff", fillColor: "#2fb4ff", fillOpacity: 0.12, weight: 1.5, dashArray: "4 6" },
    }[z.kind] || {};
    const shape = z.circle
      ? L.circle(z.circle.center, { radius: z.circle.radius, ...style })
      : L.polygon(z.poly, style);
    shape.bindPopup(`<b>${z.name}</b><br><span class="muted">${z.desc}</span>`);
    shape.addTo(zoneLayer);
  });

  /* ---------- POI ---------- */
  const POI_ICONS = {
    marina: "⚓", fuel: "⛽", food: "🍽", camp: "🏕", ferry: "⛴",
    rescue: "🚑", dam: "🧱", rental: "🛥", beach: "🏖", sight: "🏰", info: "ℹ️",
  };
  const poiLayer = L.layerGroup().addTo(map);
  const poiMarkers = [];
  POIS.forEach(p => {
    const m = L.marker([p.lat, p.lon], {
      icon: L.divIcon({
        className: "poi-label",
        html: `<div>${POI_ICONS[p.type] || "📍"} ${p.name}</div>`,
        iconSize: [0, 0],
      }),
    });
    const linkHtml = p.web ? `<br><a href="${p.web}" target="_blank" rel="noopener">web</a>` : "";
    const telHtml = p.tel ? ` · <a href="tel:${p.tel.replace(/ /g, "")}">${p.tel}</a>` : "";
    m.bindPopup(
      `<b>${POI_ICONS[p.type] || ""} ${p.name}</b><br>` +
      `<span class="muted">${p.desc || ""}${p.km ? ` · ř. km ${p.km}` : ""}</span>${linkHtml}${telHtml}` +
      `<div class="popup-actions"><button data-nav="${p.lat},${p.lon}">Navigovat ▸</button></div>`
    );
    m.addTo(poiLayer);
    poiMarkers.push({ p, m });
  });
  map.on("popupopen", e => {
    const btn = e.popup.getElement().querySelector("[data-nav]");
    if (btn) btn.addEventListener("click", () => {
      const [lat, lon] = btn.dataset.nav.split(",").map(Number);
      setTarget(lat, lon, e.popup.getContent().match(/<b>(.*?)<\/b>/)?.[1]?.replace(/<[^>]+>/g, "") || "cíl");
      map.closePopup();
    });
  });

  /* ---------- loďka (vlastní poloha) ---------- */
  const boatIcon = heading => L.divIcon({
    className: "boat-marker",
    html: `<svg width="46" height="46" viewBox="-23 -23 46 46" style="transform:rotate(${heading || 0}deg)">
      <circle r="21" fill="rgba(47,180,255,.15)"/>
      <path d="M0,-15 L8,10 L0,5 L-8,10 Z" fill="#2fb4ff" stroke="#eaf3f9" stroke-width="1.6"/>
    </svg>`,
    iconSize: [46, 46], iconAnchor: [23, 23],
  });
  let boatMarker = null, accCircle = null, followMe = true, courseUp = false;
  let trackLine = null;

  /* ---------- cíl / navigace na bod ---------- */
  let target = null, targetMarker = null, targetLine = null;
  const targetInfo = document.getElementById("target-info");
  const targetText = document.getElementById("target-text");

  function setTarget(lat, lon, name) {
    clearTarget();
    target = { lat, lon, name: name || "cíl" };
    targetMarker = L.marker([lat, lon], {
      icon: L.divIcon({ className: "poi-label", html: `<div>🎯 ${target.name}</div>`, iconSize: [0, 0] }),
    }).addTo(map);
    updateTarget();
    targetInfo.hidden = false;
  }
  function clearTarget() {
    target = null;
    if (targetMarker) { map.removeLayer(targetMarker); targetMarker = null; }
    if (targetLine) { map.removeLayer(targetLine); targetLine = null; }
    targetInfo.hidden = true;
  }
  document.getElementById("target-clear").addEventListener("click", clearTarget);

  function updateTarget() {
    if (!target) return;
    const fix = GPS.state.fix;
    if (!fix) {
      targetText.innerHTML = `🎯 ${target.name}<br><small>zapněte GPS pro vzdálenost a kurz</small>`;
      return;
    }
    const { latitude: lat, longitude: lon } = fix.coords;
    const d = GPS.haversine(lat, lon, target.lat, target.lon);
    const brg = GPS.bearing(lat, lon, target.lat, target.lon);
    const spd = GPS.state.speedKmh || 0;
    let eta = "";
    if (spd > 1) {
      const min = Math.round(d / 1000 / spd * 60);
      eta = ` · ETA ${min >= 60 ? Math.floor(min / 60) + " h " + (min % 60) + " min" : min + " min"}`;
    }
    targetText.innerHTML =
      `🎯 ${target.name}: <b>${d >= 1000 ? (d / 1000).toFixed(1) + " km" : Math.round(d) + " m"}</b>` +
      ` · kurz ${Math.round(brg)}°${eta}`;
    if (targetLine) map.removeLayer(targetLine);
    targetLine = L.polyline([[lat, lon], [target.lat, target.lon]],
      { color: "#ffb02f", weight: 2, dashArray: "8 6", interactive: false }).addTo(map);
  }

  /* dlouhé podržení na mapě = cíl */
  let pressTimer = null;
  map.on("mousedown touchstart", () => {});
  map.on("contextmenu", e => setTarget(e.latlng.lat, e.latlng.lng, "bod na mapě"));

  /* ---------- MOB ---------- */
  document.getElementById("fab-mob").addEventListener("click", () => {
    const fix = GPS.state.fix;
    if (!fix) { showAlert("MOB: nejdřív zapněte GPS", "warn", 4000); return; }
    setTarget(fix.coords.latitude, fix.coords.longitude, "MOB — osoba ve vodě");
    showAlert("🆘 MOB označen! Otočte plavidlo, osoba po směru linky.", "", 8000);
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
  });

  /* ---------- stavový pruh ---------- */
  const $ = id => document.getElementById(id);
  const speedVal = $("speed-val"), speedUnit = $("speed-unit"),
        courseVal = $("course-val"), kmVal = $("km-val"), levelVal = $("level-val");
  let unitKn = localStorage.getItem("slapy.kn") === "1";
  $("stat-speed").addEventListener("click", () => {
    unitKn = !unitKn;
    localStorage.setItem("slapy.kn", unitKn ? "1" : "0");
    renderStatus();
  });

  const alertbar = $("alertbar");
  let alertTimer = null;
  function showAlert(msg, cls = "", ms = 0) {
    alertbar.textContent = msg;
    alertbar.className = cls;
    alertbar.hidden = false;
    if (alertTimer) clearTimeout(alertTimer);
    if (ms) alertTimer = setTimeout(() => { alertbar.hidden = true; }, ms);
  }
  function hideAlert() { alertbar.hidden = true; }

  /* zóny — kontrola vstupu do nebezpečné zóny */
  function pointInPoly(lat, lon, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [yi, xi] = poly[i], [yj, xj] = poly[j];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function zoneAt(lat, lon) {
    return ZONES.find(z => {
      if (z.circle) return GPS.haversine(lat, lon, z.circle.center[0], z.circle.center[1]) < z.circle.radius;
      return pointInPoly(lat, lon, z.poly);
    });
  }

  let lastZoneWarn = "";
  function renderStatus() {
    const s = GPS.state;
    if (s.speedKmh == null) {
      speedVal.textContent = "—";
    } else {
      speedVal.textContent = unitKn ? (s.speedKmh / 1.852).toFixed(1) : s.speedKmh.toFixed(s.speedKmh < 10 ? 1 : 0);
    }
    speedUnit.textContent = unitKn ? "uzly" : "km/h";
    courseVal.textContent = s.course == null ? "—" : Math.round(s.course) + "°";

    if (s.fix) {
      const { latitude: lat, longitude: lon } = s.fix.coords;
      const pr = RiverKM.project(lat, lon);
      kmVal.textContent = pr.offAxis < 1200 ? pr.km.toFixed(1) : "—";

      const z = zoneAt(lat, lon);
      if (z && z.kind === "danger") {
        if (lastZoneWarn !== z.name) { showAlert("⚠️ " + z.name + " — " + z.desc); lastZoneWarn = z.name; }
      } else if (lastZoneWarn) { hideAlert(); lastZoneWarn = ""; }
    }

    /* kotevní hlídka */
    const drift = GPS.anchorDrift();
    if (drift != null && drift > GPS.state.anchor.radius) {
      showAlert(`⚓ KOTVA DRŽÍ ŠPATNĚ — posun ${Math.round(drift)} m!`);
      if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
    }
  }

  /* ---------- GPS tlačítko a odběr ---------- */
  const gpsBtn = $("gps-btn");
  gpsBtn.addEventListener("click", () => {
    if (GPS.state.on) {
      GPS.stop();
      gpsBtn.className = "gps-off";
      renderStatus();
    } else {
      gpsBtn.className = "gps-wait";
      GPS.start();
    }
  });

  GPS.onUpdate((s, err) => {
    if (err) {
      gpsBtn.className = "gps-off";
      showAlert("GPS nedostupné: povolte polohu v prohlížeči", "warn", 6000);
      return;
    }
    gpsBtn.className = "gps-on";
    const { latitude: lat, longitude: lon, accuracy } = s.fix.coords;
    if (!boatMarker) {
      boatMarker = L.marker([lat, lon], { icon: boatIcon(s.course), zIndexOffset: 1000 }).addTo(map);
      accCircle = L.circle([lat, lon], { radius: accuracy, color: "#2fb4ff", weight: 1, fillOpacity: 0.08, interactive: false }).addTo(map);
      map.setView([lat, lon], Math.max(map.getZoom(), 15));
    } else {
      boatMarker.setLatLng([lat, lon]);
      boatMarker.setIcon(boatIcon(courseUp ? 0 : s.course));
      accCircle.setLatLng([lat, lon]).setRadius(accuracy);
    }
    if (followMe) map.panTo([lat, lon], { animate: true, duration: 0.4 });
    if (courseUp && s.course != null) {
      map.getContainer().style.setProperty("--rot", `${-s.course}deg`);
    }
    if (s.trackOn) {
      const pts = s.track.map(p => [p.lat, p.lon]);
      if (!trackLine) trackLine = L.polyline(pts, { color: "#35d07f", weight: 3, opacity: 0.8, interactive: false }).addTo(map);
      else trackLine.setLatLngs(pts);
    }
    renderStatus();
    updateTarget();
    Panels.refreshLive();
  });

  map.on("dragstart", () => { followMe = false; $("fab-locate").classList.remove("active"); });
  $("fab-locate").addEventListener("click", () => {
    followMe = true;
    $("fab-locate").classList.add("active");
    if (GPS.state.fix) map.panTo([GPS.state.fix.coords.latitude, GPS.state.fix.coords.longitude]);
    else if (!GPS.state.on) gpsBtn.click();
  });

  /* orientace mapy (sever / kurz) — jen ikona, plná rotace mapy není v Leafletu nativní */
  $("fab-north").addEventListener("click", () => {
    courseUp = !courseUp;
    $("fab-north").classList.toggle("course-up", courseUp);
    $("fab-north").textContent = courseUp ? "K↑" : "N↑";
  });

  /* ---------- přepínač vrstev ---------- */
  let layerMenu = null;
  $("fab-layers").addEventListener("click", () => {
    if (layerMenu) { layerMenu.remove(); layerMenu = null; return; }
    layerMenu = document.createElement("div");
    layerMenu.id = "layer-menu";
    layerMenu.innerHTML = `
      <button data-base="ztm">Turistická (ČÚZK)</button>
      <button data-base="orto">Letecká (ortofoto)</button>
      <button data-base="osm">OpenStreetMap</button>
      <label><input type="checkbox" id="lm-sea" ${seamarkOn ? "checked" : ""}> Plavební znaky</label>
      <label><input type="checkbox" id="lm-poi" ${map.hasLayer(poiLayer) ? "checked" : ""}> Místa</label>
      <label><input type="checkbox" id="lm-zone" ${map.hasLayer(zoneLayer) ? "checked" : ""}> Zóny</label>`;
    document.body.appendChild(layerMenu);
    layerMenu.querySelectorAll("[data-base]").forEach(b => {
      b.classList.toggle("on", b.dataset.base === currentBase);
      b.addEventListener("click", () => {
        map.removeLayer(BASES[currentBase]);
        currentBase = b.dataset.base;
        localStorage.setItem("slapy.base", currentBase);
        BASES[currentBase].addTo(map);
        BASES[currentBase].bringToBack();
        layerMenu.querySelectorAll("[data-base]").forEach(x => x.classList.toggle("on", x.dataset.base === currentBase));
      });
    });
    layerMenu.querySelector("#lm-sea").addEventListener("change", e => {
      seamarkOn = e.target.checked;
      localStorage.setItem("slapy.seamark", seamarkOn ? "1" : "0");
      seamarkOn ? seamark.addTo(map) : map.removeLayer(seamark);
    });
    layerMenu.querySelector("#lm-poi").addEventListener("change", e =>
      e.target.checked ? poiLayer.addTo(map) : map.removeLayer(poiLayer));
    layerMenu.querySelector("#lm-zone").addEventListener("change", e =>
      e.target.checked ? zoneLayer.addTo(map) : map.removeLayer(zoneLayer));
  });

  /* ---------- taby a panel ---------- */
  const panel = $("panel"), panelContent = $("panel-content");
  const tabs = document.querySelectorAll("#tabbar button");
  let activeTab = "map";
  tabs.forEach(b => b.addEventListener("click", () => {
    tabs.forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    activeTab = b.dataset.tab;
    if (activeTab === "map") {
      panel.hidden = true;
    } else {
      panel.hidden = false;
      Panels.render(activeTab, panelContent, { map, setTarget, showAlert });
    }
  }));
  $("panel-handle").addEventListener("click", () => {
    panel.hidden = true;
    tabs.forEach(x => x.classList.toggle("active", x.dataset.tab === "map"));
    activeTab = "map";
  });

  /* ---------- hladina + počasí do stavového pruhu ---------- */
  Panels.loadLevel(levelVal);
  Weather.fetch().then(d => {
    const warn = Weather.boatingWarning(d);
    if (warn) showAlert(warn, "warn", 12000);
  }).catch(() => {});

  /* ---------- service worker ---------- */
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  /* expose pro panely */
  window.SlapyApp = { map, setTarget, showAlert, poiMarkers };
})();
