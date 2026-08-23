/* A szerző-javasló végpont tesztjei. Az aggregáció maga a DB dolga (a
   FerretDB-támogatást élőben igazoltuk); itt a controller LOGIKÁJÁT nézzük: a
   csoport-neveket adja-e vissza, helyesen tölti-e a szűrőt, és nem enged-e
   regex-injekciót. Ezért az aggregate-et mockoljuk, és a KAPOTT pipeline-t
   rögzítjük. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const {userStub, bearerFor} = require("../../test/authStub");
const mongoose = require("mongoose");
const request = require("supertest");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";

const modelPath = require.resolve("../../models/quotes");
const userModelPath = require.resolve("../../models/users");
const OWNER = new mongoose.Types.ObjectId().toString();

let lastPipeline = null;
require.cache[modelPath] = {
    id: modelPath, filename: modelPath, loaded: true,
    exports: {
        aggregate: (pipeline) => {
            lastPipeline = pipeline;
            return Promise.resolve([{_id: "Márai"}, {_id: "Mátyás"}]);
        },
    },
};
require.cache[userModelPath] = {
    id: userModelPath, filename: userModelPath, loaded: true,
    exports: {findById: async (id) => String(id) === OWNER ? userStub(id) : null},
};

const auth = require("../../middleware/auth");
const readAuthors = require("./readAuthors");

const app = express();
app.use(express.json());
app.use(auth);
app.use("/authors", readAuthors);

const token = bearerFor(OWNER);
const post = (body) => request(app).post("/authors").set("Authorization", token).send(body);

test("a szerzőneveket adja vissza (a csoportok _id-jét)", async () => {
    const response = await post({prefix: "Má"});
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body, ["Márai", "Mátyás"]);
});

test("a prefixet a user szűrőjébe teszi, a névtelen szerzőt ('') kizárva", async () => {
    await post({prefix: "Má"});
    const match = lastPipeline[0].$match;
    assert.strictEqual(match.user, OWNER);
    assert.strictEqual(match.author.$regex, "^Má");
    assert.strictEqual(match.author.$ne, "");
});

test("regex-speciális prefixet escape-el (injekció ellen)", async () => {
    await post({prefix: ".*"});
    // A ".*" nem maradhat élő regex — escape-elve "\.\*".
    assert.strictEqual(lastPipeline[0].$match.author.$regex, "^\\.\\*");
});

test("nem string prefixet üresre kényszerít (operátor ne jusson a szűrőbe)", async () => {
    await post({prefix: {$ne: null}});
    assert.strictEqual(lastPipeline[0].$match.author.$regex, "^");
});

/* A VALÓDI ROUTER: ott ül-e a validátor a végpont előtt?

   A fenti tesztek a controllert MAGÁT mérik, tehát zöldek maradnának akkor is, ha
   valaki a routes.js-ből kiveszi a `validateAuthorPrefix`-et — a controller
   `typeof`-ja továbbra is megvédené az injekciótól, csak a HOSSZKORLÁT tűnne el
   némán. Ezért ez a teszt a felépült routert szólítja meg.

   A modell-mockok fentebb már a require.cache-ben ülnek, tehát a routes.js is
   azokat kapja — adatbázis itt sem kell. */
const routes = require("../../routes");

const realApp = express();
realApp.use(express.json());
realApp.use(routes);
const postReal = (body) =>
    request(realApp).post("/quotes/authors").set("Authorization", token).send(body);

test("a routerben a /quotes/authors a hossz-validátor MÖGÖTT ül", async () => {
    assert.strictEqual((await postReal({prefix: "Má"})).status, 200);
    assert.strictEqual((await postReal({prefix: "a".repeat(201)})).status, 400,
        "a túl hosszú előtag 200-at kapott — a validateAuthorPrefix nincs bekötve a routes.js-ben");
});
