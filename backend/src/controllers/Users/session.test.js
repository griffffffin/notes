/* HOGYAN KAP ÉS VESZÍT MUNKAMENETET A KLIENS — a süti-szerződés egy helyen.

   Ezek a tesztek egy MÉRT rést zárnak be. A bejelentkezés válaszának alakját
   (token a törzsben → név a törzsben, token a sütiben) át lehetett írni úgy, hogy
   a teljes backend-csomag zöld maradt: a login tesztjei a jelszó-áthashelésről
   szólnak, és a válasz TÖRZSÉRE egyetlen állítás sem vonatkozott. Márpedig ez a
   csomaghatár — a frontend ebből tudja meg, hogy be van lépve.

   A LEGFONTOSABB ÁLLÍTÁS AZ, AMI NINCS: a tokennek NEM szabad a válasz törzsében
   lennie. Ha egyszer visszakerülne (egy "kényelmi" mezőként, hibakereséshez, vagy
   mert valaki a régi klienst akarja kiszolgálni), a JavaScript megint hozzáférne,
   és a HttpOnly süti egész haszna elveszne — némán, hiszen minden működne
   tovább. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const request = require("supertest");
const {userStub} = require("../../test/authStub");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";

const USER_ID = new mongoose.Types.ObjectId().toString();
const NAME = "anna";
const PASSWORD = "Jelszo123";

let storedUser = null;

const modelPath = require.resolve("../../models/users");
require.cache[modelPath] = {
    id: modelPath, filename: modelPath, loaded: true,
    exports: {
        findOne: async ({name}) => (name === NAME ? storedUser : null),
        /* A NÉV ITT SZÁMÍT, ezért írjuk felül a segéd alapértelmezését: a /me
           válasza pontosan ezt adja vissza, tehát ha a stub "teszt" nevet adna, a
           teszt önmagával lenne konzisztens, a valósággal nem. */
        findById: async (id) => (String(id) === USER_ID ? {...userStub(USER_ID), name: NAME} : null),
        updateOne: async () => ({matchedCount: 1}),
    },
};

const auth = require("../../middleware/auth");
const login = require("./login");
const me = require("./me");
const refresh = require("./refresh");
const logout = require("./logout");

const app = express();
app.use(express.json());
app.use("/login", login);
app.use(auth);
app.use("/me", me);
app.use("/refresh", refresh);
app.use("/logout", logout);

test.before(async () => {
    storedUser = {_id: USER_ID, name: NAME, password: await bcrypt.hash(PASSWORD, 11), tokenVersion: 0};
});

/* A Set-Cookie fejléc EGY sütijére bontva. A supertest tömböt ad (több süti is
   jöhet), ezért nevet keresünk benne — nem az első elemet vesszük. */
const tokenCookie = (response) =>
    (response.headers["set-cookie"] ?? []).find((cookie) => cookie.startsWith("token="));

const signIn = () => request(app).post("/login").send({name: NAME, password: PASSWORD});

test("a belépés SÜTIBEN adja a tokent, a törzsben csak a nevet", async () => {
    const response = await signIn();

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body, {name: NAME},
        "a törzs pontosan a nevet adja — se többet, se mást");
    assert.ok(tokenCookie(response), "a tokennek sütiben kell megérkeznie");
});

test("a válasz TÖRZSE nem tartalmaz JWT-t sehol", async () => {
    /* Nem a mezőnevet nézzük, hanem az ALAKOT: egy három részből álló, pontokkal
       tagolt base64url szöveg. Így egy "token", "jwt", "accessToken" vagy bármi
       máshogy nevezett mező is elbukna — a lényeg nem a név, hanem hogy a
       JavaScript kezébe kerül-e a munkamenet. */
    const response = await signIn();

    const jwtShape = /[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;
    assert.ok(!jwtShape.test(JSON.stringify(response.body)),
        "a token visszakerült a válasz törzsébe: innentől a JS is látja, és a HttpOnly süti hiába van");
});

test("a süti httpOnly, SameSite=Strict, az egész appra szól, és lejárat nélküli", async () => {
    const response = await signIn();
    const cookie = tokenCookie(response);

    assert.match(cookie, /HttpOnly/i, "a JavaScript nem olvashatja");
    assert.match(cookie, /SameSite=Strict/i, "idegen oldalról indult kéréshez ne csatolja a böngésző");
    assert.match(cookie, /Path=\//i);
    assert.ok(!/Expires=|Max-Age=/i.test(cookie),
        "munkamenet-süti: a böngésző bezárásakor tűnjön el");
});

test("HTTP-n NINCS Secure jelző — különben a süti ki sem íródna", async () => {
    /* Ma sima HTTP-n szolgálunk ki (a VPN titkosít, de a böngésző nem tud róla).
       A `secure` a kérés protokolljához igazodik, tehát HTTPS-re váltva magától
       bekapcsol — ez a teszt a MAI állapotot rögzíti, és a HTTPS-menetben
       szándékosan meg fog bukni, jelezve, hogy át kell írni. */
    const response = await signIn();

    assert.ok(!/;\s*Secure/i.test(tokenCookie(response)));
});

test("a /me a sütiből ismeri fel a felhasználót", async () => {
    const cookie = tokenCookie(await signIn());

    const response = await request(app).post("/me").set("Cookie", cookie).send({});

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body, {name: NAME});
});

test("a /me süti NÉLKÜL 401 — ebből tudja a felület, hogy nincs munkamenet", async () => {
    const response = await request(app).post("/me").send({});

    assert.strictEqual(response.status, 401);
});

test("a megújítás FRISS sütit ad, szintén httpOnly-t", async () => {
    const cookie = tokenCookie(await signIn());

    const response = await request(app).post("/refresh").set("Cookie", cookie).send({});

    assert.strictEqual(response.status, 200);
    assert.match(tokenCookie(response), /HttpOnly/i, "a megújított token is maradjon a JS elől elzárva");
});

test("a kijelentkezés TÖRLI a sütit", async () => {
    /* A verzió növelése önmagában érvényteleníti a tokent, de ha a süti a
       böngészőben maradna, minden további kérés vinné magával — és 401-et kapna.
       A törlés ugyanazokkal a jelzőkkel megy, mint a kiadás; eltérő path-szal a
       böngésző NÉMÁN nem törölne semmit. */
    const cookie = tokenCookie(await signIn());

    const response = await request(app).post("/logout").set("Cookie", cookie).send({});

    assert.strictEqual(response.status, 200);
    const cleared = tokenCookie(response);
    assert.ok(cleared, "a válasznak törlő Set-Cookie-t kell hoznia");
    assert.match(cleared, /Expires=Thu, 01 Jan 1970|Max-Age=0/i, "a süti azonnal járjon le");
    assert.match(cleared, /Path=\//i, "eltérő path-szal a törlés némán hatástalan volna");
});
