/* A JWT-őr tesztjei. Ez a projekt legfontosabb biztonsági rétege: a régi app
   bárkit beengedett, aki mondott egy user-azonosítót — itt rögzítjük, hogy ez
   soha többé ne fordulhasson elő.

   A tesztek NEM igényelnek adatbázist: a Users modellt kicseréljük egy
   memóriabeli változatra, mielőtt az auth betöltené. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const request = require("supertest");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";

const newId = () => new mongoose.Types.ObjectId().toString();
const OWNER = newId();
const DELETED_USER = newId();

// A require-gyorsítótár kulcsa a feloldott elérési út — azt írjuk felül az
// auth betöltése ELŐTT, így az a mi példányunkat kapja.
const modelPath = require.resolve("../models/users");
let databaseDown = false;
/* A TÁROLT munkamenet-verzió. Azért változó, mert a visszavonás pontosan ezt
   mozgatja: a teszt megnöveli, és onnantól a korábban kiadott tokennek buknia
   kell. A szándékosan `undefined`-ra állítható érték a "két hiányzó érték"
   esetet szolgálja (l. lentebb). */
let storedVersion = 0;

require.cache[modelPath] = {
    id: modelPath, filename: modelPath, loaded: true,
    exports: {
        findById: async (id) => {
            if (databaseDown) throw new Error("kapcsolat megszakadt");
            return String(id) === OWNER ? {_id: OWNER, name: "anna", tokenVersion: storedVersion} : null;
        },
    },
};

const auth = require("./auth");

// Minimális app: az őr mögött egy végpont, ami visszamondja, kinek hisz.
const app = express();
app.use(express.json());
app.use(auth);
app.post("/", (request_, response) =>
    response.json({userId: request_.userId, tokenVersion: request_.tokenVersion}));

/* A `ver` alapértéke 0, mert a tárolt verzió is onnan indul: az alapeset az
   EGYEZÉS. Aki eltérőt akar (visszavont munkamenet), az kimondja. */
const tokenFor = (id, ver = 0) => jwt.sign({id, ver}, process.env.JWT_SECRET, {expiresIn: "7d"});

test("token nélkül elutasít (401)", async () => {
    const response = await request(app).post("/").send({});
    assert.strictEqual(response.status, 401);
});

test("hamis aláírású tokent elutasít (401)", async () => {
    const forged = jwt.sign({id: OWNER}, "rossz-titok");
    const response = await request(app).post("/").set("Cookie", "token=" + forged).send({});
    assert.strictEqual(response.status, 401);
});

test("lejárt tokent elutasít (401)", async () => {
    const expired = jwt.sign({id: OWNER}, process.env.JWT_SECRET, {expiresIn: "-1s"});
    const response = await request(app).post("/").set("Cookie", "token=" + expired).send({});
    assert.strictEqual(response.status, 401);
});

test("MÁS NEVŰ sütiben érkező, egyébként érvényes tokent nem fogad el (401)", async () => {
    /* A süti nevét pontosan illesztjük (tokenCookie.js). Ez itt annak az
       INTEGRÁCIÓS párja: nem elég, hogy a kiolvasó helyesen dönt — az őrnek is
       ugyanazt kell látnia, amit a kiadó oldal beállít. (A Bearer-fejléc korábbi
       tesztje ezen a helyen állt; az az út megszűnt, l. middleware/auth.js.) */
    const response = await request(app).post("/")
        .set("Cookie", "token_backup=" + tokenFor(OWNER)).send({});
    assert.strictEqual(response.status, 401);
});

test("érvényes tokent elfogad, és a TOKENBŐL veszi az azonosítót", async () => {
    const response = await request(app).post("/").set("Cookie", "token=" + tokenFor(OWNER)).send({});
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.userId, OWNER);
});

test("a body-ban küldött hamis user-mezőt FIGYELMEN KÍVÜL hagyja", async () => {
    // Ez a régi app fő gyengesége volt: elhitte, amit a kliens küldött.
    const response = await request(app)
        .post("/")
        .set("Cookie", "token=" + tokenFor(OWNER))
        .send({user: "HACKER"});
    assert.strictEqual(response.body.userId, OWNER, "a token identitása nyer, nem a body-é");
});

test("TÖRÖLT felhasználó érvényes tokenjét elutasítja (401)", async () => {
    /* Az aláírás rendben van — a fiók nincs meg. Az aláírás csak azt bizonyítja,
       hogy mi állítottuk ki a tokent, azt nem, hogy a fiók ma is létezik. */
    const response = await request(app).post("/").set("Cookie", "token=" + tokenFor(DELETED_USER)).send({});
    assert.strictEqual(response.status, 401);
});

test("formailag hibás azonosítójú tokent elutasít (401)", async () => {
    const response = await request(app).post("/").set("Cookie", "token=" + tokenFor("nem-objectid")).send({});
    assert.strictEqual(response.status, 401);
});

test("adatbázis-hibánál 503, NEM 401 — a hibától senki ne essen ki", async () => {
    databaseDown = true;
    const response = await request(app).post("/").set("Cookie", "token=" + tokenFor(OWNER)).send({});
    databaseDown = false;
    assert.strictEqual(response.status, 503,
        "a 401-re a kliens kijelentkeztet — egy múló adatbázishiba ne tegye ezt");
});

/* ------------------------------------------------------------------------
   MUNKAMENET-VISSZAVONÁS. Eddig a token a lejáratáig élt, és a /refresh minden
   érvényes tokenért frisset adott — vagyis egy ellopott tokent korlátlanul meg
   lehetett újítani, és semmivel nem lehetett kirúgni. Ezek a tesztek azt a
   kaput őrzik, ami ezt a láncot elvágja.
   ------------------------------------------------------------------------ */

test("VISSZAVONT munkamenet: a tárolt verzió magasabb a tokenénél (401)", async () => {
    /* Ez a kijelentkezés utáni állapot: a fiók verziója nőtt, a másik eszközön
       fekvő token viszont a régit hordozza. */
    storedVersion = 1;
    const response = await request(app).post("/").set("Cookie", "token=" + tokenFor(OWNER, 0)).send({});
    storedVersion = 0;
    assert.strictEqual(response.status, 401, "a visszavont munkamenet tokenje nem élhet tovább");
});

test("az ÚJ token a megnövelt verzióval továbbra is működik", async () => {
    /* A párja az előzőnek: a visszavonás a RÉGI tokeneket öli meg, nem a fiókot.
       Enélkül a fenti teszt akkor is zöld volna, ha az őr mindenkit kizárna. */
    storedVersion = 1;
    const response = await request(app).post("/").set("Cookie", "token=" + tokenFor(OWNER, 1)).send({});
    storedVersion = 0;
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.userId, OWNER);
});

test("a bevezetés ELŐTT kiadott, verzió nélküli tokent elutasítja (401)", async () => {
    /* A régi tokenekben nincs `ver`. Szándékosan nem engedjük át őket: az
       élesítés egyszeri kiléptetéssel jár, cserébe nem marad olyan munkamenet,
       amit ne lehetne visszavonni. */
    const legacy = jwt.sign({id: OWNER}, process.env.JWT_SECRET, {expiresIn: "7d"});
    const response = await request(app).post("/").set("Cookie", "token=" + legacy).send({});
    assert.strictEqual(response.status, 401);
});

test("KÉT HIÁNYZÓ ÉRTÉK NEM EGYEZÉS: ver nélküli token, verzió nélküli fiók (401)", async () => {
    /* A csapda, ami miatt a puszta `!==` összehasonlítás kevés: `undefined !==
       undefined` HAMIS, tehát egy régi token egy régi fiókhoz némán átcsúszna.
       Ezért kell a tokenből jövő értéknek SZÁMNAK is lennie. */
    storedVersion = undefined;
    const legacy = jwt.sign({id: OWNER}, process.env.JWT_SECRET, {expiresIn: "7d"});
    const response = await request(app).post("/").set("Cookie", "token=" + legacy).send({});
    storedVersion = 0;
    assert.strictEqual(response.status, 401,
        "két hiányzó érték egyenlősége nem bizonyít semmit — ez nem beengedés-ok");
});

test("a verziót TOVÁBBADJA a következő middleware-nek (a megújítás ebből dolgozik)", async () => {
    /* A /refresh ebből az értékből állítja ki a friss tokent. Ha nem kapná meg,
       a megújított token `ver` nélkül születne, és a KÖVETKEZŐ kérésnél léptetné
       ki a felhasználót — munka közben, ok nélkül. */
    storedVersion = 7;
    const response = await request(app).post("/").set("Cookie", "token=" + tokenFor(OWNER, 7)).send({});
    storedVersion = 0;
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.tokenVersion, 7);
});
