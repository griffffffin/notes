/* A JWT-őr tesztjei. Ez a projekt legfontosabb biztonsági rétege: a régi app
   bárkit beengedett, aki mondott egy user-azonosítót — itt rögzítjük, hogy ez
   soha többé ne fordulhasson elő.

   A tesztek NEM igényelnek adatbázist: az auth middleware csak a tokent nézi,
   ezért egy minimális Express-appot állítunk köré. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const jwt = require("jsonwebtoken");
const request = require("supertest");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";
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
    const hamis = jwt.sign({id: "hacker"}, "rossz-titok");
    const valasz = await request(app).post("/").set("Authorization", "Bearer " + hamis).send({});
    assert.strictEqual(valasz.status, 401);
});

test("lejárt tokent elutasít (401)", async () => {
    const lejart = jwt.sign({id: "valaki"}, process.env.JWT_SECRET, {expiresIn: "-1s"});
    const valasz = await request(app).post("/").set("Authorization", "Bearer " + lejart).send({});
    assert.strictEqual(valasz.status, 401);
});

test("Bearer előtag nélküli fejlécet elutasít (401)", async () => {
    const valasz = await request(app).post("/").set("Authorization", tokent("anna")).send({});
    assert.strictEqual(valasz.status, 401);
});

test("érvényes tokent elfogad, és a TOKENBŐL veszi az azonosítót", async () => {
    const valasz = await request(app).post("/").set("Authorization", "Bearer " + tokent("anna")).send({});
    assert.strictEqual(valasz.status, 200);
    assert.strictEqual(valasz.body.userId, "anna");
});

test("a body-ban küldött hamis user-mezőt FIGYELMEN KÍVÜL hagyja", async () => {
    // Ez a régi app fő gyengesége volt: elhitte, amit a kliens küldött.
    const valasz = await request(app)
        .post("/")
        .set("Authorization", "Bearer " + tokent("anna"))
        .send({user: "HACKER"});
    assert.strictEqual(valasz.body.userId, "anna", "a token identitása nyer, nem a body-é");
});
