/* Az idézetek tulajdon-szabályai. KÜLÖNBSÉG a to-dóhoz képest: egy idézetet
   BÁRKI elolvashat az azonosítójával (a megosztott link ezért működik token
   nélkül), DE módosítani/törölni/átsorolni csak a sajátodat lehet.

   A Mongoose-modellt memóriabeli mockra cseréljük — adatbázis nem kell. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const request = require("supertest");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";

const modelPath = require.resolve("../../models/quote");
const userModelPath = require.resolve("../../models/user");
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
    exports: {findById: async (id) => [OWNER, STRANGER].includes(String(id)) ? {_id: id, name: "teszt"} : null},
};

const auth = require("../../middleware/auth");
const readById = require("./readById");
const update = require("./update");
const deleteQuote = require("./delete");
const reorder = require("./reorder");

const app = express();
app.use(express.json());
// A readById az auth ELŐTT: publikus (megosztott link). app.use (nem app.post):
// a controller egy Router, amit mountolni kell, hogy a belső "/" illeszkedjen.
app.use("/id", readById);
app.use(auth);
app.use("/update", update);
app.use("/delete", deleteQuote);
app.use("/reorder", reorder);

const tokenFor = (id) => "Bearer " + jwt.sign({id}, process.env.JWT_SECRET, {expiresIn: "7d"});
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

test("a publikus válasz csak a whitelistelt mezőket adja — a tulajdonos user-id és a belső azonosító NEM szivárog", async () => {
    const response = await request(app).post("/id").send({id: OWNER_QUOTE._id});
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.quote, "Anna idézete");
    assert.strictEqual(response.body.author, "Anna");
    // A sorszám a SZERKESZTŐNEK, a betűméret a MEGJELENÍTÉSNEK kell — jelen vannak.
    assert.strictEqual(response.body.order, 1);
    assert.strictEqual(response.body.fontSize, 160);
    // A tulajdonos azonosítója egy publikus végponton nem jelenhet meg.
    assert.strictEqual(response.body.user, undefined);
    // A belső Mongo-azonosító sem szivárog (nincs rá szükség).
    assert.strictEqual(response.body._id, undefined);
});

test("IDEGEN nem módosíthatja más idézetét (403)", async () => {
    const response = await request(app).post("/update").set("Authorization", tokenFor(STRANGER)).send(editBody);
    assert.strictEqual(response.status, 403);
});

test("a tulajdonos módosíthatja a sajátját", async () => {
    const response = await request(app).post("/update").set("Authorization", tokenFor(OWNER)).send(editBody);
    assert.strictEqual(response.status, 200);
});

test("IDEGEN nem törölheti más idézetét (403)", async () => {
    const response = await request(app).post("/delete")
        .set("Authorization", tokenFor(STRANGER)).send({id: OWNER_QUOTE._id});
    assert.strictEqual(response.status, 403);
});

test("IDEGEN nem sorolhatja át más idézetét (403)", async () => {
    const response = await request(app).post("/reorder")
        .set("Authorization", tokenFor(STRANGER)).send({id: OWNER_QUOTE._id, order: 3});
    assert.strictEqual(response.status, 403);
});
