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
