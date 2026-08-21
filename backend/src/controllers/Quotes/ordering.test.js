/* Az idézet-sorszámok integritása — a to-do ordering.test.js mintájára. Minden
   idézetnek egyedi, hézagmentes order-e van; beszúráskor, törléskor és
   áthelyezéskor a szomszédokat pontosan el kell tolni. Az updateMany-hívások
   szűrőjét és eltolását rögzítjük, adatbázis nélkül. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const request = require("supertest");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";

const modelPath = require.resolve("../../models/quotes");
const userModelPath = require.resolve("../../models/users");
const newId = () => new mongoose.Types.ObjectId().toString();
const OWNER = newId();
// A kliens adta azonosító: a létrehozás ezt küldi, a szerver ezzel szúr be.
const NEW_ID = newId();
// A vizsgált idézet az 5. sorszámon áll — a mozgatásokat ehhez viszonyítjuk.
const QUOTE = {_id: newId(), user: OWNER, quote: "Idézet", author: "Szerző", order: 5};

const updateManyCalls = [];

// A create `new Quotes(...).save()`-t hív, ezért a mock KONSTRUKTOR, statikus
// metódusokkal — ugyanaz a Quotes, amit a controllerek látnak.
function Quotes(data) { Object.assign(this, data); }
Quotes.findById = (id) => Promise.resolve(String(id) === QUOTE._id ? QUOTE : null);
Quotes.findByIdAndDelete = () => Promise.resolve(QUOTE);
Quotes.findByIdAndUpdate = () => Promise.resolve(QUOTE);
Quotes.updateMany = (filter, update) => { updateManyCalls.push({filter, update}); return Promise.resolve({}); };
/* A `save()` a MENTETT dokumentumot adja vissza — ahogy a Mongoose is. A create
   ebből veszi az eltolásból kizárandó azonosítót (l. controllers/createOnce.js),
   tehát egy üres promise itt nem a valóságot mintázná. */
Quotes.prototype.save = function () { return Promise.resolve(this); };

require.cache[modelPath] = {id: modelPath, filename: modelPath, loaded: true, exports: Quotes};
require.cache[userModelPath] = {
    id: userModelPath, filename: userModelPath, loaded: true,
    exports: {findById: async (id) => String(id) === OWNER ? {_id: id, name: "teszt"} : null},
};

const auth = require("../../middleware/auth");
const create = require("./create");
const deleteQuote = require("./delete");
const reorder = require("./reorder");
const update = require("./update");

const app = express();
app.use(express.json());
app.use(auth);
app.use("/create", create);
app.use("/delete", deleteQuote);
app.use("/reorder", reorder);
app.use("/update", update);

const token = jwt.sign({id: OWNER}, process.env.JWT_SECRET, {expiresIn: "7d"});
const post = (path, body) => request(app).post(path).set("Authorization", "Bearer " + token).send(body);

test.beforeEach(() => { updateManyCalls.length = 0; });

/* A FÉLBEMARADT MŰVELET. A sorszám-eltolás és az elem írása nem atomi (tranzakció
   nincs), tehát ha a második lépés elbukik, az első ottmarad — a listában ütközés
   vagy hézag keletkezik, hibaüzenet nélkül. A végpontok ilyenkor VISSZAVESZIK az
   eltolást; itt azt kérjük számon, hogy a visszatoló hívás tényleg kimegy, és a
   kérés attól még hibával válaszol. */
test("törlés: ha maga a törlés bukik el, a végpont VISSZATOLJA a szomszédokat", async () => {
    const original = Quotes.findByIdAndDelete;
    Quotes.findByIdAndDelete = () => Promise.reject(new Error("adatbázis"));

    const response = await post("/delete", {id: QUOTE._id});
    Quotes.findByIdAndDelete = original;

    assert.strictEqual(response.status, 500, "a hibát nem nyeljük el");
    assert.strictEqual(updateManyCalls.length, 2, "eltolás ÉS visszavétel");
    // Az első a törlés eltolása (fölöttiek -1), a második a visszavétele (+1).
    assert.strictEqual(updateManyCalls[0].update.$inc.order, -1);
    assert.strictEqual(updateManyCalls[1].update.$inc.order, 1);
    // A visszatolás a TÖRLENDŐ elemet kihagyja: az még a helyén áll.
    assert.deepStrictEqual(updateManyCalls[1].filter._id, {$ne: QUOTE._id});
});

test("átsorolás: ha a sorszám írása bukik el, a végpont VISSZATOLJA a szomszédokat", async () => {
    const original = Quotes.findByIdAndUpdate;
    Quotes.findByIdAndUpdate = () => Promise.reject(new Error("adatbázis"));

    const response = await post("/reorder", {id: QUOTE._id, order: 2});
    Quotes.findByIdAndUpdate = original;

    assert.strictEqual(response.status, 500);
    assert.strictEqual(updateManyCalls.length, 2, "eltolás ÉS visszavétel");
    assert.strictEqual(updateManyCalls[0].update.$inc.order, 1, "5 → 2: a köztesek lejjebb");
    assert.strictEqual(updateManyCalls[1].update.$inc.order, -1, "a visszavétel felfelé");
    assert.deepStrictEqual(updateManyCalls[1].filter._id, {$ne: QUOTE._id});
});

/* A LÉTREHOZÁS AZONOSÍTÓT KÜLD, és a szűrő KIHAGYJA azt: a beszúrás megelőzi a
   tolást (az egyedi `_id`-index az atomi kapunk az ismételt kérés ellen, l.
   controllers/createOnce.js), az új dokumentum pedig maga is a `>= order`
   tartományban áll — kihagyás nélkül magát tolná el. */
test("create: a beszúrási helytől fölfelé mindenkit eggyel lejjebb tol, az újat kihagyva", async () => {
    await post("/create", {id: NEW_ID, order: 2, quote: "Új", author: "Sz"});
    assert.strictEqual(updateManyCalls.length, 1);
    assert.deepStrictEqual(updateManyCalls[0].filter,
        {user: OWNER, order: {$gte: 2}, _id: {$ne: NEW_ID}});
    assert.strictEqual(updateManyCalls[0].update.$inc.order, 1);
});

test("delete: a törölt fölöttiek eggyel feljebb csúsznak, hogy ne maradjon lyuk", async () => {
    await post("/delete", {id: QUOTE._id});
    assert.strictEqual(updateManyCalls.length, 1);
    assert.deepStrictEqual(updateManyCalls[0].filter, {user: OWNER, order: {$gt: 5}});
    assert.strictEqual(updateManyCalls[0].update.$inc.order, -1);
});

test("reorder felfelé (5 -> 2): a közbeeső [2, 5) elemek eggyel lejjebb csúsznak", async () => {
    await post("/reorder", {id: QUOTE._id, order: 2});
    assert.strictEqual(updateManyCalls.length, 1);
    assert.deepStrictEqual(updateManyCalls[0].filter, {user: OWNER, order: {$gte: 2, $lt: 5}});
    assert.strictEqual(updateManyCalls[0].update.$inc.order, 1);
});

test("reorder lefelé (5 -> 8): a közbeeső (5, 8] elemek eggyel feljebb csúsznak", async () => {
    await post("/reorder", {id: QUOTE._id, order: 8});
    assert.strictEqual(updateManyCalls.length, 1);
    assert.deepStrictEqual(updateManyCalls[0].filter, {user: OWNER, order: {$lte: 8, $gt: 5}});
    assert.strictEqual(updateManyCalls[0].update.$inc.order, -1);
});

test("reorder azonos sorszámra: senkit nem tol el (nincs fölösleges írás)", async () => {
    await post("/reorder", {id: QUOTE._id, order: 5});
    assert.strictEqual(updateManyCalls.length, 0);
});

test("update sorszám-változással (5 -> 2): a reorderrel azonos eltolást végzi", async () => {
    await post("/update", {id: QUOTE._id, order: 2, quote: "Sz", author: "A"});
    assert.strictEqual(updateManyCalls.length, 1);
    assert.deepStrictEqual(updateManyCalls[0].filter, {user: OWNER, order: {$gte: 2, $lt: 5}});
    assert.strictEqual(updateManyCalls[0].update.$inc.order, 1);
});

test("update változatlan sorszámmal: csak a tartalmat írja, senkit nem tol el", async () => {
    await post("/update", {id: QUOTE._id, order: 5, quote: "Sz", author: "A"});
    assert.strictEqual(updateManyCalls.length, 0);
});
