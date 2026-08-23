/* A "ne tárold le" fejléc két tesztje, és a MÁSODIK a fontos.

   Az első csak azt méri, hogy a middleware kiírja-e a fejlécet — ez magától
   értetődő, egy sor kód. A védelem valódi feltétele viszont a SORREND az
   app.js-ben: a middleware-nek az `express.static` UTÁN és az `app.use(routes)`
   ELŐTT kell állnia. Fölécsúszva a teljes frontend-bundle gyorsítótárazhatatlan
   lenne (lassú, de működő app — senki nem venné észre), alácsúszva pedig az
   API-válaszok maradnának védtelenül (semmi nem változna, csak a védelem tűnne
   el). Mindkét irány NÉMA, ezért kell rá kapu.

   A forrás-vizsgálat csapdája (l. a projekt korábbi tanulságát): a nem
   illeszkedő minta ÜRES eredményt ad, és az üresség hamis zöldnek látszik.
   Ezért itt mindhárom sor MEGTALÁLÁSÁT külön állítjuk — ha az app.js alakja
   megváltozik, a teszt hangosan bukik, nem csendben átenged. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const request = require("supertest");

const noStore = require("./noStore");

test("a middleware Cache-Control: no-store fejlécet ad a válaszhoz", async () => {
    const app = express();
    app.use(noStore);
    app.get("/probe", (request_, response) => response.json({ok: true}));

    const answer = await request(app).get("/probe");

    assert.strictEqual(answer.status, 200);
    assert.strictEqual(answer.headers["cache-control"], "no-store");
});

test("a fejléc a HIBAVÁLASZOKON is ott van", async () => {
    /* Nem formaság: a 401-es válasz törzse is tartalmazhat üzenetet, és épp a
       hitelesítési hibák azok, amiket egy köztes gyorsítótár a legrosszabbkor
       játszana vissza. A middleware a válasz ELEJÉN állítja be a fejlécet, tehát
       a státuszkódtól függetlenül érvényes — ezt mondjuk ki. */
    const app = express();
    app.use(noStore);
    app.get("/probe", (request_, response) => response.status(401).json("Hiányzó token."));

    const answer = await request(app).get("/probe");

    assert.strictEqual(answer.status, 401);
    assert.strictEqual(answer.headers["cache-control"], "no-store");
});

test("az app.js-ben a statikus kiszolgálás UTÁN és a route-ok ELŐTT áll", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8").split("\n");
    const lineOf = (pattern, what) => {
        const index = source.findIndex((line) => pattern.test(line));
        assert.ok(index >= 0,
            `Nem találom az app.js-ben ezt a sort: ${what}. Ha az alakja megváltozott, ` +
            "ezt a tesztet is vezesd át — enélkül a sorrendet SEMMI nem őrzi.");
        return index;
    };

    const staticLine = lineOf(/express\s*\.\s*static\s*\(/, "express.static(...)");
    const noStoreLine = lineOf(/app\s*\.\s*use\s*\(\s*noStore\s*\)/, "app.use(noStore)");
    const routesLine = lineOf(/app\s*\.\s*use\s*\(\s*routes\s*\)/, "app.use(routes)");

    assert.ok(staticLine < noStoreLine,
        "A noStore a statikus kiszolgálás ELÉ került: így a teljes frontend-bundle " +
        "gyorsítótárazhatatlan lesz, és minden oldalbetöltés újratölti.");
    assert.ok(noStoreLine < routesLine,
        "A noStore az API-route-ok MÖGÉ került: az API-válaszok gyorsítótárazhatók " +
        "maradnak, azaz a felhasználó adata a készülék lemezére kerülhet.");
});
