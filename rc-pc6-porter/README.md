# RC Pilatus PC-6 Porter — model v dílech pro Fusion 360

Skript pro Fusion 360, který vygeneruje RC model **Pilatus PC-6 Porter**
v jednotlivých konstrukčních dílech tak, jak se skutečně staví balsové
RC stavebnice (kity).

> **Proč skript, a ne Fusion konektor?** V této Claude session není žádný
> Autodesk Fusion MCP konektor nainstalovaný a v registru konektorů
> claude.ai žádný oficiální Fusion konektor neexistuje. Nejbližší funkční
> cesta je tento skript pro Fusion 360 API — spustí se přímo ve Fusionu
> a model postaví programově. Stránka royalairframes.com/pc6-porter navíc
> blokuje automatizovaný přístup (HTTP 403, není ani v archivu), proto
> model vychází z reálných rozměrů PC-6 a běžných RC kitů této velikosti.

## Jak spustit

1. Otevřít **Fusion 360** → *Utilities* → *Add-Ins* → **Scripts and Add-Ins**.
2. Na záložce *Scripts* kliknout na zelené **+** a vybrat složku
   `PC6PorterKit` z tohoto repozitáře.
3. Vybrat skript a dát **Run**. Vytvoří se nový dokument se všemi díly
   (~60 pojmenovaných těl v komponentách Křídlo P/L, Trup, Ocasní plochy,
   Podvozek, Vzpěry, Kryt motoru).

Všechny rozměry jsou parametry na začátku `PC6PorterKit.py` — dají se
snadno změnit (měřítko, počet žeber, tloušťky materiálů…).

## Měřítko a rozměry

Skutečný PC-6: rozpětí **15,87 m**, délka **10,9 m**, plocha křídla
30,15 m² → konstantní hloubka křídla ~1,9 m (obdélníkové křídlo).
Model je v měřítku **1:8**:

| Parametr | Model |
|---|---|
| Rozpětí | 1 984 mm |
| Hloubka křídla | 238 mm (konstantní) |
| Délka trupu | ~1 363 mm |
| Rozpětí VOP | 620 mm |
| Rozchod podvozku | 375 mm |
| Profil křídla | Clark Y (klasika pro RC makety) |

To odpovídá běžné velikosti komerčních PC-6 kitů (HobbyKing 2 150 mm,
VQ Models 2 170 mm, Nexa 2 720 mm).

## Jak se konstruují RC letadla (rešerše)

Klasická balsová stavebnicová konstrukce, kterou skript napodobuje:

- **Křídlo** — nosná kostra z **žeber** (balsa 3 mm, profil Clark Y) navlečených
  na **hlavní nosník** (smrk/překližka, u ~28 % hloubky — nese ohyb) a
  **pomocný zadní nosník** (~72 %). Vpředu **náběžná lišta** (balsa 8×8),
  vzadu **odtoková lišta**, která se brousí do klínu. Žebra mají vyříznuté
  drážky pro nosníky — skript je skutečně vyřezává (boolean cut).
- **Trup** — skříňová konstrukce: příčné **přepážky** (formers, balsa/překliž
  3 mm s odlehčovacími otvory; motorová přepážka F1 z 5mm překližky) spojené
  čtyřmi podélnými **podélníky** (longerons, smrk 6×6). PC-6 má hranatý trup
  s konstantním průřezem kabiny a kuželovitým zúžením k ocasu — pro
  stavebnici ideální tvar.
- **Ocasní plochy** — u této velikosti z rovné balsové desky 6 mm;
  výškovka a směrovka jsou samostatné díly zavěšené na pantech.
- **Podvozek** — PC-6 má charakteristický vysoký pevný podvozek
  (dural/laminátové nohy) + ostruhové kolečko.
- **Vzpěry křídla** — hornokřídlý PC-6 má křídlo podepřené vzpěrami do
  spodku trupu; na modelu nesou reálné zatížení.
- **Dokončení** — kostra se brousí, potahuje nažehlovací fólií (např.
  Oracover) a lepí se PVA/aliphatickým lepidlem, exponovaná místa epoxidem.

Zdroje rešerše:
- [RC Airplane World — Model airplane kit construction methods](https://www.rc-airplane-world.com/model-airplane-kits)
- [The Balsa Workbench — tipy pro stavbu balsových RC letadel](https://www.balsaworkbench.com/)
- [RC Plane DIY — volba balsy (hustoty, nosníky, žebra)](https://rcplanediy.com/2026/02/21/best-balsa-wood-rc-airplanes/)
- [Wikipedia — Pilatus PC-6 Porter (rozměry)](https://en.wikipedia.org/wiki/Pilatus_PC-6_Porter)
- [Pilatus — oficiální model building plan PC-6 (PDF)](https://www.pilatus-aircraft.com/assets/files/Model-Building-Plans/PC-6-Model-Building-Plan.pdf)
- Referenční kity: [H-King PC-6 2150mm](https://hobbyking.com/en_us/h-king-pilatus-porter-pc-6-2150mm-84-6-ep-gp-arf.html),
  [Nexa PC-6 2720mm](https://motionrc.com/products/nexa-pilatus-pc-6-swiss-2720mm-107-wingspan-arf-nxa1028-002)

## Co skript generuje

| Komponenta | Díly |
|---|---|
| Křídlo P + L | 2× 13 žeber s drážkami, hlavní a pomocný nosník, náběžná a odtoková lišta |
| Trup | 8 přepážek (F1 = motorová, překliž) s drážkami, 8 segmentů podélníků |
| Ocasní plochy | stabilizátor, výškovka, kýl, směrovka |
| Podvozek | 2 nohy, 2 kola, ostruhové kolečko |
| Vzpěry | 2 vzpěry křídla |
| Kryt motoru | zjednodušený dlouhý nos PC-6 |

Pozn.: skript byl napsán proti dokumentaci Fusion 360 API, ale v tomto
prostředí není Fusion k dispozici, takže neprošel spuštěním — případnou
chybu skript vypíše v dialogu i s řádkem.

## Mesh exporty (import bez Fusion API)

Protože Fusion MCP konektor není v cloudové session dostupný, je tu i
`export_mesh.py` — postaví stejnou geometrii přes `trimesh` a vyexportuje ji
do `exports/`:

- `pc6_porter_kit.glb` — celý model, pojmenované a obarvené díly (náhled),
- `pc6_wing_R/L.stl`, `pc6_fuselage.stl`, `pc6_tail.stl`,
  `pc6_landing_gear.stl`, `pc6_struts.stl`, `pc6_cowl.stl` — po komponentách,
- `pc6_porter_combined.stl` — vše v jednom,
- `pc6_preview.png` — render (generuje `render_preview.py`).

Import do Fusionu: *Insert → Insert Mesh* a vybrat STL (jednotky mm).
Meshe jsou vizuální/referenční; plně parametrický model s vyříznutými
drážkami vytvoří skript `PC6PorterKit` (mesh export drážky neřeže, díly se
v místech spojů překrývají).

Spuštění exportu: `pip install trimesh shapely numpy scipy mapbox-earcut`
a `python3 export_mesh.py`.

## Možná další vylepšení

- klapky a křidélka jako samostatné díly (PC-6 má výrazné vztlakové klapky),
- rozvinutí dílů naplocho pro laserové řezání (DXF export),
- servo lože, kabina/prosklení, motorové lože pro konkrétní pohon
  (u 2m rozpětí typicky elektromotor ~800–1200 W, 6S LiPo).
