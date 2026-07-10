/* ============ Místa na VN Slapy ============
   Sestaveno z podkladů SPS, Povodí Vltavy, slapy.cz a webů provozovatelů (7/2026).
   Polohy označené v popisu „orientační" mají přesnost ~100–300 m. */
const POIS = [
  /* --- hráze a technické stavby --- */
  { type: "dam", name: "Hráz VD Slapy", lat: 49.8255, lon: 14.4313, km: 91.6,
    desc: "Konec splavnosti. Přeprava lodí přes hráz (PVL): traktor s vlekem, 1. 5.–30. 9. Po/St/Pá/So/Ne 8–18 h, max. 8,5 m / 2,6 m / 3,5 t. Rezervace: rezervace.pvl.cz",
    tel: "+420 606 656 432", web: "https://www.pvl.cz/vodohospodarske-informace/informace-k-plavbe/informace-k-preprave-lodi-pres-vd-slapy-a-vd-orlik" },
  { type: "dam", name: "Hráz VD Kamýk", lat: 49.64407, lon: 14.2518, km: 134.73,
    desc: "Horní konec nádrže Slapy. Zákaz přiblížení k hrázi — proudění při špičkování elektrárny." },
  { type: "sight", name: "Živohošťský most", lat: 49.76768, lon: 14.41154, km: 100.51,
    desc: "Silniční most II/114. Poblíž „zátoka vraků“ — vyhledávaná potápěčská lokalita." },
  { type: "sight", name: "Vestecký most", lat: 49.67976, lon: 14.27632, km: 128.93,
    desc: "Nad mostem klesá plavební ponor z 2,2 m na 1,7 m (orientační poloha)." },

  /* --- přístaviště, mariny, kotviště --- */
  { type: "marina", name: "Přístaviště Nová Rabyně", lat: 49.8085, lon: 14.4245, km: 93.9,
    desc: "Molo linkové lodní dopravy, autokemp a pláž (orientační poloha)." },
  { type: "marina", name: "Přístav Ždáň", lat: 49.79633, lon: 14.42529, km: 96.4,
    desc: "Přístaviště a půjčovna na poloostrově Ždáň, denně 10–19 h.", tel: "+420 777 215 134", web: "https://www.pujcovna-slapy.cz" },
  { type: "marina", name: "Slapy Marine — Skalice", lat: 49.7965, lon: 14.4325, km: 95.7,
    desc: "Marina u autocampu Skalice, celoroční kotvení, vodní bar; u plochy pro skútry (orientační poloha).", web: "https://slapy-marine.cz" },
  { type: "marina", name: "Marina Atlantida — Stará Živohošť", lat: 49.7465, lon: 14.402, km: 105.0,
    desc: "Marina se 110 místy u hotelu Atlantida, pitná voda, odsávání fekálií.",
    tel: "+420 318 543 345", web: "https://www.hotelatlantida.cz" },
  { type: "marina", name: "River Marina — Nová Živohošť", lat: 49.75, lon: 14.4085, km: 104.4,
    desc: "Kotvení lodí i skútrů, glamping (orientační poloha).", tel: "+420 777 251 659", web: "https://www.river-marina.cz" },
  { type: "marina", name: "Kotviště Kobylníky", lat: 49.737, lon: 14.389, km: 106.53,
    desc: "Sportovní kotviště pro 6 plavidel (PVL), občerstvení v osadě." },
  { type: "marina", name: "Zátoka Čelina", lat: 49.73048, lon: 14.36099, km: 110.8,
    desc: "Klidná zátoka na levém břehu vhodná ke kotvení a nocování (orientační poloha)." },
  { type: "marina", name: "Oboz — Green Resort Slapy", lat: 49.72123, lon: 14.35698, km: 112.43,
    desc: "Rekreační středisko s kotvištěm na pravém břehu (orientační poloha)." },
  { type: "marina", name: "Svatojánská zátoka", lat: 49.82384, lon: 14.42675, km: 92.1,
    desc: "Zátoka ke kotvení u hráze, levý břeh (orientační poloha)." },
  { type: "marina", name: "Zátoka Cihelna", lat: 49.81809, lon: 14.42544, km: 92.7,
    desc: "Zátoka ke kotvení, levý břeh (orientační poloha)." },
  { type: "marina", name: "Lahozská zátoka", lat: 49.81583, lon: 14.42443, km: 93.0,
    desc: "Zátoka ke kotvení, levý břeh (orientační poloha)." },

  /* --- palivo --- */
  { type: "fuel", name: "Čerpací stanice na vodě — Atlantida", lat: 49.7462, lon: 14.4023, km: 105.0,
    desc: "Jediná lodní čerpací stanice na Vltavě: benzin, nafta, pitná voda, odsávání fekálií. Stará Živohošť.",
    tel: "+420 318 543 345", web: "https://www.hotelatlantida.cz" },

  /* --- přívoz --- */
  { type: "ferry", name: "Přívoz Stará ↔ Nová Živohošť", lat: 49.748, lon: 14.4045, km: 104.7,
    desc: "Sezónní přívoz (VI–VIII, v červnu jen Pá–Ne), cca 10:15–19:00, přejezd 2 min." },

  /* --- záchrana a úřady --- */
  { type: "rescue", name: "VZS ČČK Slapy — Stará Živohošť", lat: 49.7473, lon: 14.4028, km: 104.9,
    desc: "Základna Vodní záchranné služby u přívozu. V nouzi volejte 607 962 552 nebo 155/112.",
    tel: "+420 607 962 552" },
  { type: "rescue", name: "Poříční oddělení Policie ČR — Slapy", lat: 49.822, lon: 14.431, km: 91.9,
    desc: "Třebenice 49. Hlášení plavebních nehod a krádeží plavidel (orientační poloha).",
    tel: "+420 974 882 760" },

  /* --- kempy, restaurace, pláže --- */
  { type: "food", name: "Hotel VZ Měřín", lat: 49.7893, lon: 14.4302, km: 97.6,
    desc: "Hotel s restaurací, molo a pláž v Měřínské zátoce, pravý břeh." },
  { type: "food", name: "Hrdlička", lat: 49.78989, lon: 14.41223, km: 97.85,
    desc: "Zátoka s občerstvením, konec sezónního výtlačného úseku (orientační poloha)." },
  { type: "food", name: "Bongo Bongo Beach & přístav U Kozla", lat: 49.74906, lon: 14.4071, km: 104.4,
    desc: "Plážová restaurace a půjčovna, Nová Živohošť.", tel: "+420 725 711 553", web: "https://www.pujcovna-slapy.cz" },
  { type: "camp", name: "Juniorcamp Nová Živohošť", lat: 49.75294, lon: 14.41067, km: 104.2,
    desc: "Kemp s plážemi, vedle veřejné tábořiště." },
  { type: "camp", name: "Kemp Cholín", lat: 49.71802, lon: 14.33057, km: 115.0,
    desc: "Kemp s restaurací na levém břehu u Cholínského mostu; molo linkové dopravy na protějším břehu." },
  { type: "beach", name: "Pláž Županovice", lat: 49.694, lon: 14.303, km: 118,
    desc: "Pláž a kotviště u obce Županovice, levý břeh (orientační poloha)." },

  /* --- příroda --- */
  { type: "sight", name: "NPR Drbákov — Albertovy skály", lat: 49.727, lon: 14.393, km: 108.5,
    desc: "Národní přírodní rezervace na pravém břehu — vzácné tisy. Nevystupujte na břeh (orientační poloha)." },

  /* --- půjčovny --- */
  { type: "rental", name: "Půjčovna lodí Ždáň", lat: 49.7962, lon: 14.4249, km: 96.4,
    desc: "Kajutové lodě, čluny, šlapadla; denně 10–19 h.", tel: "+420 777 215 134", web: "https://www.pujcovna-slapy.cz" },
  { type: "rental", name: "Půjčovna skútrů Slapy Marine", lat: 49.7968, lon: 14.4322, km: 95.7,
    desc: "Vodní skútry a čluny u autocampu Skalice (orientační poloha).", web: "https://slapy-marine.cz" },
];
