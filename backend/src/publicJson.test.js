/* A KIFELÉ MENŐ DOKUMENTUM-VÁLASZOK WHITELISTJE — a szekció-modellek toJSON-ja.

   Ez egy NÉMA szivárgást őriz. A lista- és a szerkesztő-betöltő végpontok a
   Mongoose-dokumentumot `response.json(doc)`-kal küldik ki; ha a séma nem
   szűkítené a JSON-t, a tulajdonos azonosítója (`user`), a séma-verzió (`__v`) és
   az időbélyegek is a dróton mennének — sőt egy jövőbeli új mező is, magától.
   Semmi nem hibázna: a végpont működne, a lista megjelenne, a felesleges mezők
   csak ott ülnének a válaszban.

   A doksit HIDRATÁLJUK (Model.hydrate), mert ez tükrözi a DB-ből betöltött alakot:
   a `__v` és az időbélyegek is jelen vannak rajta — épp az a helyzet, amit a
   végpont szerializál. Új, mentetlen doksin a `__v` nem is lenne rajta, tehát a
   teszt hamis zöldet adhatna.

   A LEGERŐSEBB ÁLLÍTÁS a kulcs-halmaz PONTOS egyezése: nem azt nézzük, hogy egy-két
   ismert mező hiányzik (blacklist-gondolkodás), hanem hogy KIZÁRÓLAG a whitelist
   megy ki. Így egy jövőbeli séma-mező, ami nincs a whitelistben, azonnal buktatja a
   tesztet — nem csendben szivárog. */
const test = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const Quotes = require("./models/quotes");
const Todos = require("./models/todos");

const ID = new mongoose.Types.ObjectId();
const USER = "507f1f77bcf86cd799439011";

test("a Quotes toJSON KIZÁRÓLAG a hálózatra szánt mezőket adja", () => {
    const json = Quotes.hydrate({
        _id: ID, user: USER, quote: "Idézet", author: "Szerző", order: 3, fontSize: 155,
        __v: 7, createdAt: new Date(), updatedAt: new Date(),
    }).toJSON();

    assert.deepStrictEqual(Object.keys(json).sort(),
        ["_id", "author", "fontSize", "order", "quote"],
        "a Quotes válasza más mezőt is kiadott, mint a whitelist");
    assert.strictEqual(json.user, undefined, "a tulajdonos azonosítója nem mehet ki");
    assert.strictEqual(json.__v, undefined, "a séma-verzió nem mehet ki");
    assert.strictEqual(json.createdAt, undefined, "az időbélyeg nem mehet ki");
    assert.strictEqual(json.updatedAt, undefined);
});

test("a Todos toJSON KIZÁRÓLAG a hálózatra szánt mezőket adja", () => {
    /* A tasks NEM üres: a Mongoose `type: Object` üres `{}`-t nem szerializál, így
       egy üres fixtúrával a whitelist tasks-ágát nem is mérnénk. Valós alsorral
       viszont a mezőnek meg KELL jelennie a válaszban. */
    const json = Todos.hydrate({
        _id: ID, user: USER, title: "Cím", category: "otthon", color: "danger",
        percentage: 0, order: 2, tasks: {"0": {id: "0", content: "Tej", done: false}}, taskOrder: [0],
        __v: 4, createdAt: new Date(), updatedAt: new Date(),
    }).toJSON();

    assert.deepStrictEqual(Object.keys(json).sort(),
        ["_id", "category", "color", "order", "percentage", "taskOrder", "tasks", "title"],
        "a Todos válasza más mezőt is kiadott, mint a whitelist");
    assert.strictEqual(json.user, undefined, "a tulajdonos azonosítója nem mehet ki");
    assert.strictEqual(json.__v, undefined, "a séma-verzió nem mehet ki");
    assert.strictEqual(json.createdAt, undefined, "az időbélyeg nem mehet ki");
    assert.strictEqual(json.updatedAt, undefined);
});

/* A whitelist a MEGLÉVŐ mezőket viszont KIADJA: a fenti tesztek "kizárólag"
   állítása üresen is teljesülne (ha semmit nem adna ki), ezért itt külön
   ellenőrizzük, hogy a hálózatra szánt értékek tényleg átjutnak — ez a whitelist
   kontrollja, hogy nem egy mindent-eldobó transzformációt mérünk. */
test("a whitelistelt mezők ÉRTÉKE átjut (nem mindent dobunk el)", () => {
    const json = Quotes.hydrate({
        _id: ID, user: USER, quote: "Idézet", author: "Szerző", order: 3, fontSize: 155,
    }).toJSON();
    assert.strictEqual(json.quote, "Idézet");
    assert.strictEqual(json.author, "Szerző");
    assert.strictEqual(json.order, 3);
    assert.strictEqual(json.fontSize, 155);
    assert.strictEqual(String(json._id), String(ID));
});
