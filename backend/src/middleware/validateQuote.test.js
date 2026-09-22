/* Az idézet-bemenet ellenőrzésének tesztjei. A böngészőnk sosem küldene rossz
   adatot — de az írás-végpontok bárkinek nyitva állnak, aki tokent szerzett,
   ezért a szerver nem bízhat a kliens jólneveltségében.

   VÉGPONTOK KÖZÖTTI TITKOSÍTÁS (E2EE) UTÁN a validátor csak a titkosított boríték
   ALAKJÁT nézi (nem-üres szöveg, józan felső korlát) és a nyílt sorszámot. A
   tartalom valódi szabályai (kötelező-e a szöveg, milyen hosszú a szerző) a
   kliensé, a titkosítás előtt — a szerver azokat nem is látja. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const request = require("supertest");

const {validateQuoteBody} = require("./validateQuote");

const app = express();
// A törzs-méretkorlát TÜKRÖZZE az éles app.js-ét (1mb) — különben a nagy boríték a
// parse-nál (413) esne el, nem a validátornál (400), és a hossz-tesztet nem a
// validátor döntené el (l. app.js express.json({limit: "1mb"})).
app.use(express.json({limit: "1mb"}));
app.post("/quote", validateQuoteBody, (request_, response) => response.json(request_.body));

// Érvényes alap, amiből a tesztek egy-egy mezőt rontanak el. A ciphertext egy
// tetszőleges nem-üres szöveg: a validátor a TARTALMÁT nem értelmezi, csak az alakját.
const VALID = {ciphertext: "e2ee1.aXYtYmFzZTY0.Y2lwaGVy", order: 1};
const post = (body) => request(app).post("/quote").send(body);

test("érvényes borítékot átenged", async () => {
    assert.strictEqual((await post(VALID)).status, 200);
});

test("üres vagy hiányzó borítékot elutasít (400)", async () => {
    assert.strictEqual((await post({...VALID, ciphertext: ""})).status, 400);
    assert.strictEqual((await post({...VALID, ciphertext: undefined})).status, 400);
});

test("túl hosszú borítékot elutasít (400)", async () => {
    assert.strictEqual((await post({...VALID, ciphertext: "a".repeat(1000001)})).status, 400);
});

test("objektumot string helyett elutasít — NoSQL-injekció ellen (400)", async () => {
    /* Ha ez átmenne, a {$ne: null} nem ÉRTÉKKÉNT, hanem lekérdezés-OPERÁTORKÉNT
       jutna le a mentésbe, és megváltoztatná a jelentését. A titkosított boríték
       mindig szöveg — bármi más gyanús. */
    assert.strictEqual((await post({...VALID, ciphertext: {$ne: null}})).status, 400);
});

test("nulla és negatív sorszámot elutasít (400)", async () => {
    assert.strictEqual((await post({...VALID, order: 0})).status, 400);
    assert.strictEqual((await post({...VALID, order: -5})).status, 400);
});

test("tört sorszámot elutasít (400)", async () => {
    assert.strictEqual((await post({...VALID, order: 1.5})).status, 400);
});

test("objektum-sorszámot elutasít — NoSQL-injekció ellen (400)", async () => {
    assert.strictEqual((await post({...VALID, order: {$ne: null}})).status, 400);
});

// Az azonosító ellenőrzése minden szekcióban közös — a tesztje a validators.test.js-ben.
