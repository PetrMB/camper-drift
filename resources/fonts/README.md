# Fonty SKODA Next

Font **SKODA Next** je licencovaný a **nesmí se commitovat** do repozitáře
(`.gitignore` to hlídá).

Pokud ho máš legálně k dispozici, nakopíruj sem soubory:

```
SKODANext-Light.woff2
SKODANext-Regular.woff2
SKODANext-Bold.woff2
```

a v nastavení widgetu ukaž na tuhle složku (položka „složka s fonty").
Aplikace je servíruje přes vlastní schéma `cmfont://` a jen z téhle jediné
složky — cesty ven (`../`) jsou zablokované.

Bez fontů widget použije Segoe UI. Layout je na tenhle rozdíl v metrikách
navržený, takže se nic nerozsype.
