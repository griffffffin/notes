/* A keresés MÓD-döntő végpontjának tesztjei — ez a feladat magja: a döntéstábla
   (A = pontos szerző-egyezés, S = a kifejezés egy idézet szövegében is előfordul)
   három sora. Szerző-mód CSAK A ∧ ¬S esetén; minden más → szöveg-mód.

   A findOne (A) és az exists (S) válaszát tesztenként állítjuk (authorMatch,
   inText), és rögzítjük a KAPOTT szűrőket a horgony/escape ellenőrzéséhez. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const request = require("supertest");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";

const modelPath = require.resolve("../../models/quotes");
const userModelPath = require.resolve("../../models/users");
const OWNER = new mongoose.Types.ObjectId().toString();

// Tesztenként átírható válaszok + a rögzített szűrők.
let authorMatch = null;
let inText = null;
let lastAuthorFilter = null;
let lastTextFilter = null;
require.cache[modelPath] = {
    id: modelPath, filename: modelPath, loaded: true,
    exports: {
        findOne: (filter) => {
            lastAuthorFilter = filter;
            return Promise.resolve(authorMatch);
        },
        exists: (filter) => {
            lastTextFilter = filter;
            return Promise.resolve(inText);
        },
    },
};
require.cache[userModelPath] = {
    id: userModelPath, filename: userModelPath, loaded: true,
    exports: {findById: async (id) => String(id) === OWNER ? {_id: id, name: "teszt"} : null},
};

const auth = require("../../middleware/auth");
const readSearchMode = require("./readSearchMode");

const app = express();
app.use(express.json());
app.use(auth);
app.use("/search-mode", readSearchMode);

const token = "Bearer " + jwt.sign({id: OWNER}, process.env.JWT_SECRET, {expiresIn: "7d"});
const post = (body) => request(app).post("/search-mode").set("Authorization", token).send(body);

test("A ∧ ¬S → szerző-mód, a TÁROLT írásmóddal", async () => {
    authorMatch = {author: "Ady"};   // van pontos szerző-egyezés
    inText = null;                    // de a szövegben nem fordul elő
    const response = await post({term: "ady"});
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body, {mode: "author", author: "Ady"});
});

test("A ∧ S → szöveg-mód (a szerző egy szövegben is előfordul)", async () => {
    authorMatch = {author: "Ady"};   // van pontos szerző-egyezés
    inText = {_id: "x"};             // ÉS a szövegben is előfordul
    const response = await post({term: "ady"});
    assert.deepStrictEqual(response.body, {mode: "text"});
});

test("¬A → szöveg-mód (nincs pontos szerző-egyezés)", async () => {
    authorMatch = null;
    inText = null;
    const response = await post({term: "élet"});
    assert.deepStrictEqual(response.body, {mode: "text"});
});

test("a szerző-egyezést HORGONYZOTT (^…$), kis-/nagybetű-érzéketlen regexszel nézi, a userre szűrve", async () => {
    authorMatch = null;
    inText = null;
    await post({term: "Ady"});
    assert.strictEqual(lastAuthorFilter.user, OWNER);
    assert.strictEqual(lastAuthorFilter.author.$regex, "^Ady$");
    assert.strictEqual(lastAuthorFilter.author.$options, "i");
    // A szöveg-lét (S) RÉSZLET (nem horgonyzott), szintén a userre szűrve.
    assert.strictEqual(lastTextFilter.user, OWNER);
    assert.strictEqual(lastTextFilter.quote.$regex, "Ady");
    assert.strictEqual(lastTextFilter.quote.$options, "i");
});

test("regex-speciális kifejezést escape-el mindkét szűrőben (injekció ellen)", async () => {
    authorMatch = null;
    inText = null;
    await post({term: ".*"});
    assert.strictEqual(lastAuthorFilter.author.$regex, "^\\.\\*$");
    assert.strictEqual(lastTextFilter.quote.$regex, "\\.\\*");
});
