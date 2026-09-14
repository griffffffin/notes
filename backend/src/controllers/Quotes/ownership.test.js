/* Az idézetek tulajdon-szabályai. KÜLÖNBSÉG a to-dóhoz képest: egy idézetet
   BÁRKI elolvashat az azonosítójával (a megosztott link ezért működik token
   nélkül), DE módosítani/törölni/átsorolni csak a sajátodat lehet.

   A Mongoose-modellt memóriabeli mockra cseréljük — adatbázis nem kell. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const {userStub, sessionCookieFor} = require("../../test/authStub");
const mongoose = require("mongoose");
const request = require("supertest");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";

const modelPath = require.resolve("../../models/quotes");
const userModelPath = require.resolve("../../models/users");
const newId = () => new mongoose.Types.ObjectId().toString();
const OWNER = newId();
const STRANGER = newId();
const MISSING_ID = newId();
const OWNER_QUOTE = {_id: newId(), user: OWNER, quote: "Anna idézete", author: "Anna", order: 1, fontSize: 160};

require.cache[modelPath] = {
    id: modelPath, filename: modelPath, loaded: true,
    exports: {
        findById: (id) => Promise.resolve(String(id) === OWNER_QUOTE._id ? OWNER_QUOTE : null),
        findByIdAndDelete: () => Promise.resolve(OWNER_QUOTE),
        findByIdAndUpdate: () => Promise.resolve(OWNER_QUOTE),
        updateMany: () => Promise.resolve({}),
    },
};
require.cache[userModelPath] = {
    id: userModelPath, filename: userModelPath, loaded: true,
    exports: {findById: async (id) => [OWNER, STRANGER].includes(String(id)) ? userStub(id) : null},
};

const auth = require("../../middleware/auth");
const requireOwnership = require("../../middleware/requireOwnership");
const Quotes = require("../../models/quotes");
const readById = require("./readById");
const readForEdit = require("./readForEdit");
const update = require("./update");
const deleteQuote = require("./delete");
const reorder = require("./reorder");

const app = express();
app.use(express.json());
// A readById az auth ELŐTT: publikus (megosztott link). app.use (nem app.post):
// a controller egy Router, amit mountolni kell, hogy a belső "/" illeszkedjen.
// PUBLIKUS: NINCS requireOwnership (bárki olvashatja az idézetet az id-jával).
app.use("/id", readById);
app.use(auth);
/* A tulajdon-ellenőrzés a route-lánc requireOwnership middleware-ébe költözött (a
   controllerek a request.item-ből dolgoznak) — a teszt a valódi láncot tükrözi. A
   Quotes itt a fent require.cache-be tett mock (findById-t ad). A /edit az auth
   MÖGÖTT: hitelesített, tulajdonos-ellenőrzött. */
app.use("/edit", requireOwnership(Quotes), readForEdit);
app.use("/update", requireOwnership(Quotes), update);
app.use("/delete", requireOwnership(Quotes), deleteQuote);
app.use("/reorder", requireOwnership(Quotes), reorder);

const editBody = {id: OWNER_QUOTE._id, quote: "Módosítva", author: "Anna", order: 1};

test("egy idézet BEJELENTKEZÉS NÉLKÜL is olvasható az azonosítójával", async () => {
    const response = await request(app).post("/id").send({id: OWNER_QUOTE._id});
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.quote, "Anna idézete");
});

test("nem létező idézetnél 404 (nincs mit rejteni, publikus)", async () => {
    const response = await request(app).post("/id").send({id: MISSING_ID});
    assert.strictEqual(response.status, 404);
});

test("a publikus válasz csak a whitelistelt mezőket adja — user-id, belső azonosító ÉS sorszám NEM szivárog", async () => {
    const response = await request(app).post("/id").send({id: OWNER_QUOTE._id});
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.quote, "Anna idézete");
    assert.strictEqual(response.body.author, "Anna");
    // A betűméret a MEGJELENÍTÉSHEZ kell (a megosztott idézet a saját méretével) — jelen van.
    assert.strictEqual(response.body.fontSize, 160);
    // A sorszám (listabeli pozíció) egy névtelen látogatóra nem tartozik — NINCS a publikus válaszban.
    assert.strictEqual(response.body.order, undefined);
    // A tulajdonos azonosítója egy publikus végponton nem jelenhet meg.
    assert.strictEqual(response.body.user, undefined);
    // A belső Mongo-azonosító sem szivárog (nincs rá szükség).
    assert.strictEqual(response.body._id, undefined);
});

test("a szerkesztő-betöltés (/edit) a tulajdonosnak kiadja a sorszámot is", async () => {
    const response = await request(app).post("/edit").set("Cookie", sessionCookieFor(OWNER)).send({id: OWNER_QUOTE._id});
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.quote, "Anna idézete");
    // A szerkesztőnek a sorszám (a sorszám-választó kezdőértéke) és a betűméret is kell.
    assert.strictEqual(response.body.order, 1);
    assert.strictEqual(response.body.fontSize, 160);
    // A user-id itt SEM szivárog (whitelist).
    assert.strictEqual(response.body.user, undefined);
});

test("a szerkesztő-betöltés (/edit) token nélkül 401 (auth mögött van)", async () => {
    const response = await request(app).post("/edit").send({id: OWNER_QUOTE._id});
    assert.strictEqual(response.status, 401);
});

test("IDEGEN nem töltheti be más idézetét a szerkesztőbe (403)", async () => {
    const response = await request(app).post("/edit").set("Cookie", sessionCookieFor(STRANGER)).send({id: OWNER_QUOTE._id});
    assert.strictEqual(response.status, 403);
});

test("nem létező idézet szerkesztő-betöltése 403 (a létezést sem áruljuk el idegennek)", async () => {
    const response = await request(app).post("/edit").set("Cookie", sessionCookieFor(OWNER)).send({id: MISSING_ID});
    assert.strictEqual(response.status, 403);
});

test("IDEGEN nem módosíthatja más idézetét (403)", async () => {
    const response = await request(app).post("/update").set("Cookie", sessionCookieFor(STRANGER)).send(editBody);
    assert.strictEqual(response.status, 403);
});

test("a tulajdonos módosíthatja a sajátját", async () => {
    const response = await request(app).post("/update").set("Cookie", sessionCookieFor(OWNER)).send(editBody);
    assert.strictEqual(response.status, 200);
});

test("IDEGEN nem törölheti más idézetét (403)", async () => {
    const response = await request(app).post("/delete")
        .set("Cookie", sessionCookieFor(STRANGER)).send({id: OWNER_QUOTE._id});
    assert.strictEqual(response.status, 403);
});

test("IDEGEN nem sorolhatja át más idézetét (403)", async () => {
    const response = await request(app).post("/reorder")
        .set("Cookie", sessionCookieFor(STRANGER)).send({id: OWNER_QUOTE._id, order: 3});
    assert.strictEqual(response.status, 403);
});
