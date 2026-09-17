/* A generikus 404-kapu tesztjei. Két dolgot bizonyítanak:

   1) VISELKEDÉS: az illeszkedés nélküli kérés szűkszavú, metódus-független 404-et
      kap, ami NEM tükrözi vissza a kért utat (a visszatükrözés a szivárgás, amit a
      kapu kivált — l. notFound.js). Ez a "ne segíts a támadónak" elv állítása:
      külön kimondjuk, hogy a kért út NINCS benne a válaszban, mert épp ez különül
      el az Express beépített `Cannot POST /...` alakjától.

   2) SORREND az app.js-ben: a kapunak a route-ok UTÁN és a hibakezelő ELŐTT kell
      állnia. Fölécsúszva minden route-ot elnyelne (az egész API 404 lenne);
      alácsúszva a keret beépített 404-e lépne vissza a helyére, némán. A
      forrás-vizsgálat üres-találat csapdája ellen (l. a projekt tanulságát) minden
      sor MEGTALÁLÁSÁT külön állítjuk. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const request = require("supertest");

const notFound = require("./notFound");

/* A lánc végét reprodukáljuk: egy illeszkedő route, majd a kapu. Az illeszkedő
   route bizonyítja, hogy a kapu CSAK az illeszkedés nélküli kérést fogja el. */
function appWithNotFound() {
    const app = express();
    app.post("/matched", (request_, response) => response.json({ok: true}));
    app.use(notFound);
    return app;
}

test("az illeszkedő route-ot NEM fogja el a kapu", async () => {
    const answer = await request(appWithNotFound()).post("/matched");
    assert.strictEqual(answer.status, 200);
    assert.deepStrictEqual(answer.body, {ok: true});
});

test("az illeszkedés nélküli kérés 404-et kap, szűkszavú üzenettel", async () => {
    const answer = await request(appWithNotFound()).post("/nincs-ilyen");
    assert.strictEqual(answer.status, 404);
    assert.strictEqual(answer.body, "Nincs ilyen végpont.");
});

test("a válasz NEM tükrözi vissza a kért utat (nincs keret-ujjlenyomat)", async () => {
    /* Ez a kapu LÉTOKA: az Express beépített 404-e `Cannot POST /titkos-utvonal`-t
       adna, benne a metódussal és az úttal. A miénk fix szöveg — a kért útnak
       (és a metódusnévnek) nyoma sem lehet a válaszban. */
    const secretPath = "/titkos-belso-utvonal-42";
    const answer = await request(appWithNotFound()).post(secretPath);
    assert.ok(!answer.text.includes(secretPath),
        `A 404 visszatükrözte a kért utat (${secretPath}) — épp ezt a szivárgást kellene kiváltania.`);
    assert.ok(!/cannot\s+post/i.test(answer.text),
        "A válasz az Express beépített 'Cannot POST' alakját adta — a kapu nem ült a helyére.");
});

test("a 404 metódus-független (GET és DELETE ugyanazt kapja)", async () => {
    const get = await request(appWithNotFound()).get("/nincs-ilyen");
    const del = await request(appWithNotFound()).delete("/nincs-ilyen");
    assert.strictEqual(get.status, 404);
    assert.strictEqual(del.status, 404);
    assert.strictEqual(get.body, "Nincs ilyen végpont.");
    assert.strictEqual(del.body, "Nincs ilyen végpont.");
});

test("az app.js-ben a route-ok UTÁN és a hibakezelő ELŐTT áll", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8").split("\n");
    const lineOf = (pattern, what) => {
        const index = source.findIndex((line) => pattern.test(line));
        assert.ok(index >= 0,
            `Nem találom az app.js-ben ezt a sort: ${what}. Ha az alakja megváltozott, ` +
            "ezt a tesztet is vezesd át — enélkül a sorrendet SEMMI nem őrzi.");
        return index;
    };

    const routesLine = lineOf(/app\s*\.\s*use\s*\(\s*routes\s*\)/, "app.use(routes)");
    const notFoundLine = lineOf(/app\s*\.\s*use\s*\(\s*notFound\s*\)/, "app.use(notFound)");
    // A hibakezelő a 4-paraméteres alak: (error, request, response, next).
    const errorHandlerLine = lineOf(/app\s*\.\s*use\s*\(\s*\(\s*error\s*,/, "a (error, ...) hibakezelő");

    assert.ok(routesLine < notFoundLine,
        "A notFound a route-ok ELÉ került: így minden route-ot elnyelne, az egész API 404 lenne.");
    assert.ok(notFoundLine < errorHandlerLine,
        "A notFound a hibakezelő MÖGÉ került: a nem-létező útvonalra újra az Express " +
        "beépített 404-e válaszolna, ujjlenyomatostul.");
});
