/* A NÉV-ENUMERÁCIÓ KÖTÉSE a /user/create kérés-korlátjához — szerkezetesen.

   A regisztráció (controllers/Users/create.js) SZÁNDÉKOSAN elárulja, hogy egy
   felhasználónév foglalt-e: a felhasználónak tudnia kell, hogy másikat
   választhasson, ez a működés feltétele, nem kényelmi kérdés. A döntés ára, hogy a
   válasz ELÁRULJA, létezik-e egy fiók — vagyis elvben fiók-felsorolásra (name
   enumeration) használható.

   MIÉRT MARADHAT ÍGY: mert a /user/create kérés-korlátja SZŰK, tehát egy címről
   csak kevés nevet lehet óránként végigpróbálni — a felsorolás használhatatlanul
   lassú. A create.js komment ("⚠ MITŐL ROMLANA EL") ki is mondja: ha ez a korlát
   valaha lazul vagy lekerül, a döntés az indokával együtt érvényét veszti.

   EDDIG EZT A KÖTÉST CSAK A KOMMENT TARTOTTA. Két, egymástól távoli fájl (create.js
   döntése és routes.js konfigja) között az olvasó nem látja az elcsúszást: valaki a
   korlátot meglazíthatja anélkül, hogy a create.js döntéséről tudna, és semmi nem
   szólna. Ez a teszt a kötést SZERKEZETIVÉ teszi — pontosan az
   authBoundary.test.js / frontendContract.test.js mintájára.

   NEM A KONKRÉT SZÁMOKAT rögzíti (a max és az ablak a routes.js döntése, szabadon
   SZIGORÍTHATÓ), hanem a KÖVETKEZMÉNYT: hány nevet lehet óránként egy címről
   próbálni. A max ÉS az ablakhossz EGYÜTT számít — egy rövidebb ablak ugyanúgy
   feloldaná a védelmet, mint egy nagyobb max —, ezért a kettőből számolt
   enumerációs költségvetést vizsgáljuk, nem külön-külön a két számot.

   A forrásból SZÖVEGKÉNT olvasunk (mint a frontendContract.test.js): a routes.js
   betöltése az egész appot fel-wire-ölné, és a korlát értéke amúgy is a fájl
   szövegében, egy inline objektumban él. A hiányzó minta BUKÁS, nem kihagyás — ha
   a /user/create korlátja eltűnik vagy az alakja megváltozik, a teszt "nem találom"
   hibával bukik, nem némán zöldül. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const routesPath = path.join(__dirname, "routes.js");

/* Egy óránál rövidebb enumerációs ablakban ennyi név még "használhatatlanul lassú"
   egy valódi fiók-felsoroláshoz. A mai keret 5/óra (routes.js); a küszöb ennek a
   duplája, hogy a jogos finomhangolásnak legyen tere, de bármilyen ÉRDEMI lazítás
   (nagyobb max VAGY rövidebb ablak) hangosan bukjon. A szám a create.js döntését
   szolgálja — ha ezt emeled, a create.js "⚠ MITŐL ROMLANA EL" bekezdését is nézd át. */
const MAX_NAMES_PER_HOUR = 10;

/* Egy `windowMs`-kifejezés (pl. "60 * 60 * 1000") kiértékelése eval nélkül:
   szorzat-tényezőkre bontjuk és összeszorozzuk. Bármi, ami nem szám, NaN-t ad,
   amitől az alábbi állítás bukik — tehát egy váratlan alak sem csúszik át némán. */
function evaluateProduct(expression) {
    return expression.split("*").reduce((product, factor) => product * Number(factor.trim()), 1);
}

test("a /user/create korlátja elég szűk a név-enumeráció ellen (l. create.js)", () => {
    const source = fs.readFileSync(routesPath, "utf8");

    /* A /user/create BLOKKJÁRA horgonyzunk (nem a /login-éra): a név után az első
       rateLimit windowMs + max párját olvassuk ki. */
    const match = source.match(
        /"\/user\/create",\s*rateLimit\(\{\s*windowMs:\s*([^,]+),\s*max:\s*(\d+)/);
    assert.ok(match,
        "Nem találom a /user/create kérés-korlátját a routes.js-ben. Ha az alakja " +
        "változott, vezesd át ezt a tesztet — és NÉZD ÁT a create.js név-enumeráció döntését.");

    const windowMs = evaluateProduct(match[1]);
    const max = Number(match[2]);
    assert.ok(windowMs > 0 && max > 0, `érvénytelen korlát: windowMs=${windowMs}, max=${max}`);

    const namesPerHour = max * (60 * 60 * 1000 / windowMs);
    assert.ok(namesPerHour <= MAX_NAMES_PER_HOUR,
        `a /user/create óránként ${namesPerHour} nevet enged próbálni (küszöb: ${MAX_NAMES_PER_HOUR}). ` +
        "A korlát meglazult — ezzel a create.js foglaltság-válasza fiók-felsorolásra válik " +
        "használhatóvá. Vagy szigorítsd vissza a korlátot, vagy vezesd át a create.js döntését.");
});
