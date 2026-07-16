/* A tulajdonos-ellenőrzés tesztjei — a második nagy biztonsági garancia.
   A régi appban bárki elolvashatta, módosíthatta és TÖRÖLHETTE más listáját,
   ha ismerte az azonosítóját. Itt rögzítjük, hogy ez soha ne térhessen vissza.

   A Mongoose-modellt kicseréljük (mock): így a controller logikáját adatbázis
   nélkül, gyorsan tudjuk vizsgálni. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const request = require("supertest");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";

/* A Todo modell helyére saját, memóriabeli változatot teszünk. A require-gyorsítótár
   kulcsa a feloldott elérési út, ezért azt írjuk felül a controller betöltése ELŐTT.

   Az azonosítók VALÓDI ObjectId-k: az őr és az id-ellenőrzés a formájukat is
   nézi, tehát kitalált szöveggel ("anna-id") a kérés már ott elbukna, és nem a
   tulajdonlást vizsgálnánk. */
const modellUt = require.resolve("../../models/todo");
const userModellUt = require.resolve("../../models/user");
const azonosito = () => new mongoose.Types.ObjectId().toString();
const ANNA = azonosito();
const BELA = azonosito();
const NINCS_ILYEN = azonosito();
const ANNA_LISTAJA = {_id: azonosito(), user: ANNA, title: "Anna listája", order: 1};

require.cache[modellUt] = {
    id: modellUt, filename: modellUt, loaded: true,
    exports: {
        findById: (id) => Promise.resolve(String(id) === ANNA_LISTAJA._id ? ANNA_LISTAJA : null),
        findByIdAndDelete: () => Promise.resolve(ANNA_LISTAJA),
        updateMany: () => Promise.resolve({}),
        findByIdAndUpdate: () => Promise.resolve(ANNA_LISTAJA),
    },
};

// Az őr azóta a user létezését is ellenőrzi — Anna és Béla is valódi fiók.
require.cache[userModellUt] = {
    id: userModellUt, filename: userModellUt, loaded: true,
    exports: {
        findById: async (id) => [ANNA, BELA].includes(String(id)) ? {_id: id, name: "teszt"} : null,
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
        .send({id: NINCS_ILYEN});
    assert.strictEqual(valasz.status, 403);
});
