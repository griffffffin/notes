/* A szöveg-mód találati végpont tesztjei. A tényleges illesztést a DB végzi (a
   regex-keresést élőben igazoltuk); itt a controller LOGIKÁJÁT nézzük: helyesen
   építi-e a szűrőt (a kifejezés a szövegre ÉS a szerzőre, $or-ral), a userre
   szűr-e, és nem enged-e regex-injekciót. Ezért a find-ot mockoljuk, és a KAPOTT
   szűrőt rögzítjük. A .sort("order") láncot a mock egy sort-metódussal adja
   vissza. */
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
const RESULT = [{_id: "1", quote: "Az élet szép", author: "Valaki", order: 1}];

let lastFilter = null;
require.cache[modelPath] = {
    id: modelPath, filename: modelPath, loaded: true,
    exports: {
        find: (filter) => {
            lastFilter = filter;
            return {sort: () => Promise.resolve(RESULT)};
        },
    },
};
require.cache[userModelPath] = {
    id: userModelPath, filename: userModelPath, loaded: true,
    exports: {findById: async (id) => String(id) === OWNER ? userStub(id) : null},
};

const auth = require("../../middleware/auth");
const readSearch = require("./readSearch");

const app = express();
app.use(express.json());
app.use(auth);
app.use("/search", readSearch);

const token = bearerFor(OWNER);
const post = (body) => request(app).post("/search").set("Authorization", token).send(body);

test("a találati tömböt adja vissza (csupaszon, a húzáshoz)", async () => {
    const response = await post({term: "élet"});
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body, RESULT);
});

test("a kifejezést a szövegre ÉS a szerzőre illeszti ($or), a userre szűrve", async () => {
    await post({term: "élet"});
    assert.strictEqual(lastFilter.user, OWNER);
    assert.strictEqual(lastFilter.$or[0].quote.$regex, "élet");
    assert.strictEqual(lastFilter.$or[0].quote.$options, "i");
    assert.strictEqual(lastFilter.$or[1].author.$regex, "élet");
    assert.strictEqual(lastFilter.$or[1].author.$options, "i");
});

test("a szélső szóközöket levágja (a trailing space ne szűkítsen)", async () => {
    await post({term: "  élet  "});
    assert.strictEqual(lastFilter.$or[0].quote.$regex, "élet");
});

test("regex-speciális kifejezést escape-el (injekció ellen)", async () => {
    await post({term: ".*"});
    assert.strictEqual(lastFilter.$or[0].quote.$regex, "\\.\\*");
    assert.strictEqual(lastFilter.$or[1].author.$regex, "\\.\\*");
});
