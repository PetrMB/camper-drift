# 🚐🌊 Riviera Run

Arkádová jízda obytným vozem **Hymercar '87** po silnici na útesu nad mořem.
Moderní Three.js + Rapier fyzika, vše běží přímo v prohlížeči bez buildu.

## 🎮 Ovládání

| Akce | Desktop | Mobil |
|---|---|---|
| Řízení | ← / → nebo A / D | levá / pravá strana obrazovky |
| Drift | drž MEZERNÍK | drž střed obrazovky |
| Start / restart | cokoliv | ťuknutí |

## 🎯 O co jde

- Auto jede samo — ty řídíš stopu a drifty
- 🚧 **Policejní kontroly**: zátaras s blikajícím majákem a jednou mezerou.
  Proklouzni mezerou = +500 × kombo. **Náraz v rychlosti = konec jízdy!**
- Drifty, čisté zatáčky a těsné míjení spadlých kamenů = body
- 🚗 Na silnici je provoz — protijedoucí i pomalejší auta; těsné předjetí = body, náraz = konec
- 💦 Prorazíš-li zídku u moře, vůz přeletí hranu útesu a šplouchne do vody
- Silnice stoupá na útesy a klesá k pláži, vede tunely skrz ostrohy
- Na moři plachetnice, rybářské čluny, jachty — a občas zahouká zaoceánský parník
- Denní doba se plynule mění: poledne → západ slunce → noc → ráno
- Zvuky moře, racků a lodí syntetizované ve WebAudio (žádné soubory)

## 🚀 Spuštění

Stačí statický server (ES moduly nefungují z `file://`):

```bash
python3 -m http.server 8000
# → http://localhost:8000/
```

Knihovny (three 0.170, rapier3d-compat 0.14) jsou vendorované ve `vendor/` —
hra nezávisí na žádném CDN.

## 🗂 Struktura

```
index.html   style.css
js/          config · main · physics · road · van · biomes (pobřeží) ·
             traffic · effects · audio · score · hud
vendor/      three.module.js · jsm/ (postprocessing) · rapier3d-compat.js
```

Ladění: přidej `?debug=1` do URL (slidery fyziky + statistiky).
