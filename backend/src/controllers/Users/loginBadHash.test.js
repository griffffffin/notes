/* AZ OLVASHATATLAN JELSZÓ-HASH ága — külön fájlban, mert ehhez a bcryptet
   MAGÁT kell kicserélni.

   Mit véd. Az áthashelés a `bcrypt.getRounds`-szal kérdezi meg, milyen
   költségtényezővel készült a tárolt hash. Ez a hívás DOB, ha az érték nem
   érvényes bcrypt-hash. Kezeletlenül tehát egy egyébként SIKERES belépés
   szállna el 500-zal — a felhasználó nem tudna belépni, és a hibaüzenetből
   semmire nem következtetne.

   Valóságos-e? Ritka, de nem elképzelhetetlen: kézzel javított rekord, egy
   félbemaradt migráció, vagy egy jövőbeli algoritmus-váltás (argon2) félúton
   hagyott adata. A védekezés ára egy try/catch, a hiánya pedig egy kizárt
   felhasználó — ezért van, és ezért van rá teszt.

   MIÉRT KÜLÖN FÁJL: a valódi bcrypttel ez az ág ELÉRHETETLEN (ha a hash
   olvashatatlan, a compare is hamisat ad, tehát a rossz jelszó ágán állunk meg).
   Csak úgy próbálható ki, ha a compare igazat mond, a getRounds viszont dob —
   ehhez a modult ki kell cserélni, az pedig a `node --test` külön folyamatában
   biztonságos, egy fájlon belül viszont a többi tesztre is átterülne. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const request = require("supertest");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";

/* A bcrypt PÓTLÉKA: helyesnek fogad el minden jelszót, a költségtényezőt viszont
   nem tudja kiolvasni. A `hashSync` a password.js álca-hashéhez kell (az a modul
   betöltéskor számol), a `hash` pedig ahhoz, hogy lássuk: NEM hívja meg senki. */
const bcryptPath = require.resolve("bcrypt");
let hashCalls = 0;
require.cache[bcryptPath] = {
    id: bcryptPath, filename: bcryptPath, loaded: true,
    exports: {
        compare: async () => true,
        getRounds: () => { throw new Error("ez nem bcrypt-hash"); },
        hashSync: () => "$2b$11$alca-hash",
        hash: async () => { hashCalls += 1; return "$2b$11$uj-hash"; },
    },
};

const updates = [];
const userModelPath = require.resolve("../../models/users");
require.cache[userModelPath] = {
    id: userModelPath, filename: userModelPath, loaded: true,
    exports: {
        findOne: async () => ({_id: "507f1f77bcf86cd799439011", password: "nem-egy-hash", tokenVersion: 0}),
        updateOne: async (filter, update) => { updates.push({filter, update}); },
    },
};

const login = require("./login");

const app = express();
app.use(express.json());
app.use("/login", login);

test("olvashatatlan tárolt hash: a belépés SIKERÜL, csak az áthashelés marad el", async () => {
    /* A napló-sort elnyeljük, hogy a teszt kimenete olvasható maradjon — de a
       TARTALMÁT is megnézzük: enélkül a "nem dobott el" állítás abból is zöld
       lenne, hogy a hibát csendben lenyeltük. */
    const original = console.error;
    const lines = [];
    console.error = (...args) => lines.push(args.join(" "));

    let response;
    try {
        response = await request(app).post("/login").send({name: "teszt", password: "akarmi"});
    } finally {
        console.error = original;
    }

    assert.strictEqual(response.status, 200,
        "az olvashatatlan hash miatt elszállt a belépés — a getRounds hibája nincs kezelve");
    assert.strictEqual(updates.length, 0, "felismerhetetlen hasht nem írunk felül");
    assert.strictEqual(hashCalls, 0, "hashelni sem próbáltunk");
    assert.strictEqual(lines.length, 1, "a hibának a NAPLÓBA kell kerülnie, hogy kiderüljön");
    assert.match(lines[0], /költségtényező/);
});
