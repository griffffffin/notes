/* A BEIRATKOZÁS-EXPORT (exportEnrollment.js) HÁLÓJA. Két dolgot bizonyít:

   1. SZIVÁRGÁS-KAPU: a mentésbe kerülő rekord PONTOSAN a három beiratkozás-mező, és a
      `password` (hash) meg a `draftKey` (a piszkozat-titok) SOHA nem szivárog bele. Ez a
      szerver-vakság session.test.js-ének a mintája: alakra illesztünk, nem remélünk.
   2. KÖR B↔F2: a kivett rekord a decrypt-export.js BEMENETE — egy user-dokumentumból
      készült rekord + a JELSZÓ visszaadja a mesterkulcsot. Ez köti B kimenetét F2
      bemenetéhez (kétoldali szerződés); ha a mezőnevek elcsúsznának, ez pirosra váltana. */
const test = require("node:test");
const assert = require("node:assert");
const {enrollmentRecord} = require("./exportEnrollment");
const {recoverMasterKey} = require("./decrypt-export");
const {sealWithPepper} = require("../src/e2ee/pepper");
const GOLDEN = require("./goldenVector.fixture");

// 32 bájt base64 bors-titok a borsozott rekordhoz.
const TEST_PEPPER = Buffer.alloc(32, 7).toString("base64");

/* Egy TELJES user-dokumentum, a titkokkal EGYÜTT — ezt kapja a napi export a DB-ből
   (`findById(...).lean()`), és ebből kell a rekordnak KIZÁRÓLAG a három mezőt kivennie.
   A `wrappedMk` itt borsozott ("pepper1…"), ahogy a szerver tárolja. */
function fullUserDoc(pepperedWrappedMk) {
    return {
        _id: "u-owner",
        name: "owner",
        password: "$2b$11$THIS_IS_A_BCRYPT_HASH_NEVER_EXPORT",
        draftKey: "DRAFT_SECRET_NEVER_EXPORT",
        tokenVersion: 3,
        wrappedMk: pepperedWrappedMk,
        kdfSalt: GOLDEN.kdfSalt,
        kdf: {algorithm: "argon2id", memorySize: 8192, iterations: 1, parallelism: 1, secretExtra: 99},
        createdAt: "2026-01-01T00:00:00.000Z",
    };
}

test("SZIVÁRGÁS-KAPU: a rekord PONTOSAN a három mező, titok nélkül", () => {
    process.env.E2EE_PEPPER = TEST_PEPPER;
    let record;
    try {
        record = enrollmentRecord(fullUserDoc(sealWithPepper(GOLDEN.wrappedMk)));
    } finally {
        delete process.env.E2EE_PEPPER;
    }
    // Felső szint: pontosan wrappedMk, kdfSalt, kdf — semmi más.
    assert.deepStrictEqual(Object.keys(record).sort(), ["kdf", "kdfSalt", "wrappedMk"]);
    // A kdf: pontosan a négy KDF-paraméter — a becsempészett `secretExtra` kiesik.
    assert.deepStrictEqual(Object.keys(record.kdf).sort(),
        ["algorithm", "iterations", "memorySize", "parallelism"]);
    // Alakra illesztve: a jelszó-hash és a draftKey SEHOL a sorosított rekordban.
    const serialized = JSON.stringify(record);
    assert.ok(!serialized.includes("BCRYPT_HASH"), "a jelszó-hash nem szivároghat a mentésbe");
    assert.ok(!serialized.includes("DRAFT_SECRET"), "a draftKey nem szivároghat a mentésbe");
    assert.ok(!serialized.includes("tokenVersion"));
    assert.ok(!serialized.includes("secretExtra"));
});

test("a borsozott wrappedMk NYERSEN (pepper1…) kerül a rekordba — nem szedjük le itt a borsot", () => {
    process.env.E2EE_PEPPER = TEST_PEPPER;
    try {
        const peppered = sealWithPepper(GOLDEN.wrappedMk);
        const record = enrollmentRecord(fullUserDoc(peppered));
        assert.strictEqual(record.wrappedMk, peppered);
        assert.ok(record.wrappedMk.startsWith("pepper1."));
    } finally {
        delete process.env.E2EE_PEPPER;
    }
});

test("nincs beiratkozva (nincs wrappedMk vagy kdf) → null, nincs félkész fájl", () => {
    assert.strictEqual(enrollmentRecord({name: "régi", password: "x"}), null);
    assert.strictEqual(enrollmentRecord({name: "fél", wrappedMk: "pepper1.a.b"}), null); // nincs kdf
    assert.strictEqual(enrollmentRecord(null), null);
    assert.strictEqual(enrollmentRecord(undefined), null);
});

test("KÖR B↔F2: a kivett rekord + a jelszó visszaadja a mesterkulcsot", async () => {
    process.env.E2EE_PEPPER = TEST_PEPPER;
    try {
        // A napi export így látná a fiókot (borsozott wrappedMk), a rekord ezt viszi a mentésbe…
        const record = enrollmentRecord(fullUserDoc(sealWithPepper(GOLDEN.wrappedMk)));
        // …és a decrypt-export ebből + a jelszóból nyeri vissza az MK-t (a borsot maga szedi le).
        const masterKey = await recoverMasterKey(record, GOLDEN.password);
        assert.strictEqual(Buffer.from(masterKey).toString("base64"), GOLDEN.mkBase64);
    } finally {
        delete process.env.E2EE_PEPPER;
    }
});
