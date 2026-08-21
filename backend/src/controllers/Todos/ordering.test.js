/* A sorszám-eltolás tesztjei — a lista INTEGRITÁSÁNAK magja.

   Minden elemnek egyedi, hézagmentes `order`-e van. Beszúráskor, törléskor és
   áthelyezéskor a szomszédokat pontosan el kell tolni, különben lyuk vagy
   ütközés keletkezik a sorszámokban (amitől a húzás és a rendezés némán
   elromlana). Ezt a controllerek egy updateMany-hívással intézik; itt azt
   ellenőrizzük, hogy a SZŰRŐ és az ELTOLÁS iránya minden esetben helyes.

   A Mongoose-modellt memóriabeli mockra cseréljük (mint az ownership.test.js),
   és az updateMany-hívások argumentumait rögzítjük — adatbázis nem kell. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const request = require("supertest");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";

const modelPath = require.resolve("../../models/todos");
const userModelPath = require.resolve("../../models/users");
const newId = () => new mongoose.Types.ObjectId().toString();
const OWNER = newId();
// A kliens adta azonosító: a létrehozás ezt küldi, a szerver ezzel szúr be.
const NEW_ID = newId();
// A vizsgált to-do az 5. sorszámon áll — a mozgatásokat ehhez viszonyítjuk.
const LIST = {_id: newId(), user: OWNER, title: "Lista", order: 5};

// Minden updateMany-hívás szűrőjét és eltolását ide gyűjtjük.
const updateManyCalls = [];

/* A create `new Todos(...).save()`-t hív, ezért a mock KONSTRUKTOR, a többi
   metódus pedig statikus rajta — ugyanaz a Todos, amit a controllerek látnak. */
function Todos(data) { Object.assign(this, data); }
Todos.findById = (id) => Promise.resolve(String(id) === LIST._id ? LIST : null);
Todos.findByIdAndDelete = () => Promise.resolve(LIST);
Todos.findByIdAndUpdate = () => Promise.resolve(LIST);
Todos.updateMany = (filter, update) => { updateManyCalls.push({filter, update}); return Promise.resolve({}); };
/* A `save()` a MENTETT dokumentumot adja vissza — ahogy a Mongoose is. A create
   ebből veszi az eltolásból kizárandó azonosítót (l. controllers/createOnce.js),
   tehát egy üres promise itt nem a valóságot mintázná. */
Todos.prototype.save = function () { return Promise.resolve(this); };

require.cache[modelPath] = {id: modelPath, filename: modelPath, loaded: true, exports: Todos};
require.cache[userModelPath] = {
    id: userModelPath, filename: userModelPath, loaded: true,
    exports: {findById: async (id) => String(id) === OWNER ? {_id: id, name: "teszt"} : null},
};

const auth = require("../../middleware/auth");
const create = require("./create");
const deleteTodo = require("./delete");
const reorder = require("./reorder");
const update = require("./update");

const app = express();
app.use(express.json());
app.use(auth);
app.use("/create", create);
app.use("/delete", deleteTodo);
app.use("/reorder", reorder);
app.use("/update", update);

const token = jwt.sign({id: OWNER}, process.env.JWT_SECRET, {expiresIn: "7d"});
const post = (path, body) => request(app).post(path).set("Authorization", "Bearer " + token).send(body);

test.beforeEach(() => { updateManyCalls.length = 0; });

/* A LÉTREHOZÁS AZONOSÍTÓT KÜLD, és a szűrő KIHAGYJA azt: a beszúrás megelőzi a
   tolást (az egyedi `_id`-index az atomi kapunk az ismételt kérés ellen, l.
   controllers/createOnce.js), az új dokumentum pedig maga is a `>= order`
   tartományban áll — kihagyás nélkül magát tolná el. */
test("create: a beszúrási helytől fölfelé mindenkit eggyel lejjebb tol, az újat kihagyva", async () => {
    await post("/create", {id: NEW_ID, order: 2, title: "Új", category: "c", color: "warning", tasks: {}, taskOrder: []});
    assert.strictEqual(updateManyCalls.length, 1);
    assert.deepStrictEqual(updateManyCalls[0].filter,
        {user: OWNER, order: {$gte: 2}, _id: {$ne: NEW_ID}});
    assert.strictEqual(updateManyCalls[0].update.$inc.order, 1);
});

test("delete: a törölt fölöttiek eggyel feljebb csúsznak, hogy ne maradjon lyuk", async () => {
    await post("/delete", {id: LIST._id});
    assert.strictEqual(updateManyCalls.length, 1);
    assert.deepStrictEqual(updateManyCalls[0].filter, {user: OWNER, order: {$gt: 5}});
    assert.strictEqual(updateManyCalls[0].update.$inc.order, -1);
});

test("reorder felfelé (5 -> 2): a közbeeső [2, 5) elemek eggyel lejjebb csúsznak", async () => {
    await post("/reorder", {id: LIST._id, order: 2});
    assert.strictEqual(updateManyCalls.length, 1);
    assert.deepStrictEqual(updateManyCalls[0].filter, {user: OWNER, order: {$gte: 2, $lt: 5}});
    assert.strictEqual(updateManyCalls[0].update.$inc.order, 1);
});

test("reorder lefelé (5 -> 8): a közbeeső (5, 8] elemek eggyel feljebb csúsznak", async () => {
    await post("/reorder", {id: LIST._id, order: 8});
    assert.strictEqual(updateManyCalls.length, 1);
    assert.deepStrictEqual(updateManyCalls[0].filter, {user: OWNER, order: {$lte: 8, $gt: 5}});
    assert.strictEqual(updateManyCalls[0].update.$inc.order, -1);
});

test("reorder azonos sorszámra: senkit nem tol el (nincs fölösleges írás)", async () => {
    await post("/reorder", {id: LIST._id, order: 5});
    assert.strictEqual(updateManyCalls.length, 0);
});

/* A szerkesztés (/update) a tartalommal EGYÜTT a sorszámot is állíthatja, és
   ilyenkor a reorderrel AZONOS eltolást kell végeznie. Külön ellenőrizzük, hogy
   ez a másik belépési pont sem romlik el észrevétlenül. A body a teljes to-dót
   viszi (title, tasks…), nem csak az id-t és az ordert. */
const updateBody = (order) => ({id: LIST._id, order, title: "Szerk", category: "c", color: "warning", tasks: {}, taskOrder: []});

test("update felfelé (5 -> 2): a közbeeső [2, 5) elemek eggyel lejjebb csúsznak", async () => {
    await post("/update", updateBody(2));
    assert.strictEqual(updateManyCalls.length, 1);
    assert.deepStrictEqual(updateManyCalls[0].filter, {user: OWNER, order: {$gte: 2, $lt: 5}});
    assert.strictEqual(updateManyCalls[0].update.$inc.order, 1);
});

test("update lefelé (5 -> 8): a közbeeső (5, 8] elemek eggyel feljebb csúsznak", async () => {
    await post("/update", updateBody(8));
    assert.strictEqual(updateManyCalls.length, 1);
    assert.deepStrictEqual(updateManyCalls[0].filter, {user: OWNER, order: {$lte: 8, $gt: 5}});
    assert.strictEqual(updateManyCalls[0].update.$inc.order, -1);
});

test("update változatlan sorszámmal: csak a tartalmat írja, senkit nem tol el", async () => {
    await post("/update", updateBody(5));
    assert.strictEqual(updateManyCalls.length, 0);
});
