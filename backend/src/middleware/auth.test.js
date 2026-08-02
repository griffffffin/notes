/* A JWT-őr tesztjei. Ez a projekt legfontosabb biztonsági rétege: a régi app
   bárkit beengedett, aki mondott egy user-azonosítót — itt rögzítjük, hogy ez
   soha többé ne fordulhasson elő.

   A tesztek NEM igényelnek adatbázist: a Users modellt kicseréljük egy
   memóriabeli változatra, mielőtt az auth betöltené. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const request = require("supertest");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";

const newId = () => new mongoose.Types.ObjectId().toString();
const OWNER = newId();
const DELETED_USER = newId();

// A require-gyorsítótár kulcsa a feloldott elérési út — azt írjuk felül az
// auth betöltése ELŐTT, így az a mi példányunkat kapja.
const modelPath = require.resolve("../models/users");
let databaseDown = false;

require.cache[modelPath] = {
    id: modelPath, filename: modelPath, loaded: true,
    exports: {
        findById: async (id) => {
            if (databaseDown) throw new Error("kapcsolat megszakadt");
            return String(id) === OWNER ? {_id: OWNER, name: "anna"} : null;
        },
    },
};

const auth = require("./auth");

// Minimális app: az őr mögött egy végpont, ami visszamondja, kinek hisz.
const app = express();
app.use(express.json());
app.use(auth);
app.post("/", (request_, response) => response.json({userId: request_.userId}));

const tokenFor = (id) => jwt.sign({id}, process.env.JWT_SECRET, {expiresIn: "7d"});

test("token nélkül elutasít (401)", async () => {
    const response = await request(app).post("/").send({});
    assert.strictEqual(response.status, 401);
});

test("hamis aláírású tokent elutasít (401)", async () => {
    const forged = jwt.sign({id: OWNER}, "rossz-titok");
    const response = await request(app).post("/").set("Authorization", "Bearer " + forged).send({});
    assert.strictEqual(response.status, 401);
});

test("lejárt tokent elutasít (401)", async () => {
    const expired = jwt.sign({id: OWNER}, process.env.JWT_SECRET, {expiresIn: "-1s"});
    const response = await request(app).post("/").set("Authorization", "Bearer " + expired).send({});
    assert.strictEqual(response.status, 401);
});

test("Bearer előtag nélküli fejlécet elutasít (401)", async () => {
    const response = await request(app).post("/").set("Authorization", tokenFor(OWNER)).send({});
    assert.strictEqual(response.status, 401);
});

test("érvényes tokent elfogad, és a TOKENBŐL veszi az azonosítót", async () => {
    const response = await request(app).post("/").set("Authorization", "Bearer " + tokenFor(OWNER)).send({});
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.userId, OWNER);
});

test("a body-ban küldött hamis user-mezőt FIGYELMEN KÍVÜL hagyja", async () => {
    // Ez a régi app fő gyengesége volt: elhitte, amit a kliens küldött.
    const response = await request(app)
        .post("/")
        .set("Authorization", "Bearer " + tokenFor(OWNER))
        .send({user: "HACKER"});
    assert.strictEqual(response.body.userId, OWNER, "a token identitása nyer, nem a body-é");
});

test("TÖRÖLT felhasználó érvényes tokenjét elutasítja (401)", async () => {
    /* Az aláírás rendben van — a fiók nincs meg. Az aláírás csak azt bizonyítja,
       hogy mi állítottuk ki a tokent, azt nem, hogy a fiók ma is létezik. */
    const response = await request(app).post("/").set("Authorization", "Bearer " + tokenFor(DELETED_USER)).send({});
    assert.strictEqual(response.status, 401);
});

test("formailag hibás azonosítójú tokent elutasít (401)", async () => {
    const response = await request(app).post("/").set("Authorization", "Bearer " + tokenFor("nem-objectid")).send({});
    assert.strictEqual(response.status, 401);
});

test("adatbázis-hibánál 503, NEM 401 — a hibától senki ne essen ki", async () => {
    databaseDown = true;
    const response = await request(app).post("/").set("Authorization", "Bearer " + tokenFor(OWNER)).send({});
    databaseDown = false;
    assert.strictEqual(response.status, 503,
        "a 401-re a kliens kijelentkeztet — egy múló adatbázishiba ne tegye ezt");
});
