/* A SORSZÁM-ELLENŐRZÉS SZABÁLYA — adatbázis nélkül.

   A szkript maga csak olvas és jelent; a döntés, hogy MI a sérülés, ebben az egy
   tiszta függvényben él. Két különböző bajt kell megkülönböztetnie, mert a
   súlyuk és a javításuk is más: az ÜTKÖZÉS (két elem ugyanazon a helyen) a
   rendezést teszi kiszámíthatatlanná, a HÉZAG csak esztétikai. */
const test = require("node:test");
const assert = require("node:assert");
const {problemsFor} = require("./check-ordering");

test("hézag- és ütközésmentes lista: nincs baj", () => {
    assert.deepStrictEqual(problemsFor([1, 2, 3, 4]), {duplicates: [], hasGap: false});
});

test("a sorrend nem számít — a HALMAZ számít", () => {
    // A find() sorrendje nem garantált; a szabály a sorszámok halmazáról szól.
    assert.deepStrictEqual(problemsFor([3, 1, 4, 2]), {duplicates: [], hasGap: false});
});

test("üres lista ép (új felhasználó)", () => {
    assert.deepStrictEqual(problemsFor([]), {duplicates: [], hasGap: false});
});

test("ÜTKÖZÉST jelent, és megnevezi a sorszámot", () => {
    /* Ez a mért kár alakja: két azonos create párhuzamosan [1,2,2,4,5,6,7]-et
       hagyott maga után (l. controllers/createOnce.js). */
    const {duplicates} = problemsFor([1, 2, 2, 4, 5, 6, 7]);

    assert.deepStrictEqual(duplicates, [2]);
});

test("ütközésnél a hézagot NEM minősíti (előbb az ütközést kell rendezni)", () => {
    assert.strictEqual(problemsFor([1, 2, 2, 4]).hasGap, null);
});

test("HÉZAGOT jelent, ha nem 1-től folytonos", () => {
    assert.strictEqual(problemsFor([1, 2, 4]).hasGap, true);
    assert.strictEqual(problemsFor([2, 3, 4]).hasGap, true, "nem 1-től indul");
});

test("többszörös ütközést mindegyik sorszámmal jelent, egyszer", () => {
    const {duplicates} = problemsFor([1, 1, 1, 3, 3]);

    assert.deepStrictEqual(duplicates, [1, 3]);
});
