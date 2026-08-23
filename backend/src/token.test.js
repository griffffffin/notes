/* A TOKEN-KIÁLLÍTÓ TESZTJEI.

   Egyetlen rövid függvény, de két állítást hordoz, és mindkettő biztonsági
   következménnyel jár: mi kerül a tokenbe, és mi történik, ha valaki hiányosan
   hívja. A második a fontosabb — az az ág, ami MEGAKADÁLYOZZA, hogy néma hibát
   adjunk ki a kezünkből. */
const test = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";
const {signToken} = require("./token");

const ID = "507f1f77bcf86cd799439011";

test("a token az azonosítót ÉS a munkamenet-verziót is hordozza", () => {
    const payload = jwt.verify(signToken(ID, 3), process.env.JWT_SECRET);

    assert.strictEqual(payload.id, ID);
    assert.strictEqual(payload.ver, 3,
        "a `ver` nélkül az auth nem tudná összevetni a tárolt verzióval — " +
        "a visszavonás egésze ezen a mezőn áll");
});

test("verzió NÉLKÜL hangosan elhasal, nem ad ki hiányos tokent", () => {
    /* Ez a teszt a hiba HELYÉT rögzíti. Enélkül egy elfelejtett második
       paraméter `ver: undefined`-ot írna a tokenbe; azt az auth elutasítaná,
       tehát a felhasználó sikeresen belépne, majd az első kérésnél kirepülne —
       ok és üzenet nélkül, egy olyan hibától, amit a bejelentkezés követett el. */
    assert.throws(() => signToken(ID), TypeError);
});

test("a SZÁMNAK látszó szöveget sem fogadja el", () => {
    /* A "0" és a 0 az auth szigorú összehasonlításában két különböző érték: egy
       string verzióval kiadott token minden kérésnél 401-et kapna. */
    assert.throws(() => signToken(ID, "0"), TypeError);
});

test("a nulladik verzió ÉRVÉNYES érték, nem hiányzó", () => {
    /* Csapda: a 0 hamis értékű. Egy `if (!tokenVersion) throw` alakú ellenőrzés
       épp az ALAPESETET utasítaná el — minden frissen regisztrált felhasználót,
       akinek a verziója még 0. Ezért néz a kód típust, nem igazságértéket. */
    const payload = jwt.verify(signToken(ID, 0), process.env.JWT_SECRET);

    assert.strictEqual(payload.ver, 0);
});
