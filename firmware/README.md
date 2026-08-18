# ClaudeMonitor — firmware pro LilyGO T-Display-S3

Fyzický ukazatel na stůl. Widget na počítači posílá po USB data, deska
je vykreslí a **odpočet si tiká sama**, takže displej zůstane živý,
i když počítač usne nebo ho odpojíš.

Cílová deska: **LilyGO T-Display-S3**, 1,9" ST7789, 320×170, ESP32-S3.

## Přeložení a nahrání

Potřebuješ [PlatformIO](https://platformio.org/) (VS Code rozšíření nebo `pip install platformio`).

```bash
cd firmware
pio run -t upload -e t-display-s3
pio device monitor
```

Deska se hlásí nativním USB, takže se objeví jako COM port bez instalace
ovladače. Kdyby ji bootloader nechytil, podrž **BOOT** a ťukni na **RST**.

## Propojení s widgetem

Ve widgetu otevři **Nastavení → Externí displej → Připojit displej** a vyber
port desky. Widget si port zapamatuje a příště se připojí sám.

Přenos jede přes **Web Serial** přímo z Chromia uvnitř Electronu — proto
v aplikaci nepřibyla jediná nativní závislost.

## Protokol

Jedna řádka JSON při každém obnovení (tedy zhruba jednou za tři minuty):

```json
{"now":1755424800000,
 "accounts":[{"label":"Osobni","accent":"electric","status":"ok","estimated":false,"detail":"",
              "fiveHour":{"utilization":62,"resetsAt":1755428520000,"source":"api"},
              "sevenDay":{"utilization":41,"resetsAt":1755765600000,"source":"api"}}]}
```

Deska odpovídá `{"ack":true}` nebo `{"ack":false}` u poškozené řádky.

Dvě rozhodnutí, která stojí za vysvětlení:

- **Časy jsou absolutní epoch ms, ne zbývající sekundy.** Deska si z rozdílu
  proti `now` udělá termín ve své `millis()` ose a dál si odpočítává sama.
  Kdyby se posílal zbývající čas, po výpadku spojení by displej zamrzl.
- **Diakritika se shazuje už na počítači.** Font FreeSans v LovyanGFX umí jen
  ASCII, a je čistší to vyřešit tam, kde je plný Unicode, než tahat na desku
  vlastní font kvůli pár háčkům. Proto na displeji uvidíš „Osobni".

Když do 15 minut nic nedorazí, deska přepne do stavu *Bez spojeni s pocitacem*
a poslední známá čísla nechá na displeji.

## Ovládání

| Tlačítko | Funkce |
|---|---|
| **KEY** (GPIO14) | přepnutí mezi účty, když je jich víc |
| **BOOT** (GPIO0) | jas displeje, čtyři úrovně |

## Na co si dát pozor

Tahle deska má dvě pasti, na kterých se běžně zasekne každý:

1. **`ARDUINO_USB_CDC_ON_BOOT=1`** — bez toho jde sériová linka na piny
   GPIO43/44 místo na USB a z počítače neuvidíš nic. V `platformio.ini` to je.
2. **GPIO15 musí být HIGH** — napájení LCD. Bez toho zůstane obrazovka černá,
   i když kód normálně běží a po sériové lince mluví.

Displej navíc není na SPI, ale na 8bitové paralelní sběrnici (i80), a panel je
170 px široký na 240px řadiči, takže potřebuje `offset_x = 35`. Obojí je
nastavené v `include/board.h`.

## Struktura

```
firmware/
├─ platformio.ini
├─ include/
│   ├─ board.h       pinout desky a LovyanGFX konfigurace panelu
│   ├─ state.h       datový model
│   ├─ protocol.h    parsování řádky z počítače
│   └─ ui.h
└─ src/
    ├─ main.cpp      smyčka, čtení sériové linky, tlačítka
    ├─ protocol.cpp
    └─ ui.cpp        vykreslení podle ŠKODA Flow
```

Layout je přenesený z widgetu: Emerald podklad, prstenec vyčerpání, odpočet
jako největší prvek, týdenní bar a jeden Electric facet v rohu. Pravidlo
„maximálně jedna terciární barva v kompozici" hlídá `tertiaryFor()` v `ui.cpp`
stejně jako `pickComposition()` na počítači.

## Stav

**Nevyzkoušeno na hardwaru** — firmware vznikl dřív, než deska dorazila.
Pinout i konfigurace panelu jsou ověřené proti dokumentaci LilyGO, ale první
překlad a nahrání ještě nikdo neudělal. Až deska přijde, počítej s tím, že
se něco doladí.
