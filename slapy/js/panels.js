/* ============ Obsah panelů: Místa / Plavba / Pravidla / Info ============ */
const Panels = (() => {
  let ctx = null;
  let currentTab = null;
  let container = null;
  let poiFilter = localStorage.getItem("slapy.poifilter") || "all";

  const TYPE_LABELS = {
    all: "Vše", marina: "⚓ Přístaviště", fuel: "⛽ Palivo", food: "🍽 Restaurace",
    camp: "🏕 Kempy", ferry: "⛴ Přívozy", rental: "🛥 Půjčovny",
    beach: "🏖 Pláže", sight: "🏰 Zajímavosti", rescue: "🚑 Záchrana", dam: "🧱 Hráze",
  };
  const POI_ICONS = {
    marina: "⚓", fuel: "⛽", food: "🍽", camp: "🏕", ferry: "⛴",
    rescue: "🚑", dam: "🧱", rental: "🛥", beach: "🏖", sight: "🏰", info: "ℹ️",
  };

  function fmtDist(m) { return m >= 1000 ? (m / 1000).toFixed(1) + " km" : Math.round(m) + " m"; }

  /* ---------- MÍSTA ---------- */
  function renderPlaces(el) {
    const fix = GPS.state.fix;
    const types = ["all", ...new Set(POIS.map(p => p.type))].filter(t => TYPE_LABELS[t]);
    const items = POIS
      .filter(p => poiFilter === "all" || p.type === poiFilter)
      .map(p => ({
        ...p,
        dist: fix ? GPS.haversine(fix.coords.latitude, fix.coords.longitude, p.lat, p.lon) : null,
      }))
      .sort((a, b) => (a.dist ?? 1e12) - (b.dist ?? 1e12) || a.name.localeCompare(b.name, "cs"));

    el.innerHTML = `
      <h2>⚓ Místa na Slapech</h2>
      <div class="poi-filters">${types.map(t =>
        `<button data-f="${t}" class="${t === poiFilter ? "on" : ""}">${TYPE_LABELS[t]}</button>`).join("")}
      </div>
      ${fix ? "" : `<p class="muted" style="margin-bottom:8px">Zapněte GPS pro řazení podle vzdálenosti.</p>`}
      ${items.map((p, i) => `
        <div class="poi-card" data-i="${i}">
          <div class="poi-ico">${POI_ICONS[p.type] || "📍"}</div>
          <div class="poi-body">
            <div class="poi-name">${p.name}</div>
            <div class="poi-sub">${p.desc || ""}${p.km ? ` · ř. km ${p.km}` : ""}</div>
          </div>
          ${p.dist != null ? `<div class="poi-dist">${fmtDist(p.dist)}</div>` : ""}
        </div>`).join("")}`;

    el.querySelectorAll(".poi-filters button").forEach(b => b.addEventListener("click", () => {
      poiFilter = b.dataset.f;
      localStorage.setItem("slapy.poifilter", poiFilter);
      renderPlaces(el);
    }));
    el.querySelectorAll(".poi-card").forEach(card => card.addEventListener("click", () => {
      const p = items[+card.dataset.i];
      ctx.map.setView([p.lat, p.lon], 16);
      document.getElementById("panel").hidden = true;
      document.querySelectorAll("#tabbar button").forEach(x => x.classList.toggle("active", x.dataset.tab === "map"));
    }));
  }

  /* ---------- PLAVBA (trip computer) ---------- */
  function renderTrip(el) {
    const s = GPS.state;
    const dur = s.trackStart && s.trackOn ? Date.now() - s.trackStart : 0;
    const durStr = dur ? `${Math.floor(dur / 3600000)}:${String(Math.floor(dur / 60000) % 60).padStart(2, "0")}` : "0:00";
    const pos = s.fix ? `${s.fix.coords.latitude.toFixed(5)}° N, ${s.fix.coords.longitude.toFixed(5)}° E` : "—";

    el.innerHTML = `
      <h2>📍 Plavba</h2>
      <div class="card">
        <div class="kv"><span>Poloha</span><b id="trip-pos">${pos}</b></div>
        <div class="kv"><span>Přesnost GPS</span><b>${s.fix ? Math.round(s.fix.coords.accuracy) + " m" : "—"}</b></div>
        <div class="kv"><span>Ujeto (záznam)</span><b>${(s.trackDist / 1000).toFixed(2)} km</b></div>
        <div class="kv"><span>Čas plavby</span><b>${durStr}</b></div>
        <div class="kv"><span>Max. rychlost</span><b>${s.maxSpeed.toFixed(1)} km/h</b></div>
      </div>
      <button class="bigbtn ${s.trackOn ? "danger" : "primary"}" id="trip-rec">
        ${s.trackOn ? "■ Zastavit záznam trasy" : "▶ Spustit záznam trasy"}</button>
      <button class="bigbtn" id="trip-gpx" ${s.track.length ? "" : "disabled"}>⬇ Export trasy (GPX)</button>
      <div class="card">
        <h3>⚓ Kotevní hlídka</h3>
        <p class="muted">Spustí alarm, pokud loď „utrhne" kotvu a posune se dál než zvolený poloměr.</p>
        ${s.anchor
          ? `<p style="margin-top:6px">Hlídám polohu — poloměr <b>${s.anchor.radius} m</b>, aktuální posun <b id="anchor-drift">${Math.round(GPS.anchorDrift() ?? 0)} m</b>.</p>
             <button class="bigbtn danger" id="anchor-off">Vypnout hlídku</button>`
          : `<div style="display:flex;gap:8px;margin-top:8px">
               ${[30, 50, 100].map(r => `<button class="bigbtn" style="margin:0" data-anchor="${r}">${r} m</button>`).join("")}
             </div>`}
      </div>
      <div class="card">
        <h3>🆘 Nouze na vodě</h3>
        <div class="kv"><span>Tísňová linka</span><b><a href="tel:112">112</a> / <a href="tel:155">155</a></b></div>
        <div class="kv"><span>VZS Slapy (Stará Živohošť)</span><b><a href="tel:+420607962552">607 962 552</a></b></div>
        <p class="muted" style="margin-top:6px">Tlačítko MOB na mapě označí místo pádu osoby do vody a povede vás zpět.</p>
      </div>`;

    el.querySelector("#trip-rec").addEventListener("click", () => {
      if (s.trackOn) GPS.stopTrack();
      else { if (!s.on) document.getElementById("gps-btn").click(); GPS.startTrack(); }
      renderTrip(el);
    });
    el.querySelector("#trip-gpx").addEventListener("click", () => GPS.exportGpx());
    el.querySelectorAll("[data-anchor]").forEach(b => b.addEventListener("click", () => {
      if (!s.fix) { ctx.showAlert("Nejdřív zapněte GPS", "warn", 4000); return; }
      GPS.setAnchor(+b.dataset.anchor);
      renderTrip(el);
    }));
    const off = el.querySelector("#anchor-off");
    if (off) off.addEventListener("click", () => { GPS.clearAnchor(); renderTrip(el); });
  }

  /* ---------- PRAVIDLA ---------- */
  function renderRules(el) {
    el.innerHTML = RULES_HTML;
  }

  /* ---------- INFO (počasí, hladina, kontakty) ---------- */
  function renderInfo(el) {
    el.innerHTML = `
      <h2>ℹ️ Informace</h2>
      <div class="card" id="wx-card"><h3>🌤 Počasí na Slapech</h3><p class="muted">Načítám…</p></div>
      <div class="card" id="level-card"><h3>💧 Vodní stav</h3><p class="muted">Načítám…</p></div>
      <div class="card">
        <h3>📞 Důležité kontakty</h3>
        <div class="kv"><span>Tíseň</span><b><a href="tel:112">112</a></b></div>
        <div class="kv"><span>Záchranná služba</span><b><a href="tel:155">155</a></b></div>
        <div class="kv"><span>VZS Slapy — Stará Živohošť</span><b><a href="tel:+420607962552">607 962 552</a></b></div>
        <div class="kv"><span>Poříční oddělení PČR Slapy</span><b><a href="tel:+420974882760">974 882 760</a></b></div>
        <div class="kv"><span>Státní plavební správa Praha</span><b><a href="tel:+420234637111">234 637 111</a></b></div>
        <div class="kv"><span>Přeprava lodí přes hráz (PVL)</span><b><a href="tel:+420606656432">606 656 432</a></b></div>
        <div class="kv"><span>Vltavská vodní cesta (RIS)</span><b><a href="https://lavdis.cz" target="_blank" rel="noopener">lavdis.cz</a></b></div>
      </div>
      <div class="card">
        <h3>🔗 Oficiální zdroje</h3>
        <ul>
          <li><a href="https://sps.gov.cz/downloads/ruzne/slapy-web-2024.pdf" target="_blank" rel="noopener">Schematická plavební mapa Slapy (SPS, PDF)</a></li>
          <li><a href="https://geoportal.plavebniurad.cz" target="_blank" rel="noopener">Geoportál Státní plavební správy</a></li>
          <li><a href="https://www.pvl.cz/portal/SaP/cz/pc/?" target="_blank" rel="noopener">Povodí Vltavy — stavy a průtoky</a></li>
          <li><a href="https://sps.gov.cz" target="_blank" rel="noopener">Státní plavební správa</a></li>
        </ul>
      </div>
      <div class="card">
        <h3>ℹ️ O aplikaci</h3>
        <p class="muted">Slapy Navigátor je nezávislá pomůcka pro vůdce malých plavidel.
        Nenahrazuje oficiální plavební mapu ani platná Opatření obecné povahy.
        Údaje o zónách a značení ověřujte podle aktuálního značení na vodě. Plavba na vlastní odpovědnost.</p>
      </div>`;

    /* počasí */
    Weather.fetch().then(d => {
      const [txt, ico] = Weather.codeInfo(d.current.weather_code);
      const warn = Weather.boatingWarning(d);
      const now = new Date();
      const hrs = d.hourly.time
        .map((t, i) => ({ t: new Date(t), i }))
        .filter(h => h.t >= now).slice(0, 12);
      el.querySelector("#wx-card").innerHTML = `
        <h3>🌤 Počasí na Slapech</h3>
        ${warn ? `<p><span class="badge warn">${warn}</span></p>` : ""}
        <div class="wx-now">
          <div class="wx-temp">${ico} ${Math.round(d.current.temperature_2m)}°</div>
          <div class="wx-wind">${txt}<br>
            vítr <b>${Math.round(d.current.wind_speed_10m)} km/h</b> ${Weather.windDir(d.current.wind_direction_10m)},
            nárazy <b>${Math.round(d.current.wind_gusts_10m)} km/h</b></div>
        </div>
        <div class="wx-hours">${hrs.map(h => {
          const [, hicon] = Weather.codeInfo(d.hourly.weather_code[h.i]);
          const g = d.hourly.wind_gusts_10m[h.i];
          return `<div class="wx-h ${g >= 45 ? "gusty" : ""}">
            <div>${h.t.getHours()}:00</div><div>${hicon}</div>
            <div class="t">${Math.round(d.hourly.temperature_2m[h.i])}°</div>
            <div class="w">💨${Math.round(g)}</div></div>`;
        }).join("")}</div>
        <div class="kv" style="margin-top:8px"><span>🌅 Východ / západ slunce</span>
          <b>${d.daily.sunrise[0].slice(11)} / ${d.daily.sunset[0].slice(11)}</b></div>
        <p class="muted" style="margin-top:4px">Malá plavidla bez plavebních svítilen smí plout jen od východu do západu slunce.</p>`;
    }).catch(() => {
      el.querySelector("#wx-card").innerHTML = `<h3>🌤 Počasí</h3><p class="muted">Počasí se nepodařilo načíst (offline?).</p>`;
    });

    loadLevelCard(el.querySelector("#level-card"));
  }

  /* ---------- vodní stav ----------
     ČHMÚ open data (stanice „Slapy nádrž" 0-203-1-153910) neposílají CORS
     hlavičky — pokus o přímé načtení obvykle selže, pak nabídneme odkazy. */
  const CHMI_URL = "https://opendata.chmi.cz/hydrology/now/data/0-203-1-153910.json";
  let levelCache = null;
  async function fetchLevel() {
    if (levelCache) return levelCache;
    const r = await fetch(CHMI_URL, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("chmi http " + r.status);
    const j = await r.json();
    const ts = j.objList?.[0]?.tsList || [];
    const series = code => {
      const s = ts.find(t => t.tsConID === code);
      const d = s?.tsData;
      return d?.length ? d[d.length - 1].value : null;
    };
    const level = series("H"), temp = series("TH") ?? series("T");
    if (level == null) throw new Error("no H series");
    levelCache = { level, temp };
    return levelCache;
  }
  function loadLevelCard(card) {
    fetchLevel().then(v => {
      card.innerHTML = `<h3>💧 Vodní stav VD Slapy</h3>
        <div class="kv"><span>Aktuální hladina</span><b>${v.level.toLocaleString("cs")} m n. m.</b></div>
        ${v.temp != null ? `<div class="kv"><span>Teplota vody</span><b>${v.temp.toLocaleString("cs")} °C</b></div>` : ""}
        <div class="kv"><span>Max. hladina zásobního prostoru</span><b>270,60 m n. m.</b></div>
        <p class="muted" style="margin-top:6px">Zdroj: ČHMÚ. Detaily: <a href="https://www.pvl.cz/portal/Nadrze/cz/pc/Mereni.aspx?id=VLSL&oid=2" target="_blank" rel="noopener">Povodí Vltavy — VD Slapy</a>.</p>`;
    }).catch(() => {
      card.innerHTML = `<h3>💧 Vodní stav VD Slapy</h3>
        <div class="kv"><span>Max. hladina zásobního prostoru</span><b>270,60 m n. m.</b></div>
        <div class="kv"><span>Obvyklá letní hladina</span><b>269–270,6 m n. m.</b></div>
        <p class="muted" style="margin-top:6px">Aktuální hladinu, přítok a odtok najdete na
        <a href="https://www.pvl.cz/portal/Nadrze/cz/pc/Mereni.aspx?id=VLSL&oid=2" target="_blank" rel="noopener">Povodí Vltavy — VD Slapy</a>
        nebo <a href="https://hydro.chmi.cz" target="_blank" rel="noopener">ČHMÚ hydro</a>.
        Při poklesu hladiny pozor na mělčiny v zátokách a u vývazišť.</p>`;
    });
  }
  function loadLevel(elVal) {
    fetchLevel().then(v => { elVal.textContent = Math.round(v.level); }).catch(() => { elVal.textContent = "≈270"; });
  }

  /* ---------- veřejné API ---------- */
  return {
    render(tab, el, context) {
      ctx = context;
      currentTab = tab;
      container = el;
      ({ places: renderPlaces, trip: renderTrip, rules: renderRules, info: renderInfo }[tab] || renderPlaces)(el);
      el.scrollTop = 0;
    },
    /* živé překreslení hodnot při GPS updatu (bez plného rerenderu) */
    refreshLive() {
      if (!container || document.getElementById("panel").hidden) return;
      if (currentTab === "trip") {
        const s = GPS.state;
        const pos = container.querySelector("#trip-pos");
        if (pos && s.fix) pos.textContent =
          `${s.fix.coords.latitude.toFixed(5)}° N, ${s.fix.coords.longitude.toFixed(5)}° E`;
        const dr = container.querySelector("#anchor-drift");
        if (dr) dr.textContent = Math.round(GPS.anchorDrift() ?? 0) + " m";
      }
    },
    loadLevel,
  };
})();
