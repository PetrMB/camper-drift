# Nasazení na slapy.honeger.com

Aplikace je čistě statická (složka `slapy/`). Deploy workflow
`.github/workflows/deploy-slapy.yml` publikuje obsah `slapy/` na GitHub Pages
při pushi do `main` nebo do větve `claude/slapy-boat-navigation-3hmtvx`.

## 1) Povolit nasazení (jedna z možností)

**A. Merge do main** — slouč větev `claude/slapy-boat-navigation-3hmtvx` do
`main` (PR nebo lokálně). Workflow se spustí automaticky.

**B. Nasazení přímo z této větve** — v repozitáři:
*Settings → Environments → github-pages → Deployment branches* přidej pravidlo
pro `claude/slapy-boat-navigation-3hmtvx` (nebo `claude/*`). Pak stačí
workflow spustit znovu (*Actions → Deploy Slapy Navigátor → Re-run*).

## 2) Zapnout Pages přes GitHub Actions

*Settings → Pages → Build and deployment → Source:* **GitHub Actions**.

> Pozn.: pokud dosud Pages servírovaly hru z větve `main`, tímto krokem se
> přepnou na workflow (hra zůstane v repozitáři, jen nebude na Pages —
> případně ji lze publikovat v rámci artefaktu do podadresáře).

## 3) Vlastní doména

1. *Settings → Pages → Custom domain:* `slapy.honeger.com` → Save
   (GitHub vytvoří ověření domény; doporučeno zapnout **Enforce HTTPS**,
   certifikát se vystaví automaticky do pár minut).
2. V DNS zóny **honeger.com** přidej záznam:

   ```
   slapy  CNAME  petrmb.github.io.
   ```

   (TTL libovolné; propagace obvykle do pár minut.)

## 4) Ověření

- `https://slapy.honeger.com` — načte se mapa, v liště nahoře funguje GPS
  (vyžaduje HTTPS ✓).
- Aplikaci lze „Přidat na plochu“ (PWA) — na iOS přes Sdílet → Přidat na
  plochu, na Androidu nabídne Chrome instalaci sám.
- Offline: navštívené oblasti mapy se cachují service workerem.

## Aktualizace obsahu

- **Zóny a pravidla** (`js/data/zones.js`, `js/data/rules.js`): sezónní
  výtlačné úseky a koupací prostory vyhlašuje SPS každý rok znovu
  (sps.gov.cz → Předpisy). Zkontrolovat před sezónou.
- **Místa** (`js/data/pois.js`): polohy označené „orientační“ je vhodné
  doladit podle mapy.cz/skutečnosti.
