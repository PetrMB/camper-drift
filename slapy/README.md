# ⚓ Slapy Navigátor

Mobilní webová aplikace (PWA) pro plavbu po **vodní nádrži Slapy** — navigace,
přehled a pomůcky pro vůdce malého plavidla.

**Živě:** https://slapy.honeger.com

## Funkce

- 🗺 **Plavební mapa** — vysoké rozlišení: ČÚZK Základní topografická mapa,
  letecké ortofoto ČÚZK (CC BY 4.0) a OpenStreetMap, overlay plavebních znaků
  OpenSeaMap; osa plavební dráhy s **říční kilometráží** (ř. km 91,6 hráz Slapy →
  134,7 hráz Kamýk, kalibrováno dle Povodí Vltavy)
- 🧭 **GPS navigace** — rychlost (km/h / uzly), kurz, aktuální říční kilometr,
  sledování polohy, orientace po kurzu
- 🎯 **Navigace na cíl** — vzdálenost, kurz a ETA na přístaviště či bod na mapě
  (dlouhý stisk / kontextové menu)
- ⚓ **Místa** — přístaviště, mola, kempy, restaurace, půjčovny, přívoz, paliva,
  záchranná služba; řazení podle vzdálenosti od aktuální polohy
- 🚫 **Zóny** — vyhrazená vodní plocha pro vodní lyžování (Chotilsko km 103,6–104,0),
  zákazová pásma u hrází, vyhrazená koupaliště; **varování při vplutí do
  nebezpečné zóny**
- 📍 **Plavba** — záznam trasy s exportem GPX, ujetá vzdálenost, max. rychlost,
  **kotevní hlídka** (alarm při utržení kotvy), tlačítko **MOB** (muž přes palubu)
- ⚖️ **Pravidla** — přehled pravidel plavebního provozu pro vůdce malého plavidla
  (přednosti, výtlačný režim, vzdálenosti, alkohol, povinná výbava, signální znaky)
- 🌤 **Počasí** — aktuální vítr a nárazy, 12h předpověď, varování před bouřkou
  (Open-Meteo), východ/západ slunce; 💧 vodní stav VD Slapy (ČHMÚ / Povodí Vltavy)
- 📴 **Offline** — PWA se service workerem, mapové dlaždice navštívené oblasti
  se ukládají do cache

## Technika

Čistý HTML/CSS/JS bez buildu, [Leaflet 1.9](https://leafletjs.com) (vendorováno).
Stačí statický server:

```bash
cd slapy && python3 -m http.server 8000
```

## Zdroje dat

- Schematická plavební mapa VN Slapy — [Státní plavební správa](https://sps.gov.cz/downloads/ruzne/slapy-web-2024.pdf)
- Mapové dlaždice — [ČÚZK](https://cuzk.gov.cz) (CC BY 4.0), [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL), [OpenSeaMap](https://www.openseamap.org) (CC BY-SA)
- Osa řeky — OpenStreetMap (ODbL); kilometráž — Povodí Vltavy
- Počasí — [Open-Meteo](https://open-meteo.com) (CC BY 4.0)

> ⚠️ Aplikace je nezávislá pomůcka a **nenahrazuje oficiální plavební mapu**
> ani platná Opatření obecné povahy Státní plavební správy. Plavba na vlastní
> odpovědnost.
