/* ============ Pravidla plavby — přehled pro vůdce malého plavidla ============
   Zdroje: zákon č. 114/1995 Sb. o vnitrozemské plavbě, vyhláška č. 67/2015 Sb.
   (pravidla plavebního provozu), vyhláška č. 223/1995 Sb. (výbava), OOP SPS
   26/2024 a 62/2026, Informace SPS k sezónnímu výtlačnému režimu.
   Přehled je informativní — závazné je aktuální značení na vodě a platná OOP. */
const RULES_HTML = `
<h2>⚖️ Pravidla pro vůdce malého plavidla</h2>

<div class="card">
  <h3>🚤 Rychlost a režim plavby na Slapech</h3>
  <ul>
    <li><b>Do 50 m od břehu a od koupacích prostorů max. 10 km/h</b> a pouze
      výtlačný režim (výjimka: kolmé připlutí/odplutí, vyhrazené plochy).</li>
    <li><b>Sezónní výtlačné úseky</b> (cca 15. 6. – 15. 9., dle Informace SPS):
      <b>ř. km 91,80–97,85</b> (hráz → Měřín/Hrdlička) a <b>ř. km 100,51–106,00</b>
      (Živohošťský most → za Kobylníky) — zákaz plavby v kluzu, značeno znaky na vodě.
      Úseky jsou vyznačeny v mapě (modře).</li>
    <li>Mimo tyto úseky a pásma je <b>plavba v kluzu povolena</b> — Vltava je
      dopravně významná vodní cesta.</li>
    <li>Za vlnobití a škody jím způsobené (u přístavišť, kotvišť, plavců)
      <b>odpovídá vůdce plavidla</b>.</li>
    <li>Plavební ponor: <b>2,2 m</b> od hráze po Vestecký most (km 128,93),
      výše jen <b>1,7 m</b>. Při poklesu hladiny pozor na mělčiny v zátokách.</li>
  </ul>
</div>

<div class="card">
  <h3>🛟 Vodní lyžování, skútry, eFoil</h3>
  <ul>
    <li><b>Vodní lyžování + eFoil</b> pouze ve vyhrazené ploše
      <b>ř. km 103,60–104,00</b> (levý břeh, 400×80 m, k.ú. Chotilsko — OOP 26/2024):
      1. 5.–30. 9., <b>mimo neděle</b>, 9–12 a 14–18 h. Provoz signalizuje žlutá bóje.</li>
    <li><b>Vodní skútry a jetsurfy</b> pouze ve vymezené ploše
      <b>ř. km 95,60–95,85</b> (pravý břeh proti Ždáni — OOP 62/2026):
      1. 6.–30. 9., 9–17 h, max. 2 plavidla téhož druhu současně;
      při akrobacii vesta a přilba.</li>
    <li>Při vlečení lyžaře musí být na plavidle kromě vůdce
      <b>druhá osoba (pozorovatel)</b>; lyžař má mít záchrannou vestu.</li>
    <li>Mimo vyhrazené plochy je lyžování a agresivní jízda skútrem zakázána
      (skútr smí plout jen výtlačně jako běžné plavidlo).</li>
  </ul>
</div>

<div class="card">
  <h3>↔️ Přednosti a míjení</h3>
  <ul>
    <li>Malé plavidlo <b>nesmí vyžadovat</b>, aby se mu vyhýbala velká plavidla —
      pozor na <b>linkové osobní lodě</b> (Slapy–Rabyně–Živohošť–Cholín), uvolněte
      jim včas dráhu i mola.</li>
    <li>Mezi malými plavidly: <b>motorové se vyhýbá</b> plachetnici i veslici;
      <b>plachetnice</b> se vyhýbá veslici.</li>
    <li>Křížení motorových: uhýbá ten, kdo vidí druhého <b>po pravoboku</b>.</li>
    <li>Protijedoucí se míjejí zpravidla <b>levými boky</b> (uhněte doprava).</li>
    <li>Vyplouvající z přístaviště/kotviště dává přednost plavidlům v plavbě.</li>
  </ul>
</div>

<div class="card">
  <h3>🏊 Koupající se a břehy</h3>
  <ul>
    <li>Na Slapech je vyznačeno <b>15 koupacích prostorů</b> (žluté bóje) —
      <b>vplutí plavidel zakázáno</b>.</li>
    <li>Koupající osobu obeplouvejte v bezpečné vzdálenosti tak, aby zůstala
      <b>mezi plavidlem a břehem</b>; nikdy neprojíždějte mezi plavcem a břehem.</li>
    <li>Nepřibližujte se na méně než ~10 m ke skalám, plavcům a jiným plavidlům.</li>
    <li>Pozor na rybářské šňůry a bójky (revír ČRS Vltava 13/14, hlavně u Živohoště).</li>
  </ul>
</div>

<div class="card">
  <h3>🍺 Alkohol a odpovědnost</h3>
  <ul>
    <li>Pro vůdce malého plavidla s motorem platí na Slapech <b>0,0 ‰</b>.
      (Tolerance 0,5 ‰ z novely 2023 se týká jen bezmotorových plavidel na
      nesledovaných vodních cestách — na Slapy se <b>nevztahuje</b>.)</li>
    <li>Vůdce odpovídá za posádku, výbavu plavidla i způsobené škody.</li>
    <li>Plavební nehodu s újmou na zdraví či větší škodou ohlaste Státní plavební
      správě a Poříčnímu oddělení PČR Slapy (974 882 760).</li>
  </ul>
</div>

<div class="card">
  <h3>🦺 Povinná výbava (vyhl. č. 223/1995 Sb.)</h3>
  <ul>
    <li><b>Záchranné vesty</b> dle počtu osob na palubě; děti, neplavci a všichni
      při plavbě v kluzu je mají mít <b>oblečené</b>.</li>
    <li>Plavidlo do 500 kg výtlaku: vylévačka nebo pumpa, vyvazovací lano ≥ 5 m, pádlo.</li>
    <li>Nad 500 kg (do 6 m délky): lano ≥ 15 m, bidlo s háčkem, 2 pádla,
      vědro s lanem, <b>hasicí přístroj ≥ 2 kg</b> (motorová), lékárnička.</li>
    <li><b>Kotva</b> s lanem povinná od výtlaku 1 000 kg (doporučená vždy).</li>
    <li>V noci a za snížené viditelnosti předepsaná <b>plavební světla</b> —
      bez nich plujte jen od východu do západu slunce.</li>
  </ul>
</div>

<div class="card">
  <h3>🪪 Průkaz a evidence</h3>
  <ul>
    <li>Průkaz <b>vůdce malého plavidla (VMP)</b>: kategorie <b>M</b> pro motor
      <b>nad 4 kW</b>, kategorie <b>S</b> pro plachty <b>nad 12 m²</b>.</li>
    <li>Bez průkazu lze vést plavidlo do 4 kW / do 12 m² plachet (od 15 let).</li>
    <li>Plavidlo s motorem nad 4 kW nebo nad 1 000 kg podléhá <b>evidenci</b> —
      lodní osvědčení mějte na palubě.</li>
  </ul>
</div>

<div class="card">
  <h3>🚧 Hráze a zvláštní místa</h3>
  <ul>
    <li><b>Hráz VD Slapy</b> (km 91,6–91,8): zákaz plavby, prostor vymezen bójemi.
      Na pravém břehu <b>probíhá stavba lodního zdvihadla</b> — sledujte aktuální
      OOP a značení, organizace provozu u hráze se může měnit.</li>
    <li><b>Přeprava lodí přes hráz</b>: PVL traktorem s vlekem, 1. 5.–30. 9.
      (Po/St/Pá/So/Ne 8–18 h), max. 8,5 × 2,6 m / 3,5 t,
      rezervace rezervace.pvl.cz, tel. 606 656 432.</li>
    <li><b>Hráz VD Kamýk</b> (km 134,73): zákaz vplutí k hrázi; kolísání hladiny
      a proudění při špičkování elektráren Kamýk i Slapy.</li>
    <li><b>NPR Drbákov–Albertovy skály</b> (pravý břeh ~km 108–110):
      nevystupujte na břeh.</li>
  </ul>
</div>

<div class="card">
  <h3>🪧 Nejčastější plavební znaky</h3>
  <div class="kv"><span>A.1 (červeno-bílá tabule)</span><b>zákaz proplutí</b></div>
  <div class="kv"><span>A.6 / A.7</span><b>zákaz kotvení / vyvazování</b></div>
  <div class="kv"><span>A.9</span><b>zákaz vytváření vlnobití (výtlačný režim)</b></div>
  <div class="kv"><span>A.16</span><b>zákaz plutí malých plavidel</b></div>
  <div class="kv"><span>A.17 / A.20</span><b>zákaz vodního lyžování / skútrů</b></div>
  <div class="kv"><span>B.6</span><b>povinnost dodržet stanovenou rychlost</b></div>
  <div class="kv"><span>E.16 / E.17 / E.24</span><b>povolení plutí / lyžování / skútrů</b></div>
  <div class="kv"><span>Žluté bóje</span><b>koupací prostor — vplutí zakázáno</b></div>
</div>

<div class="card">
  <h3>⛈ Bezpečnost</h3>
  <ul>
    <li>Sledujte předpověď (záložka Info) — bouřky a nárazový vítr se na Slapech
      zvedají rychle, na otevřených úsecích (Ždáň, Rabyně) bývají vlny přes půl metru.</li>
    <li>Při bouřce ihned k břehu do závětří, posádka do vest.</li>
    <li>Hladina může kolísat i během dne (špičkování elektrárny) — kotvěte s rezervou.</li>
    <li>MOB (osoba přes palubu): označte místo tlačítkem <b>MOB</b> na mapě,
      přibližujte se proti větru, u osoby motor na neutrál.</li>
    <li>Tíseň: <b>112</b> · VZS Slapy (Stará Živohošť): <b>607 962 552</b>.</li>
  </ul>
</div>

<p class="muted" style="margin:10px 0 20px">Zjednodušená pomůcka — závazná jsou ustanovení
zák. č. 114/1995 Sb., vyhl. č. 67/2015 Sb., aktuální Opatření obecné povahy a Informace
Státní plavební správy a značení na vodní cestě.</p>
`;
