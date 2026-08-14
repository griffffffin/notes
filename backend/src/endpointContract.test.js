/* A CSOMAGHATÁR MÁSIK FELE: LÉTEZIK-E, AMIT A FRONTEND HÍV.

   A frontend huszonöt útvonalon szólítja meg a szervert (frontend/src/endpoints.ts).
   Hogy ezek a routerben tényleg léteznek-e, azt eddig SEMMI nem ellenőrizte: egy
   elgépelés vagy egy backend-oldali átnevezés nem hibázik hangosan, csak 404-et ad
   — a hibaág legfeljebb naplóz (fejlesztésben!), a képernyőn pedig üres lista vagy
   örökké pörgő betöltő marad. Ez a teszt zárja be ezt a rést.

   A ROKONA a frontendContract.test.js (ott ÉRTÉKEK egyezését őrizzük a két
   oldalon), a MINTÁJA pedig az authBoundary.test.js: nem elméletben okoskodik,
   hanem felépíti az appot, és tényleg megszólítja.

   MIÉRT A 404 A KÉRDÉS, ÉS NEM A 200? Mert egy létező végpont a valódi
   válaszához adatbázist, érvényes törzset és létező elemet kívánna — az már nem a
   csomaghatárt vizsgálná, hanem az egész rendszert. A "van-e egyáltalán ilyen
   útvonal" viszont pontosan az a tény, ami a két csomag között elcsúszhat. A 400
   (a validátor elutasította az üres törzset) és az 500 (nincs adatbázis) tehát
   NEM bukás: mindkettő azt bizonyítja, hogy a kérés eljutott a végponthoz.

   ÉS EZ A KÜLÖNBSÉG VALÓDI: lemértük, hogy a `/to-dos` névtér végén álló
   paraméter nélküli `todosRouter.use(todosRead)` NEM nyeli el a rossz utakat
   (a `/to-dos/categoriez` 404-et kap, nem a teljes listát). Ha egyszer elnyelné,
   ez a teszt hallgatna — ezért az utolsó eset szándékosan egy NEM létező
   végpontot próbál ki: az őrzi meg magát az őrt. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

// A tesztfutónak nincs .env-je; az auth middleware betöltéséhez elég egy álérték.
process.env.JWT_SECRET = process.env.JWT_SECRET || "teszt-titok";

/* Adatbázis nincs. A Mongoose alapból 10 másodpercig PUFFEREL minden lekérdezést,
   hátha közben megjön a kapcsolat — így viszont a DB-t érintő végpontok
   végpontonként 10 másodpercet állnának. Rövid határidővel a lekérdezés azonnal
   elszáll, a controller elkapja, és 500-zal válaszol: nekünk pont ennyi kell,
   hiszen a kérdés a 404. */
mongoose.set("bufferTimeoutMS", 50);

/* A hitelesítés MEGKERÜLÉSE — csak a felhasználó LÉTEZÉS-ellenőrzéséig.

   Az auth middleware nemcsak az aláírást nézi, hanem adatbázisból ki is olvassa a
   fiókot (a törölt fiók tokenje ne éljen tovább). DB nélkül ez 503-mal elakadna,
   és minden végpont ugyanazt a választ adná — a teszt semmit nem érne. A modell
   `findById`-ját ezért kicseréljük egy kész válaszra.

   Miért nyugodtan tehetjük: a `node --test` minden tesztFÁJLT külön folyamatban
   futtat, tehát ez a csere nem szivárog át más tesztekbe. És a cserét a routes
   betöltése ELŐTT végezzük, hogy a middleware biztosan ezt lássa. */
const Users = require("./models/users");
const TEST_USER_ID = "507f1f77bcf86cd799439011";
Users.findById = async () => ({_id: TEST_USER_ID});

const routes = require("./routes");

/* A frontend végpont-listája ADATKÉNT, nem a forrásszövegből regexszel kikaparva.
   A Node 22 magától kiveszi a típusokat a .ts fájlból ("type stripping"), tehát
   ez a modul közvetlenül betölthető — ezért nem importálhat semmit és nem
   tartalmazhat nem törölhető nyelvi elemet (l. a fájl saját kommentjét).

   A KITERJESZTÉST NEM DRÓTOZZUK BE: ugyanaz a modul holnap lehet .js vagy .mjs, és
   egy bedrótozott ".ts" attól a naptól nem találná meg. (Ez a csapda a napi export
   felderítőjén már elsült egyszer — l. scripts/exportSections.js.) */
function loadEndpoints() {
    const base = path.join(__dirname, "../../frontend/src/endpoints");
    for (const extension of [".ts", ".tsx", ".js", ".mjs"]) {
        if (fs.existsSync(base + extension)) return require(base + extension).ENDPOINTS;
    }
    assert.fail(`Nem találom a frontend végpont-listáját (semmilyen kiterjesztéssel): ${base}`);
}

const ENDPOINTS = loadEndpoints();

/* A ciklus MODUL-SZINTEN fut (a teszteket ő gyártja), ezért itt nem dobhatunk: egy
   `Object.entries(undefined)` az egész fájlt összeomlasztaná, még mielőtt a lenti,
   beszédes ellenőrzés elsülhetne — a fejlesztő egy verem-nyomot kapna a "mit
   csinálj" mondat helyett. Ezért a lista hiánya itt üres listává szelídül, a
   HIBÁT pedig az első teszt mondja ki, névvel. */
const ENTRIES = ENDPOINTS && typeof ENDPOINTS === "object" ? Object.entries(ENDPOINTS) : [];

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(routes);
    return app;
}

const token = jwt.sign({id: TEST_USER_ID}, process.env.JWT_SECRET, {expiresIn: "5m"});

const post = (url) => request(buildApp()).post(url).set("Authorization", "Bearer " + token).send({});

/* A LISTA MAGA. Ha az `ENDPOINTS` export egyszer átalakul vagy átnevezik, a lenti
   ciklus üresen futna le — nulla teszttel, zölden. Az "elnémult őr" rosszabb, mint
   ha teszt sem lenne, ezért a lista alakját is kimondjuk. */
test("a frontend végpont-listája betölthető és értelmes", () => {
    assert.ok(ENDPOINTS && typeof ENDPOINTS === "object",
        "A frontend/src/endpoints modul nem adott ENDPOINTS objektumot. Ha az export alakja " +
        "változott, ezt a tesztet is vezesd át — enélkül a lenti ellenőrzés némán kiürül.");

    const values = ENTRIES.map(([, url]) => url);
    assert.ok(values.length > 0, "A végpont-lista üres.");
    for (const [name, url] of ENTRIES) {
        assert.strictEqual(typeof url, "string", `A(z) ${name} végpont értéke nem szöveg.`);
        assert.ok(url.startsWith("/"), `A(z) ${name} végpont nem "/"-rel kezdődik: ${url}`);
    }
    assert.strictEqual(new Set(values).size, values.length,
        "Ugyanaz az útvonal két néven is szerepel a listában — az egyik valószínűleg elírás vagy maradék.");
});

/* A LÉNYEG: minden hívott végpont létezik. Külön teszt mindegyikre, hogy a bukás
   NEVET mondjon ("nem létezik: /quotes/searchmode"), ne csak annyit, hogy valahol
   baj van. */
for (const [name, url] of ENTRIES) {
    test(`a frontend ${name} végpontja létezik a routerben: ${url}`, async () => {
        const response = await post(url);

        assert.notStrictEqual(response.status, 404,
            `A frontend a(z) ${url} útvonalat hívja, de a backend routerében nincs ilyen végpont ` +
            "(404). Vagy elgépelés a frontend/src/endpoints.ts-ben, vagy a backend routes.js-ében " +
            "nevezték át/törölték az útvonalat — a felhasználó ebből annyit látna, hogy a művelet " +
            "csendben nem történik meg.");
    });
}

/* AZ ŐR ŐRE. Ha a router egyszer mégis elnyelné az ismeretlen utakat (pl. valaki
   egy catch-all middleware-t tesz a végére), a fenti tesztek attól kezdve
   MINDENRE zöldet adnának — akkor is, ha a végpontok közben megszűntek. Ez az eset
   bizonyítja, hogy a 404 tényleg megkülönbözteti a nem létezőt a létezőtől. */
test("egy nem létező végpont TÉNYLEG 404-et kap (különben a fenti tesztek vakok)", async () => {
    const response = await post("/to-dos/nincs-ilyen-vegpont");

    assert.strictEqual(response.status, 404,
        "Egy kitalált útvonal nem 404-et kapott. Ilyenkor a fenti ellenőrzések nem érnek semmit: " +
        "bármit hívhatna a frontend, mindig átmennének. Nézd meg, nem került-e catch-all a router végére.");
});
