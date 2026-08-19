/* Az idézet-bemenet ellenőrzésének tesztjei. A böngészőnk sosem küldene rossz
   adatot — de az írás-végpontok bárkinek nyitva állnak, aki tokent szerzett,
   ezért a szerver nem bízhat a kliens jólneveltségében. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const request = require("supertest");

const {validateQuoteBody, validateAuthorFilter, validateSearchTerm,
    validateAuthorPrefix} = require("./validateQuote");

const app = express();
app.use(express.json());
app.post("/quote", validateQuoteBody, (request_, response) => response.json(request_.body));

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

// Az azonosító ellenőrzése minden szekcióban közös — a tesztje a validators.test.js-ben.

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

const searchApp = express();
searchApp.use(express.json());
searchApp.post("/search", validateSearchTerm, (request_, response) => response.json({ok: true}));

test("keresés: nem-üres stringet átenged, üreset/csak-szóközt elutasít (400)", async () => {
    assert.strictEqual((await request(searchApp).post("/search").send({term: "élet"})).status, 200);
    // A szerző-szűréssel szemben az ÜRES keresés értelmetlen (mindent illesztene) — 400.
    assert.strictEqual((await request(searchApp).post("/search").send({term: ""})).status, 400);
    assert.strictEqual((await request(searchApp).post("/search").send({term: "   "})).status, 400);
    assert.strictEqual((await request(searchApp).post("/search").send({})).status, 400);
});

test("keresés: objektumot string helyett elutasít — NoSQL-injekció ellen (400)", async () => {
    assert.strictEqual((await request(searchApp).post("/search").send({term: {$ne: null}})).status, 400);
});

test("keresés: túl hosszú kifejezést elutasít (400)", async () => {
    assert.strictEqual((await request(searchApp).post("/search").send({term: "a".repeat(501)})).status, 400);
});

/* A SZERZŐ-JAVASLAT PREFIXE (/quotes/authors). A testvére a keresés, de a
   szabályai szándékosan mások — a tesztek ezt a KÜLÖNBSÉGET is rögzítik, hogy egy
   későbbi "egységesítés" ne csendben történjen. */
const prefixApp = express();
prefixApp.use(express.json());
prefixApp.post("/authors", validateAuthorPrefix, (request_, response) => response.json({ok: true}));
const postPrefix = (body) => request(prefixApp).post("/authors").send(body);

test("szerző-előtag: stringet átenged, hiányzót elutasít (400)", async () => {
    assert.strictEqual((await postPrefix({prefix: "Már"})).status, 200);
    assert.strictEqual((await postPrefix({})).status, 400);
});

test("szerző-előtag: az ÜRES előtag érvényes (ELTÉRÉS a kereséstől)", async () => {
    /* Az üres keresés értelmetlen (400), az üres előtagnak viszont van jelentése:
       a legutóbb használt szerző (controllers/Quotes/readAuthors.js). Ha ez a
       teszt egyszer megbukik, az azt jelenti, hogy valaki a két végpontot
       "egységesítette" — ami némán elvenné a javaslatot az üres mezőnél. */
    assert.strictEqual((await postPrefix({prefix: ""})).status, 200);
});

test("szerző-előtag: objektumot string helyett elutasít — NoSQL-injekció ellen (400)", async () => {
    assert.strictEqual((await postPrefix({prefix: {$ne: null}})).status, 400);
});

test("szerző-előtag: túl hosszút elutasít (400)", async () => {
    // A korlát a szerzőnév korlátja (200), nem a keresésé (500).
    assert.strictEqual((await postPrefix({prefix: "a".repeat(200)})).status, 200);
    assert.strictEqual((await postPrefix({prefix: "a".repeat(201)})).status, 400);
});
