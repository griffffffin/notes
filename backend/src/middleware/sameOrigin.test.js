/* A CSRF-ŐR TESZTJEI.

   A hibája NEM hangos: ha ez a middleware kimarad vagy túl engedékeny lesz,
   semmi nem romlik el — a felhasználó mindent ugyanúgy használ, csak a védelem
   nincs ott. Ezért a tesztek mindkét irányt kimondják: mit ENGED át (különben a
   saját appunk törne el), és mit UTASÍT EL. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const request = require("supertest");

const sameOrigin = require("./sameOrigin");

// Dokumentációs cím (RFC 5737, példákhoz fenntartva): a teszthez bármilyen origin jó.
const DEV_ORIGIN = "http://192.0.2.10:5173";

const app = express();
app.use(sameOrigin([DEV_ORIGIN]));
app.post("/", (request_, response) => response.json({ok: true}));
app.get("/", (request_, response) => response.json({ok: true}));

test("fejléc nélküli POST átmegy — a CSRF böngésző-alapú, ez nem böngésző", async () => {
    /* Tudatos engedmény: a böngészők POST-nál mindig küldenek Origin-t, tehát egy
       fejléc nélküli kérés nem böngészőből jön (curl, teszt, API-kliens). Ha ezt
       megkövetelnénk, azokat zárnánk ki, egy olyan támadó kedvéért, aki nem
       létezik. */
    const response = await request(app).post("/").send({});

    assert.strictEqual(response.status, 200);
});

test("AZONOS origin-ről indult POST átmegy", async () => {
    const response = await request(app).post("/")
        .set("Origin", "http://127.0.0.1")
        .set("Host", "127.0.0.1")
        .send({});

    assert.strictEqual(response.status, 200);
});

test("IDEGEN origin-ről indult POST-ot elutasít (403)", async () => {
    const response = await request(app).post("/")
        .set("Origin", "https://tamado.example")
        .send({});

    assert.strictEqual(response.status, 403);
});

test("az ENGEDÉLYEZETT (fejlesztői) origin átmegy", async () => {
    /* A Vite dev szervere másik porton fut, tehát másik origin. Enélkül a
       fejlesztés némán elhalna: minden kérés 403 lenne. */
    const response = await request(app).post("/").set("Origin", DEV_ORIGIN).send({});

    assert.strictEqual(response.status, 200);
});

test("a Sec-Fetch-Site: cross-site POST-ot elutasít, akkor is, ha nincs Origin", async () => {
    const response = await request(app).post("/").set("Sec-Fetch-Site", "cross-site").send({});

    assert.strictEqual(response.status, 403);
});

test("a same-origin és a none átmegy, a same-site NEM", async () => {
    /* A `none` a felhasználó közvetlen műveletét jelenti (beírt cím, könyvjelző).
       A `same-site` azért nincs elfogadva, mert az AZONOS SITE, de nem azonos
       origin — nálunk nincs aldomain, tehát ez csak valami váratlan lehet. */
    for (const [value, expected] of [["same-origin", 200], ["none", 200], ["same-site", 403]]) {
        const response = await request(app).post("/").set("Sec-Fetch-Site", value).send({});
        assert.strictEqual(response.status, expected, `Sec-Fetch-Site: ${value}`);
    }
});

test("a GET-et nem érinti — az nem ír, és a statikus fájlok is így jönnek", async () => {
    const response = await request(app).get("/").set("Origin", "https://tamado.example");

    assert.strictEqual(response.status, 200);
});

/* A SORREND ŐRE, a noStore mintájára. Ha ez a middleware a route-ok MÖGÉ csúszna,
   soha nem futna le — és semmi nem szólna: az app ugyanúgy működne, a védelem
   viszont nem lenne sehol. A forrás-vizsgálat csapdája miatt MINDHÁROM sor
   megtalálását külön állítjuk (a nem illeszkedő minta üres eredménye hamis
   zöldnek látszana). */
test("az app.js-ben a CORS UTÁN és a route-ok ELŐTT áll", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8").split("\n");
    const lineOf = (pattern, what) => {
        const index = source.findIndex((line) => pattern.test(line));
        assert.ok(index >= 0,
            `Nem találom az app.js-ben: ${what}. Ha az alakja megváltozott, ezt a ` +
            "tesztet is vezesd át — enélkül a sorrendet SEMMI nem őrzi.");
        return index;
    };

    const corsLine = lineOf(/app\s*\.\s*use\s*\(\s*cors\s*\(/, "app.use(cors(...))");
    const guardLine = lineOf(/app\s*\.\s*use\s*\(\s*sameOrigin\s*\(/, "app.use(sameOrigin(...))");
    const routesLine = lineOf(/app\s*\.\s*use\s*\(\s*routes\s*\)/, "app.use(routes)");

    assert.ok(corsLine < guardLine,
        "Az őr a CORS ELÉ került: a preflight (OPTIONS) válaszát is megfoghatja.");
    assert.ok(guardLine < routesLine,
        "Az őr a route-ok MÖGÉ került: soha nem fut le, a CSRF-védelem némán eltűnt.");
});
