/* A JWT-őr tesztjei. Ez a projekt legfontosabb biztonsági rétege: a régi app
   bárkit beengedett, aki mondott egy user-azonosítót — itt rögzítjük, hogy ez
   soha többé ne fordulhasson elő.

   A tesztek NEM igényelnek adatbázist: a User modellt kicseréljük egy
   memóriabeli változatra, mielőtt az auth betöltené. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const request = require("supertest");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";

const azonosito = () => new mongoose.Types.ObjectId().toString();
const ANNA = azonosito();
const TOROLT = azonosito();

// A require-gyorsítótár kulcsa a feloldott elérési út — azt írjuk felül az
// auth betöltése ELŐTT, így az a mi példányunkat kapja.
const modellUt = require.resolve("../models/user");
let adatbazisHiba = false;

require.cache[modellUt] = {
    id: modellUt, filename: modellUt, loaded: true,
    exports: {
        findById: async (id) => {
            if (adatbazisHiba) throw new Error("kapcsolat megszakadt");
            return String(id) === ANNA ? {_id: ANNA, name: "anna"} : null;
        },
    },
};

const auth = require("./auth");

// Minimális app: az őr mögött egy végpont, ami visszamondja, kinek hisz.
const app = express();
app.use(express.json());
app.use(auth);
app.post("/", (request_, response) => response.json({userId: request_.userId}));

const tokent = (id) => jwt.sign({id}, process.env.JWT_SECRET, {expiresIn: "7d"});

test("token nélkül elutasít (401)", async () => {
    const valasz = await request(app).post("/").send({});
    assert.strictEqual(valasz.status, 401);
});

test("hamis aláírású tokent elutasít (401)", async () => {
    const hamis = jwt.sign({id: ANNA}, "rossz-titok");
    const valasz = await request(app).post("/").set("Authorization", "Bearer " + hamis).send({});
    assert.strictEqual(valasz.status, 401);
});

test("lejárt tokent elutasít (401)", async () => {
    const lejart = jwt.sign({id: ANNA}, process.env.JWT_SECRET, {expiresIn: "-1s"});
    const valasz = await request(app).post("/").set("Authorization", "Bearer " + lejart).send({});
    assert.strictEqual(valasz.status, 401);
});

test("Bearer előtag nélküli fejlécet elutasít (401)", async () => {
    const valasz = await request(app).post("/").set("Authorization", tokent(ANNA)).send({});
    assert.strictEqual(valasz.status, 401);
});

test("érvényes tokent elfogad, és a TOKENBŐL veszi az azonosítót", async () => {
    const valasz = await request(app).post("/").set("Authorization", "Bearer " + tokent(ANNA)).send({});
    assert.strictEqual(valasz.status, 200);
    assert.strictEqual(valasz.body.userId, ANNA);
});

test("a body-ban küldött hamis user-mezőt FIGYELMEN KÍVÜL hagyja", async () => {
    // Ez a régi app fő gyengesége volt: elhitte, amit a kliens küldött.
    const valasz = await request(app)
        .post("/")
        .set("Authorization", "Bearer " + tokent(ANNA))
        .send({user: "HACKER"});
    assert.strictEqual(valasz.body.userId, ANNA, "a token identitása nyer, nem a body-é");
});

test("TÖRÖLT felhasználó érvényes tokenjét elutasítja (401)", async () => {
    /* Az aláírás rendben van — a fiók nincs meg. Az aláírás csak azt bizonyítja,
       hogy mi állítottuk ki a tokent, azt nem, hogy a fiók ma is létezik. */
    const valasz = await request(app).post("/").set("Authorization", "Bearer " + tokent(TOROLT)).send({});
    assert.strictEqual(valasz.status, 401);
});

test("formailag hibás azonosítójú tokent elutasít (401)", async () => {
    const valasz = await request(app).post("/").set("Authorization", "Bearer " + tokent("nem-objectid")).send({});
    assert.strictEqual(valasz.status, 401);
});

test("adatbázis-hibánál 503, NEM 401 — a hibától senki ne essen ki", async () => {
    adatbazisHiba = true;
    const valasz = await request(app).post("/").set("Authorization", "Bearer " + tokent(ANNA)).send({});
    adatbazisHiba = false;
    assert.strictEqual(valasz.status, 503,
        "a 401-re a kliens kijelentkeztet — egy múló adatbázishiba ne tegye ezt");
});
