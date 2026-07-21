/* Az idézet-bemenet ellenőrzésének tesztjei. A böngészőnk sosem küldene rossz
   adatot — de az írás-végpontok bárkinek nyitva állnak, aki tokent szerzett,
   ezért a szerver nem bízhat a kliens jólneveltségében. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const mongoose = require("mongoose");
const request = require("supertest");

const {validateQuoteBody, validateQuoteId, validateAuthorFilter} = require("./validateQuote");

const app = express();
app.use(express.json());
app.post("/quote", validateQuoteBody, (request_, response) => response.json(request_.body));
app.post("/id", validateQuoteId, (request_, response) => response.json({ok: true}));

// Érvényes alap, amiből a tesztek egy-egy mezőt rontanak el.
const VALID = {quote: "Az élet szép.", author: "Valaki", order: 1};
const post = (body) => request(app).post("/quote").send(body);

test("érvényes idézetet átenged", async () => {
    assert.strictEqual((await post(VALID)).status, 200);
});

test("üres vagy hiányzó idézetet elutasít (400)", async () => {
    assert.strictEqual((await post({...VALID, quote: "   "})).status, 400);
    assert.strictEqual((await post({...VALID, quote: undefined})).status, 400);
});

test("túl hosszú idézetet elutasít (400)", async () => {
    assert.strictEqual((await post({...VALID, quote: "a".repeat(100001)})).status, 400);
});

test("a szerző elhagyható: nélküle és üresen is átmegy", async () => {
    assert.strictEqual((await post({...VALID, author: undefined})).status, 200);
    assert.strictEqual((await post({...VALID, author: ""})).status, 200);
});

test("túl hosszú szerzőt elutasít (400)", async () => {
    assert.strictEqual((await post({...VALID, author: "a".repeat(201)})).status, 400);
});

test("nulla és negatív sorszámot elutasít (400)", async () => {
    assert.strictEqual((await post({...VALID, order: 0})).status, 400);
    assert.strictEqual((await post({...VALID, order: -5})).status, 400);
});

test("tört sorszámot elutasít (400)", async () => {
    assert.strictEqual((await post({...VALID, order: 1.5})).status, 400);
});

test("objektumot string helyett elutasít — NoSQL-injekció ellen (400)", async () => {
    /* Ha ez átmenne, a {$ne: null} nem ÉRTÉKKÉNT, hanem lekérdezés-OPERÁTORKÉNT
       jutna le a szűrőbe (a szerző-szűrésbe), és megváltoztatná a jelentését. */
    assert.strictEqual((await post({...VALID, quote: {$ne: null}})).status, 400);
    assert.strictEqual((await post({...VALID, author: {$ne: null}})).status, 400);
});

test("érvényes ObjectId-t átenged, mást elutasít (400)", async () => {
    const valid = new mongoose.Types.ObjectId().toString();
    assert.strictEqual((await request(app).post("/id").send({id: valid})).status, 200);
    assert.strictEqual((await request(app).post("/id").send({id: "nem-id"})).status, 400);
    assert.strictEqual((await request(app).post("/id").send({})).status, 400);
});

const filterApp = express();
filterApp.use(express.json());
filterApp.post("/author", validateAuthorFilter, (request_, response) => response.json({ok: true}));

test("szerző-szűrő: stringet átenged (üreset is), operátort elutasít (400)", async () => {
    assert.strictEqual((await request(filterApp).post("/author").send({author: "Márai"})).status, 200);
    // Az üres szerző a "névtelen" idézeteket szűri — érvényes string.
    assert.strictEqual((await request(filterApp).post("/author").send({author: ""})).status, 200);
    assert.strictEqual((await request(filterApp).post("/author").send({author: {$ne: null}})).status, 400);
    assert.strictEqual((await request(filterApp).post("/author").send({})).status, 400);
});
