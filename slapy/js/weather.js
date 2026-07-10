/* ============ Počasí (Open-Meteo, bez klíče, CORS) ============ */
const Weather = (() => {
  const LAT = 49.79, LON = 14.40; // střed nádrže Slapy
  const URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,precipitation` +
    `&hourly=temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation_probability,weather_code` +
    `&daily=sunrise,sunset,wind_gusts_10m_max,precipitation_probability_max,temperature_2m_max` +
    `&forecast_days=3&timezone=Europe/Prague&wind_speed_unit=kmh`;

  const CODES = {
    0: ["jasno", "☀️"], 1: ["skoro jasno", "🌤"], 2: ["polojasno", "⛅"], 3: ["zataženo", "☁️"],
    45: ["mlha", "🌫"], 48: ["mlha", "🌫"],
    51: ["mrholení", "🌦"], 53: ["mrholení", "🌦"], 55: ["mrholení", "🌧"],
    61: ["slabý déšť", "🌦"], 63: ["déšť", "🌧"], 65: ["silný déšť", "🌧"],
    66: ["mrznoucí déšť", "🌧"], 67: ["mrznoucí déšť", "🌧"],
    71: ["sněžení", "🌨"], 73: ["sněžení", "🌨"], 75: ["sněžení", "❄️"], 77: ["sněžení", "❄️"],
    80: ["přeháňky", "🌦"], 81: ["přeháňky", "🌧"], 82: ["silné přeháňky", "⛈"],
    95: ["bouřka", "⛈"], 96: ["bouřka s kroupami", "⛈"], 99: ["bouřka s kroupami", "⛈"],
  };
  const DIRS = ["S", "SSV", "SV", "VSV", "V", "VJV", "JV", "JJV", "J", "JJZ", "JZ", "ZJZ", "Z", "ZSZ", "SZ", "SSZ"];

  let cache = null, cacheT = 0;

  async function fetchWx() {
    if (cache && Date.now() - cacheT < 10 * 60 * 1000) return cache;
    const r = await fetch(URL);
    if (!r.ok) throw new Error("weather http " + r.status);
    cache = await r.json();
    cacheT = Date.now();
    return cache;
  }

  return {
    fetch: fetchWx,
    codeInfo: c => CODES[c] || ["—", "❔"],
    windDir: deg => DIRS[Math.round(deg / 22.5) % 16],
    /* varování pro plavbu: bouřky nebo silné nárazy větru v příštích hodinách */
    boatingWarning(data) {
      if (!data) return null;
      const g = data.current.wind_gusts_10m;
      const code = data.current.weather_code;
      if (code >= 95) return "⛈ BOUŘKA v oblasti — okamžitě vyhledejte úkryt u břehu!";
      if (g >= 55) return `💨 Silné nárazy větru ${Math.round(g)} km/h — nebezpečné vlny, zvažte přerušení plavby.`;
      // nejbližších 6 hodin
      const now = new Date(data.current.time);
      const hrs = data.hourly.time
        .map((t, i) => ({ t: new Date(t), code: data.hourly.weather_code[i], g: data.hourly.wind_gusts_10m[i] }))
        .filter(h => h.t > now && h.t - now < 6 * 3600 * 1000);
      const storm = hrs.find(h => h.code >= 95);
      if (storm) return `⛈ Bouřky se očekávají kolem ${storm.t.getHours()}:00 — plánujte plavbu opatrně.`;
      const gusty = hrs.find(h => h.g >= 55);
      if (gusty) return `💨 Nárazy větru až ${Math.round(gusty.g)} km/h kolem ${gusty.t.getHours()}:00.`;
      return null;
    },
  };
})();
