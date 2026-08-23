/* A tulajdonos-ellenőrzés tesztjei — a második nagy biztonsági garancia.
   A régi appban bárki elolvashatta, módosíthatta és TÖRÖLHETTE más listáját,
   ha ismerte az azonosítóját. Itt rögzítjük, hogy ez soha ne térhessen vissza.

   A Mongoose-modellt kicseréljük (mock): így a controller logikáját adatbázis
   nélkül, gyorsan tudjuk vizsgálni. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const {userStub, bearerFor} = require("../../test/authStub");
const mongoose = require("mongoose");
const request = require("supertest");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";

/* A Todos modell helyére saját, memóriabeli változatot teszünk. A require-gyorsítótár
   kulcsa a feloldott elérési út, ezért azt írjuk felül a controller betöltése ELŐTT.

   Az azonosítók VALÓDI ObjectId-k: az őr és az id-ellenőrzés a formájukat is
   nézi, tehát kitalált szöveggel ("anna-id") a kérés már ott elbukna, és nem a
   tulajdonlást vizsgálnánk. */
const modelPath = require.resolve("../../models/todos");
const userModelPath = require.resolve("../../models/users");
const newId = () => new mongoose.Types.ObjectId().toString();
const OWNER = newId();
const STRANGER = newId();
const MISSING_ID = newId();
const OWNER_LIST = {_id: newId(), user: OWNER, title: "Anna listája", order: 1};

require.cache[modelPath] = {
    id: modelPath, filename: modelPath, loaded: true,
    exports: {
        findById: (id) => Promise.resolve(String(id) === OWNER_LIST._id ? OWNER_LIST : null),
        findByIdAndDelete: () => Promise.resolve(OWNER_LIST),
        updateMany: () => Promise.resolve({}),
        findByIdAndUpdate: () => Promise.resolve(OWNER_LIST),
    },
};

// Az őr azóta a user létezését is ellenőrzi — Anna és Béla is valódi fiók.
require.cache[userModelPath] = {
    id: userModelPath, filename: userModelPath, loaded: true,
    exports: {
        findById: async (id) => [OWNER, STRANGER].includes(String(id)) ? userStub(id) : null,
    },
};

const auth = require("../../middleware/auth");
const readById = require("./readById");
const deleteTodo = require("./delete");
const reorder = require("./reorder");

const app = express();
app.use(express.json());
app.use(auth);
app.use("/id", readById);
app.use("/delete", deleteTodo);
app.use("/reorder", reorder);


test("a tulajdonos elolvashatja a saját listáját", async () => {
    const response = await request(app).post("/id")
        .set("Authorization", bearerFor(OWNER))
        .send({id: OWNER_LIST._id});
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.title, "Anna listája");
});

test("IDEGEN nem olvashatja el más listáját (403)", async () => {
    const response = await request(app).post("/id")
        .set("Authorization", bearerFor(STRANGER))
        .send({id: OWNER_LIST._id});
    assert.strictEqual(response.status, 403);
});

test("IDEGEN nem törölheti más listáját (403)", async () => {
    const response = await request(app).post("/delete")
        .set("Authorization", bearerFor(STRANGER))
        .send({id: OWNER_LIST._id});
    assert.strictEqual(response.status, 403);
});

test("a tulajdonos törölheti a sajátját", async () => {
    const response = await request(app).post("/delete")
        .set("Authorization", bearerFor(OWNER))
        .send({id: OWNER_LIST._id});
    assert.strictEqual(response.status, 200);
});

test("nem létező listánál sem szivárog ki információ (403, nem 404)", async () => {
    // Szándékos: a 404 elárulná, hogy létezik-e az adott azonosító.
    const response = await request(app).post("/id")
        .set("Authorization", bearerFor(OWNER))
        .send({id: MISSING_ID});
    assert.strictEqual(response.status, 403);
});

/* Az átsorolás (főoldali húzás) ugyanúgy más listáját is elérhetné, mint az
   olvasás vagy a törlés — a tulajdonos-ellenőrzésnek ott is állnia kell. */
test("IDEGEN nem sorolhatja át más listáját (403)", async () => {
    const response = await request(app).post("/reorder")
        .set("Authorization", bearerFor(STRANGER))
        .send({id: OWNER_LIST._id, order: 3});
    assert.strictEqual(response.status, 403);
});

test("a tulajdonos átsorolhatja a sajátját", async () => {
    const response = await request(app).post("/reorder")
        .set("Authorization", bearerFor(OWNER))
        .send({id: OWNER_LIST._id, order: 3});
    assert.strictEqual(response.status, 200);
});

test("azonos sorszámra húzva nem csinál semmit", async () => {
    const response = await request(app).post("/reorder")
        .set("Authorization", bearerFor(OWNER))
        .send({id: OWNER_LIST._id, order: OWNER_LIST.order});
    assert.strictEqual(response.status, 200);
});
