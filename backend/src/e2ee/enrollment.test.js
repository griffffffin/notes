/* AZ E2EE-BEIRATKOZÁS szerver-oldali kezelésének tesztjei: a validáció (higiénia, nem
   kriptó), a bors átlátszó kör-bezárása, és — a lényeg — hogy a bors TÉNYLEG véd: a
   tárolt `wrappedMk` más bors-titokkal NEM nyitható. */

const test = require("node:test");
const assert = require("node:assert");

// A bors-titok a teszthez (32 bájt base64), mielőtt az enrollment.js betölti a pepper.js-t.
process.env.E2EE_PEPPER = process.env.E2EE_PEPPER || Buffer.alloc(32, 1).toString("base64");

const {validateEnrollment, enrollmentToStore, projectEnrollment} = require("./enrollment");

const validBody = () => ({
    wrappedMk: "e2ee1.YWJjZGVmZ2hpamts.bm9wcXJzdHV2d3h5ekFCQ0RFRkdISUpLTA==",
    kdfSalt: "c2FsdHNhbHRzYWx0c2E=", // 16 bájt base64
    kdf: {algorithm: "argon2id", memorySize: 65536, iterations: 3, parallelism: 1},
});

test("a jó alakú beiratkozás átmegy (null hiba)", () => {
    assert.strictEqual(validateEnrollment(validBody()), null);
});

test("hiányzó/hibás mezőket elutasít", () => {
    const bad = (mutate) => {
        const body = validBody();
        mutate(body);
        return validateEnrollment(body);
    };
    assert.notStrictEqual(bad((b) => { delete b.wrappedMk; }), null);
    assert.notStrictEqual(bad((b) => { b.wrappedMk = "x".repeat(300); }), null); // túl hosszú
    assert.notStrictEqual(bad((b) => { b.wrappedMk = 123; }), null);             // nem string
    assert.notStrictEqual(bad((b) => { delete b.kdfSalt; }), null);
    assert.notStrictEqual(bad((b) => { delete b.kdf; }), null);
    assert.notStrictEqual(bad((b) => { b.kdf.algorithm = "pbkdf2"; }), null);    // nem támogatott
    assert.notStrictEqual(bad((b) => { b.kdf.memorySize = 4; }), null);          // tartomány alatt
    assert.notStrictEqual(bad((b) => { b.kdf.memorySize = 2000000; }), null);    // tartomány fölött
    assert.notStrictEqual(bad((b) => { b.kdf.iterations = 0; }), null);
    assert.notStrictEqual(bad((b) => { b.kdf.iterations = 2.5; }), null);        // nem egész
    assert.notStrictEqual(bad((b) => { b.kdf.parallelism = 99; }), null);
});

test("a bors köre bezárul: tárolt alakból ugyanaz a wrappedMk jön vissza", () => {
    const stored = enrollmentToStore(validBody());
    const out = projectEnrollment(stored);

    assert.strictEqual(out.wrappedMk, validBody().wrappedMk);
    assert.strictEqual(out.kdfSalt, validBody().kdfSalt);
    assert.deepStrictEqual(out.kdf, validBody().kdf);
});

test("a TÁROLT wrappedMk borsozott — nem a nyers érték", () => {
    const stored = enrollmentToStore(validBody());

    assert.notStrictEqual(stored.wrappedMk, validBody().wrappedMk);
    assert.ok(stored.wrappedMk.startsWith("pepper1."));
    // A nyers wrappedMk NINCS benne olvashatóan a tárolt (borsozott) alakban.
    assert.ok(!stored.wrappedMk.includes(validBody().wrappedMk));
});

test("MÁSIK bors-titokkal a tárolt wrappedMk NEM nyitható (a bors tényleg véd)", () => {
    const original = process.env.E2EE_PEPPER;
    try {
        process.env.E2EE_PEPPER = Buffer.alloc(32, 1).toString("base64");
        const stored = enrollmentToStore(validBody());

        // Egy kiszivárgott dumpot elképzelve: a támadónak MÁS (vagy semmilyen) bors-titka van.
        process.env.E2EE_PEPPER = Buffer.alloc(32, 2).toString("base64");
        assert.throws(() => projectEnrollment(stored));
    } finally {
        process.env.E2EE_PEPPER = original;
    }
});

test("a be nem iratkozott (régi) fiókra null — nincs mit feloldani", () => {
    assert.strictEqual(projectEnrollment({name: "regi"}), null);
    assert.strictEqual(projectEnrollment({wrappedMk: "x"}), null); // kdf nélkül nem beiratkozott
});
