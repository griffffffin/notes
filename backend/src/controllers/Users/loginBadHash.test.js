/* A ROMLOTT (nem ellenőrizhető) tárolt jelszó-hash ága.

   Mit véd. A verifyPassword az argon2-hasheket az argon2.verify-jal ellenőrzi, ami
   a ROSSZ jelszóra false-t ad, de egy STRUKTURÁLISAN romlott ("$argon2" előtagú, de
   értelmezhetetlen) hashre DOB. Kezeletlenül ez a dobás egy egyébként lefutó
   belépési kérést 500-zal szakítana meg — és mivel az ilyen kivétel csak egy adott,
   sérült rekordnál csap le, a hiba egy KÜLÖN felhasználót zárna ki némán, miközben
   mindenki másnak működik minden.

   Valóságos-e? Ritka, de nem elképzelhetetlen: kézzel javított rekord, egy
   félbemaradt migráció, vagy épp az argon2id-re állás félúton hagyott adata. A
   védekezés: a verify dobását a login lenyeli, naplózza, és NEM-EGYEZÉSKÉNT kezeli —
   a felhasználó a szokásos, megkülönböztethetetlen 400-at kapja (nem 500-at, és nem
   is tudja meg, hogy létező fiók hashe romlott el).

   ELTÉRÉS a régi (bcrypt-es) változattól: akkor a compare és a getRounds KÜLÖN
   lépés volt, és csak a getRounds dobott — a hibamódot a bcrypt modul kicserélésével
   kellett előállítani. Most az ellenőrzés MAGA dob a romlott hashre, ezért elég egy
   valódi, szándékosan romlott argon2-hasht a fiókba tenni; semmit nem mockolunk. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const request = require("supertest");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";

/* "$argon2" előtagú, de értelmezhetetlen digest: a verifyPassword az argon2-ágra
   lép vele, az argon2.verify pedig nem tudja feldolgozni → dob. */
const BROKEN_HASH = "$argon2id$v=19$m=47104,t=1,p=1$romlott";

const updates = [];
const userModelPath = require.resolve("../../models/users");
require.cache[userModelPath] = {
    id: userModelPath, filename: userModelPath, loaded: true,
    exports: {
        findOne: async () => ({_id: "507f1f77bcf86cd799439011", password: BROKEN_HASH, tokenVersion: 0}),
        updateOne: async (filter, update) => { updates.push({filter, update}); },
    },
};

const login = require("./login");

const app = express();
app.use(express.json());
app.use("/login", login);

test("romlott tárolt hash: a belépés 400-at ad (nem 500), naplóz, és nem hashel át", async () => {
    /* A napló-sort elnyeljük, hogy a teszt kimenete olvasható maradjon — de a
       TARTALMÁT is megnézzük: enélkül a "nem szállt el" állítás abból is zöld lenne,
       hogy a hibát csendben lenyeltük. */
    const original = console.error;
    const lines = [];
    console.error = (...args) => lines.push(args.join(" "));

    let response;
    try {
        response = await request(app).post("/login").send({name: "teszt", password: "akarmi"});
    } finally {
        console.error = original;
    }

    assert.strictEqual(response.status, 400,
        "a romlott hash miatt vagy elszállt (500), vagy beengedett — egyik sem szabad");
    assert.strictEqual(updates.length, 0, "romlott hasht nem írunk felül");
    assert.strictEqual(lines.length, 1, "a hibának a NAPLÓBA kell kerülnie, hogy kiderüljön");
    assert.match(lines[0], /nem ellenőrizhető/);
});
