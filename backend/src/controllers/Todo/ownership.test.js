/* A tulajdonos-ellenőrzés tesztjei — a második nagy biztonsági garancia.
   A régi appban bárki elolvashatta, módosíthatta és TÖRÖLHETTE más listáját,
   ha ismerte az azonosítóját. Itt rögzítjük, hogy ez soha ne térhessen vissza.

   A Mongoose-modellt kicseréljük (mock): így a controller logikáját adatbázis
   nélkül, gyorsan tudjuk vizsgálni. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const path = require("node:path");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";

// A Todo modell helyére saját, memóriabeli változatot teszünk. A require-gyorsítótár
// kulcsa a feloldott elérési út, ezért azt írjuk felül a controller betöltése ELŐTT.
const modellUt = require.resolve("../../models/todo");
const ANNA = "anna-id";
const BELA = "bela-id";
const ANNA_LISTAJA = {_id: "lista-1", user: ANNA, title: "Anna listája", order: 1};

require.cache[modellUt] = {
    id: modellUt, filename: modellUt, loaded: true,
    exports: {
        findById: (id) => Promise.resolve(id === ANNA_LISTAJA._id ? ANNA_LISTAJA : null),
        findByIdAndDelete: () => Promise.resolve(ANNA_LISTAJA),
        updateMany: () => Promise.resolve({}),
        findByIdAndUpdate: () => Promise.resolve(ANNA_LISTAJA),
    },
};

const auth = require("../../middleware/auth");
const readById = require("./readById");
const deleteTodo = require("./delete");

const app = express();
app.use(express.json());
app.use(auth);
app.use("/id", readById);
app.use("/delete", deleteTodo);

const tokent = (id) => jwt.sign({id}, process.env.JWT_SECRET, {expiresIn: "7d"});

test("a tulajdonos elolvashatja a saját listáját", async () => {
    const valasz = await request(app).post("/id")
        .set("Authorization", "Bearer " + tokent(ANNA))
        .send({id: ANNA_LISTAJA._id});
    assert.strictEqual(valasz.status, 200);
    assert.strictEqual(valasz.body.title, "Anna listája");
});

test("IDEGEN nem olvashatja el más listáját (403)", async () => {
    const valasz = await request(app).post("/id")
        .set("Authorization", "Bearer " + tokent(BELA))
        .send({id: ANNA_LISTAJA._id});
    assert.strictEqual(valasz.status, 403);
});

test("IDEGEN nem törölheti más listáját (403)", async () => {
    const valasz = await request(app).post("/delete")
        .set("Authorization", "Bearer " + tokent(BELA))
        .send({id: ANNA_LISTAJA._id});
    assert.strictEqual(valasz.status, 403);
});

test("a tulajdonos törölheti a sajátját", async () => {
    const valasz = await request(app).post("/delete")
        .set("Authorization", "Bearer " + tokent(ANNA))
        .send({id: ANNA_LISTAJA._id});
    assert.strictEqual(valasz.status, 200);
});

test("nem létező listánál sem szivárog ki információ (403, nem 404)", async () => {
    // Szándékos: a 404 elárulná, hogy létezik-e az adott azonosító.
    const valasz = await request(app).post("/id")
        .set("Authorization", "Bearer " + tokent(ANNA))
        .send({id: "nincs-ilyen"});
    assert.strictEqual(valasz.status, 403);
});
