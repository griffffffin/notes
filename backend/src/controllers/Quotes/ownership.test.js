/* Az idézetek tulajdon-szabályai: a szerkesztő-betöltést, a módosítást, a törlést
   és az átsorolást csak a SAJÁT elemeden végezheted (idegennél/nem létezőnél 403).

   VÉGPONTOK KÖZÖTTI TITKOSÍTÁS (E2EE) UTÁN nincs publikus idézet-végpont: a korábbi
   „bárki olvashatja az azonosítóval" megosztott nézet megszűnt (a publikus megosztás
   a külön menetben, a Shared táblára épül). A tartalom titkosított boríték
   (`ciphertext`), amit a szerkesztő-betöltés a sorszámmal együtt ad ki, a kliens fejt.

   A Mongoose-modellt memóriabeli mockra cseréljük — adatbázis nem kell. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const {userStub, sessionCookieFor} = require("../../test/authStub");
const mongoose = require("mongoose");
const request = require("supertest");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";

const modelPath = require.resolve("../../models/quotes");
const userModelPath = require.resolve("../../models/users");
const newId = () => new mongoose.Types.ObjectId().toString();
const OWNER = newId();
const STRANGER = newId();
const MISSING_ID = newId();
// A tartalom titkosított boríték; a szerver csak tárolja/visszaadja.
const OWNER_QUOTE = {_id: newId(), user: OWNER, ciphertext: "e2ee1.iv.anna", order: 1};

require.cache[modelPath] = {
    id: modelPath, filename: modelPath, loaded: true,
    exports: {
        findById: (id) => Promise.resolve(String(id) === OWNER_QUOTE._id ? OWNER_QUOTE : null),
        findByIdAndDelete: () => Promise.resolve(OWNER_QUOTE),
        findByIdAndUpdate: () => Promise.resolve(OWNER_QUOTE),
        updateMany: () => Promise.resolve({}),
    },
};
require.cache[userModelPath] = {
    id: userModelPath, filename: userModelPath, loaded: true,
    exports: {findById: async (id) => [OWNER, STRANGER].includes(String(id)) ? userStub(id) : null},
};

const auth = require("../../middleware/auth");
const requireOwnership = require("../../middleware/requireOwnership");
const Quotes = require("../../models/quotes");
const readForEdit = require("./readForEdit");
const update = require("./update");
const deleteQuote = require("./delete");
const reorder = require("./reorder");

const app = express();
app.use(express.json());
app.use(auth);
/* A tulajdon-ellenőrzés a route-lánc requireOwnership middleware-ébe költözött (a
   controllerek a request.item-ből dolgoznak) — a teszt a valódi láncot tükrözi. A
   Quotes itt a fent require.cache-be tett mock (findById-t ad). A /edit az auth
   MÖGÖTT: hitelesített, tulajdonos-ellenőrzött. */
app.use("/edit", requireOwnership(Quotes), readForEdit);
app.use("/update", requireOwnership(Quotes), update);
app.use("/delete", requireOwnership(Quotes), deleteQuote);
app.use("/reorder", requireOwnership(Quotes), reorder);

const editBody = {id: OWNER_QUOTE._id, ciphertext: "e2ee1.iv.upd", order: 1};

test("a szerkesztő-betöltés (/edit) a tulajdonosnak kiadja a borítékot ÉS a sorszámot", async () => {
    const response = await request(app).post("/edit").set("Cookie", sessionCookieFor(OWNER)).send({id: OWNER_QUOTE._id});
    assert.strictEqual(response.status, 200);
    // A titkosított boríték — ezt fejti a kliens a mesterkulccsal.
    assert.strictEqual(response.body.ciphertext, "e2ee1.iv.anna");
    // A szerkesztőnek a sorszám (a sorszám-választó kezdőértéke) is kell.
    assert.strictEqual(response.body.order, 1);
    // A user-id itt SEM szivárog (whitelist).
    assert.strictEqual(response.body.user, undefined);
});

test("a szerkesztő-betöltés (/edit) token nélkül 401 (auth mögött van)", async () => {
    const response = await request(app).post("/edit").send({id: OWNER_QUOTE._id});
    assert.strictEqual(response.status, 401);
});

test("IDEGEN nem töltheti be más idézetét a szerkesztőbe (403)", async () => {
    const response = await request(app).post("/edit").set("Cookie", sessionCookieFor(STRANGER)).send({id: OWNER_QUOTE._id});
    assert.strictEqual(response.status, 403);
});

test("nem létező idézet szerkesztő-betöltése 403 (a létezést sem áruljuk el idegennek)", async () => {
    const response = await request(app).post("/edit").set("Cookie", sessionCookieFor(OWNER)).send({id: MISSING_ID});
    assert.strictEqual(response.status, 403);
});

test("IDEGEN nem módosíthatja más idézetét (403)", async () => {
    const response = await request(app).post("/update").set("Cookie", sessionCookieFor(STRANGER)).send(editBody);
    assert.strictEqual(response.status, 403);
});

test("a tulajdonos módosíthatja a sajátját", async () => {
    const response = await request(app).post("/update").set("Cookie", sessionCookieFor(OWNER)).send(editBody);
    assert.strictEqual(response.status, 200);
});

test("IDEGEN nem törölheti más idézetét (403)", async () => {
    const response = await request(app).post("/delete")
        .set("Cookie", sessionCookieFor(STRANGER)).send({id: OWNER_QUOTE._id});
    assert.strictEqual(response.status, 403);
});

test("IDEGEN nem sorolhatja át más idézetét (403)", async () => {
    const response = await request(app).post("/reorder")
        .set("Cookie", sessionCookieFor(STRANGER)).send({id: OWNER_QUOTE._id, order: 3});
    assert.strictEqual(response.status, 403);
});
