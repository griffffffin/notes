/* A KIJELENTKEZÉS TESZTJEI. A kérdés nem az, hogy 200-at ad-e: az a könnyű fele.
   A kérdés az, hogy a MUNKAMENETEK tényleg visszavonódnak-e, és hogy a végpont
   KIT léptet ki — mert egy rosszul kötött felhasználó-forrás itt fegyverré tenné
   a végpontot.

   Adatbázis nincs: a modellt a require-gyorsítótáron át cseréljük, még az auth és
   a controller betöltése ELŐTT. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const mongoose = require("mongoose");
const request = require("supertest");
const {userStub, sessionCookieFor} = require("../../test/authStub");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";

const USER = new mongoose.Types.ObjectId().toString();
const OTHER = new mongoose.Types.ObjectId().toString();

let updates = [];
let updateFails = false;

const modelPath = require.resolve("../../models/users");
require.cache[modelPath] = {
    id: modelPath, filename: modelPath, loaded: true,
    exports: {
        findById: async (id) => ([USER, OTHER].includes(String(id)) ? userStub(id) : null),
        updateOne: async (filter, update) => {
            updates.push({filter, update});
            if (updateFails) throw new Error("kapcsolat megszakadt");
            return {matchedCount: 1, modifiedCount: 1};
        },
    },
};

const auth = require("../../middleware/auth");
const logout = require("./logout");

const app = express();
app.use(express.json());
app.use(auth);
app.use("/logout", logout);

const post = (id, body = {}) =>
    request(app).post("/logout").set("Cookie", sessionCookieFor(id)).send(body);

test.beforeEach(() => { updates = []; updateFails = false; });

test("a tárolt verziót EGGYEL növeli, atomi $inc-cel", async () => {
    const response = await post(USER);

    assert.strictEqual(response.status, 200);
    assert.strictEqual(updates.length, 1, "pontosan egy írás történjen");
    /* AZ ALAKOT IS ÁLLÍTJUK, nem csak azt, hogy írtunk valamit. A
       `$set: {tokenVersion: 1}` ugyanígy zöld volna egy "történt írás" tesztnél,
       közben viszont a MÁSODIK kijelentkezés már nem változtatna semmin — a
       korábbi tokenek feltámadnának. Az "olvasd ki, adj hozzá, írd vissza" alak
       pedig két párhuzamos kijelentkezésnél veszítene el egy növelést, némán. */
    assert.deepStrictEqual(updates[0].update, {$inc: {tokenVersion: 1}});
});

test("a TOKENBŐL veszi a fiókot, nem a kérés törzséből", async () => {
    /* Ha a törzsnek hinne, ez a végpont bárki munkameneteit megszüntethetné —
       hitelesítés nélküli kiléptető fegyver lenne bárki kezében. */
    const response = await post(USER, {user: OTHER, userId: OTHER, id: OTHER});

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(updates[0].filter, {_id: USER},
        "a törzsben küldött idegen azonosító nem befolyásolhatja, kit léptetünk ki");
});

test("adatbázis-hibánál 500 — NEM állítja, hogy visszavonta", async () => {
    /* A 200 itt hazugság volna: a kliens EBBŐL tudja meg, hogy a kijelentkezés
       csak helyben sikerült, a szerveren nem. Elnyelve a felhasználó azt hinné,
       hogy a többi eszközéről is kilépett. */
    updateFails = true;
    const response = await post(USER);

    assert.strictEqual(response.status, 500);
});

test("token nélkül nem érhető el (401) — az auth-határ mögött ül", async () => {
    const response = await request(app).post("/logout").send({});

    assert.strictEqual(response.status, 401);
    assert.strictEqual(updates.length, 0, "hitelesítés nélkül egyetlen írás sem történhet");
});
