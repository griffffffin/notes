/* AZ AUTH-HATÁR: mi érhető el token NÉLKÜL.

   A routes.js-ben egyetlen sor választja ketté az alkalmazást:

       router.use(auth);          // innentől minden végpont hitelesítést kíván

   Ami e FÖLÖTT van regisztrálva, az publikus. Ez a projekt egyik legérzékenyebb
   ténye — a régi alkalmazás fő gyengesége épp a hiányzó szerveroldali
   hitelesítés volt —, és a mai napig SEMMI nem őrzi. Egy új végpont, ami
   figyelmetlenségből néhány sorral feljebb kerül, azonnal és NÉMÁN publikussá
   válik: nem hibázik, a felület ugyanúgy működik, a saját böngészőnk pedig
   sosem próbálja ki token nélkül. Kívülről viszont bárki eléri.

   A teszt KÉT, egymástól független módon kérdez rá ugyanarra:

     (1) FORRÁS-SORREND: a routes.js szövegében az `auth` sora előtt pontosan a
         három, szándékosan publikus útvonal állhat. Új sor a határ fölé = bukás,
         névvel. Miért szövegből? Mert az Express 5 router belső rétegei fordított
         illesztő-függvényeket tárolnak, útvonal-szöveget nem — abból visszafejteni
         a listát a könyvtár belsőségeire épülő, frissítéskor némán elromló trükk
         volna. A forrás sorrendje viszont pont az a tény, amit védeni akarunk.

     (2) VISELKEDÉS: a felépített routert tényleg megszólítjuk token nélkül. Egy
         védett végpont 401-et ad, a három publikus NEM (a saját validátoruk 400-a
         jön, ami épp azt bizonyítja, hogy a kérés eljutott hozzájuk). Adatbázis
         nem kell: a hiányzó token a middleware első sorában elakad, a publikus
         végpontok pedig a validátoron.

   A kettő együtt zárja a kört: az (1) a szándékot rögzíti, a (2) azt, hogy a
   szándékból valóság is lett. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const request = require("supertest");

// A tesztfutónak nincs .env-je; az auth middleware betöltéséhez elég egy álérték.
process.env.JWT_SECRET = process.env.JWT_SECRET || "teszt-titok";
const routes = require("./routes");

/* A SZÁNDÉKOSAN publikus útvonalak — és hogy MIÉRT azok. Ez a lista a teszt
   lelke: bővíteni csak tudatosan szabad, és aki bővíti, annak ide is le kell
   írnia az indokot. */
const PUBLIC_ROUTES = {
    "/user/create": "regisztráció — értelemszerűen nincs még tokenje",
    "/login": "bejelentkezés — ez ADJA a tokent",
    "/quotes/id": "egyetlen idézet megosztható, publikus nézete (l. routes.js)",
};

test("a routes.js-ben csak a szándékolt útvonalak állnak az auth ELŐTT", () => {
    const source = fs.readFileSync(path.join(__dirname, "routes.js"), "utf8").split("\n");
    const authLine = source.findIndex((line) => line.startsWith("router.use(auth);"));
    assert.ok(authLine > 0,
        "Nem találom a 'router.use(auth);' sort a routes.js-ben. Ha az alakja változott, " +
        "ezt a tesztet is vezesd át — enélkül nem őriz semmit.");

    const before = source.slice(0, authLine)
        .map((line) => line.match(/^router\.use\("([^"]+)"/))
        .filter(Boolean)
        .map((match) => match[1]);

    assert.deepStrictEqual(before.sort(), Object.keys(PUBLIC_ROUTES).sort(),
        "Megváltozott, mi érhető el hitelesítés NÉLKÜL. Ha ez szándékos, vedd fel a " +
        "PUBLIC_ROUTES listába az indokával együtt; ha nem, tedd a router.use(auth) alá.");
});

test("token nélkül a védett végpont 401-et ad", async () => {
    const app = express();
    app.use(express.json());
    app.use(routes);

    const response = await request(app).post("/to-dos").send({});

    assert.strictEqual(response.status, 401,
        "Egy védett végpont token nélkül is válaszolt — az auth-határ elcsúszott.");
});

/* A publikus végpontok NEM adhatnak 401-et. A 400 itt a helyes válasz: a kérés
   eljutott a saját validátorukig, és az utasította el üres törzsért — vagyis a
   hitelesítés nem állt az útjába. */
for (const [route, why] of Object.entries(PUBLIC_ROUTES)) {
    test(`token nélkül is elérhető: ${route} (${why})`, async () => {
        const app = express();
        app.use(express.json());
        app.use(routes);

        const response = await request(app).post(route).send({});

        assert.notStrictEqual(response.status, 401,
            `A ${route} hitelesítést kért, pedig szándékosan publikus. ` +
            "Ha ez a változás szándékos, a PUBLIC_ROUTES listából is vedd ki.");
    });
}
