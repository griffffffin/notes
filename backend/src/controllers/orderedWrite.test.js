/* AZ ELTOLÁS → ÍRÁS PÁR VISSZAVÉTELE — adatbázis nélkül.

   Amit itt számon kérünk, az egyetlen kérdés: ha a MÁSODIK lépés elbukik,
   visszakerül-e az első? Ez nem versenyhelyzet (azt a userLock.js zárja ki),
   hanem az egyetlen kérésen belüli félbemaradás — és a kár ugyanaz: két elem
   ugyanazon a sorszámon, vagy hézag. Némán, mert a válasz csak annyit mond, hogy
   a művelet nem sikerült. */
const test = require("node:test");
const assert = require("node:assert");
const {shiftThenWrite} = require("./orderedWrite");

const steps = () => {
    const log = [];
    return {
        log,
        shift: () => { log.push("eltolás"); return Promise.resolve(); },
        write: () => { log.push("írás"); return Promise.resolve("kész"); },
        undo: () => { log.push("visszavétel"); return Promise.resolve(); },
    };
};

test("sikeres írásnál NINCS visszavétel, és az eredmény a hívóé", async () => {
    const s = steps();

    const result = await shiftThenWrite(s);

    assert.strictEqual(result, "kész");
    assert.deepStrictEqual(s.log, ["eltolás", "írás"]);
});

test("elbukott írás után VISSZAVESZI az eltolást", async () => {
    const s = steps();
    s.write = () => { s.log.push("írás"); return Promise.reject(new Error("adatbázis")); };

    await assert.rejects(shiftThenWrite(s), {message: "adatbázis"});

    assert.deepStrictEqual(s.log, ["eltolás", "írás", "visszavétel"]);
});

test("az EREDETI hiba megy tovább, nem a visszavételé", async () => {
    /* Ha a visszavétel hibája nyerne, a napló arról szólna, ami MÁSODIK bukott el
       — és elfedné azt, ami a bajt okozta. Több eszközünk úgysincs: a lista ekkor
       sérült marad, de legalább az derül ki, miért. */
    const s = steps();
    s.write = () => Promise.reject(new Error("az igazi ok"));
    s.undo = () => Promise.reject(new Error("a visszavétel is elszállt"));

    await assert.rejects(shiftThenWrite(s), {message: "az igazi ok"});
});

test("ha az ELTOLÁS bukik el, nincs mit visszavenni", async () => {
    // Az írás el sem indult: a lista érintetlen, a visszavétel csak zavarna.
    const s = steps();
    s.shift = () => { s.log.push("eltolás"); return Promise.reject(new Error("eltolás bukott")); };

    await assert.rejects(shiftThenWrite(s), {message: "eltolás bukott"});

    assert.deepStrictEqual(s.log, ["eltolás"]);
});
