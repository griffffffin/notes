/* A minden szekcióban KÖZÖS bemenet-ellenőrzés tesztjei. Korábban az azonosító
   ellenőrzését a to-do és az idézet tesztfájlja külön-külön vizsgálta (ugyanazt a
   kódot kétszer); mióta egy middleware szolgálja ki mindkettőt, egy helyen van a
   helye — egy új szekció pedig ingyen kapja ezt a hálót.

   A sorszám-middleware (/reorder) itt kap ELŐSZÖR tesztet: eddig egyik szekció
   tesztfájljában sem szerepelt, pedig ez zárja ki, hogy a húzás egy tetszőleges
   számot (vagy egy operátor-objektumot) írjon a sorszámba. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const mongoose = require("mongoose");
const request = require("supertest");

const {validateObjectId, validateOrderOnly, isValidOrder, MAX_ORDER} = require("./validators");

const app = express();
app.use(express.json());
app.post("/id", validateObjectId, (request_, response) => response.json({ok: true}));
app.post("/order", validateOrderOnly, (request_, response) => response.json({ok: true}));

const postId = (body) => request(app).post("/id").send(body);
const postOrder = (body) => request(app).post("/order").send(body);

test("érvényes ObjectId-t átenged", async () => {
    assert.strictEqual((await postId({id: new mongoose.Types.ObjectId().toString()})).status, 200);
});

test("formailag hibás vagy hiányzó azonosítót elutasít (400)", async () => {
    // Enélkül a Mongoose CastError-t dobna a lekérdezésnél — csúf 500 lenne belőle.
    assert.strictEqual((await postId({id: "nem-id"})).status, 400);
    assert.strictEqual((await postId({})).status, 400);
});

test("azonosító helyett küldött OPERÁTORT elutasít — NoSQL-injekció ellen (400)", async () => {
    assert.strictEqual((await postId({id: {$ne: null}})).status, 400);
});

/* A SZÁM: a mongoose.isValidObjectId ELFOGADTA volna.

   MÉRVE (2026-08-21, a Pi mongoose-ával): `isValidObjectId(12345)` → true. Amíg
   az azonosító mindig a szerverről jött vissza, ez elméleti maradt; a
   LÉTREHOZÁS azonosítóját viszont a kliens adja, tehát ez valódi bemeneti
   felület. A saját, szigorú alak-ellenőrzés (pontosan 24 hexa) ezt a rést zárja
   — és ha valaki egyszer visszatérne a könyvtár tágabb vizsgálatához, ez a teszt
   szól érte. */
test("SZÁMKÉNT küldött azonosítót elutasít (400)", async () => {
    assert.strictEqual((await postId({id: 12345})).status, 400);
});

test("rossz HOSSZÚSÁGÚ és nem hexa azonosítót elutasít (400)", async () => {
    assert.strictEqual((await postId({id: "507f1f77bcf86cd79943901"})).status, 400, "23 karakter");
    assert.strictEqual((await postId({id: "507f1f77bcf86cd7994390111"})).status, 400, "25 karakter");
    assert.strictEqual((await postId({id: "507f1f77bcf86cd79943901z"})).status, 400, "nem hexa karakter");
    assert.strictEqual((await postId({id: "123456789012"})).status, 400, "12 bájtos szöveg");
});

test("NAGYBETŰS hexát átenged (ugyanaz az azonosító)", async () => {
    assert.strictEqual((await postId({id: "507F1F77BCF86CD799439011"})).status, 200);
});

test("érvényes sorszámot átenged", async () => {
    assert.strictEqual((await postOrder({order: 1})).status, 200);
    assert.strictEqual((await postOrder({order: MAX_ORDER})).status, 200);
});

test("nullát, negatívat és a felső korlát fölöttit elutasít (400)", async () => {
    assert.strictEqual((await postOrder({order: 0})).status, 400);
    assert.strictEqual((await postOrder({order: -3})).status, 400);
    assert.strictEqual((await postOrder({order: MAX_ORDER + 1})).status, 400);
});

test("tört sorszámot, szöveget és operátort elutasít (400)", async () => {
    assert.strictEqual((await postOrder({order: 1.5})).status, 400);
    assert.strictEqual((await postOrder({order: "1"})).status, 400);
    assert.strictEqual((await postOrder({order: {$gt: 0}})).status, 400);
    assert.strictEqual((await postOrder({})).status, 400);
});

/* A sorszám-szabály a middleware-en KÍVÜL is használatos (a törzs-validátorok
   hívják ugyanezt), ezért a tiszta függvényt külön is rögzítjük — így egy jövőbeli
   szekció validátora bizonyítottan ugyanazt a tartományt kapja. */
test("az isValidOrder ugyanazt a tartományt engedi, mint a middleware", () => {
    assert.strictEqual(isValidOrder(1), true);
    assert.strictEqual(isValidOrder(MAX_ORDER), true);
    assert.strictEqual(isValidOrder(0), false);
    assert.strictEqual(isValidOrder(MAX_ORDER + 1), false);
    assert.strictEqual(isValidOrder(2.5), false);
    assert.strictEqual(isValidOrder("2"), false);
});
