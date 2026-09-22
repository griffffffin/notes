/* A MENTÉS-VISSZAFEJTŐ (decrypt-export.js) HÁLÓJA — a kör-teszt, ami a „vissza lehet
   állítani"-t TÉNNYÉ teszi (E2EE.md 7., [[offline-restorable-backups]]).

   A teszt szíve a GOLDEN-VEKTOR: egy VALÓDI frontend e2ee-kóddal (deriveKek + wrapMasterKey
   + encryptContent) legyártott, befagyasztott minta. Azért így, mert a szkript és a frontend
   AES-GCM-/Argon2id-formátuma KÉTOLDALI KÖTÉS (CLAUDE.md 1.): ha csak a szkript titkosítana
   és a szkript fejtene, az önmagával konzisztens maradna akkor is, ha közben mindkét oldal
   elcsúszott a klienstől. A frontend-eredetű vektor ezt kizárja — a recoverMasterKey a
   frontend által KÉSZÍTETT wrappedMk-ból pontosan a frontend MK-ját nyeri vissza (bájtra),
   és a frontend `ciphertext`-jét a frontend nyílt tartalmára fejti.

   A vektort egy ideiglenes frontend-teszt írta ki 2026-09-22-én (a frontend/src/e2ee/
   mappában futott, majd törölve). Kis KDF-paraméterek (m=8 MiB, t=1) a sebességért — a
   helyesség független a paraméter nagyságától. Új vektor kell, ha az aead.ts, a masterKey.ts
   vagy a content.ts formátuma SZÁNDÉKOSAN változik (akkor a régi minta joggal bukik: az a dolga).

   A CLI jelszó-beolvasását (readPassword, interaktív TTY/stdin) NEM teszteljük itt: a mag
   (decryptExport) közvetlenül a jelszó-sztringgel dolgozik, az I/O a CLI kézi próbája. */
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const {
    decryptExport, recoverMasterKey, decryptDocument,
    openEnvelope, aadFor, deriveKek, deriveSection, parseArgs,
} = require("./decrypt-export");
const {sealWithPepper} = require("../src/e2ee/pepper");

/* A BEFAGYASZTOTT GOLDEN-VEKTOR — a frontend kódja termelte (l. a fenti fejléc), külön
   fixtúra-modulban, hogy a beiratkozás-export kör-tesztje is UGYANEZT a mintát használhassa
   (egy forrás). A `wrappedMk`/`ciphertext` a kliens BORSTALANÍTOTT "e2ee1…" alakja; a borsozott
   utat a tesztek sealWithPepper-rel maguk állítják elő. */
const GOLDEN = require("./goldenVector.fixture");

// A beiratkozás (borstalanított) és egy mentés-dokumentum a golden-vektorból.
const goldenEnrollment = () => ({wrappedMk: GOLDEN.wrappedMk, kdfSalt: GOLDEN.kdfSalt, kdf: {...GOLDEN.kdf}});
const goldenDoc = (overrides = {}) => ({
    _id: GOLDEN.id, user: "u1", ciphertext: GOLDEN.ciphertext,
    order: 1, updatedAt: "2026-09-22T10:00:00.000Z", __v: 0, ...overrides,
});

// Két KÜLÖNBÖZŐ bors-titok a borsozott úthoz (32 bájt base64).
const PEPPER_A = Buffer.alloc(32, 7).toString("base64");
const PEPPER_B = Buffer.alloc(32, 9).toString("base64");

/* Független AES-256-GCM titkosító a szkript node:crypto-oldalától FÜGGETLENÜL — a több-
   dokumentumos teszthez, hogy a szkript `openEnvelope`-ja egy MÁSHOL épített borítékot is
   megnyisson (nem csak a golden-vektort). A "e2ee1"-formátum: iv, majd ciphertext||címke. */
function sealWithNodeCrypto(key, plaintext, aad) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    if (aad !== undefined) cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
    const blob = Buffer.concat([ciphertext, cipher.getAuthTag()]);
    return ["e2ee1", iv.toString("base64"), blob.toString("base64")].join(".");
}

test("KÖR: valódi frontend-boríték → szkript → ugyanaz a tartalom", async () => {
    const [doc] = await decryptExport({
        documents: [goldenDoc()], enrollment: goldenEnrollment(),
        password: GOLDEN.password, section: "quotes",
    });
    // A tartalmi mezők visszajöttek, pontosan.
    assert.strictEqual(doc.quote, GOLDEN.content.quote);
    assert.strictEqual(doc.author, GOLDEN.content.author);
    assert.strictEqual(doc.fontSize, GOLDEN.content.fontSize);
    assert.strictEqual(doc.createdAt, GOLDEN.content.createdAt);
    // A szerkezeti mezők változatlanok, a ciphertext eltűnt.
    assert.strictEqual(doc._id, GOLDEN.id);
    assert.strictEqual(doc.user, "u1");
    assert.strictEqual(doc.order, 1);
    assert.strictEqual(doc.updatedAt, "2026-09-22T10:00:00.000Z");
    assert.ok(!("ciphertext" in doc), "a ciphertext mező nem maradhat a kimenetben");
});

test("a visszanyert MK BÁJTRA a frontend által használt mesterkulcs (hash-wasm Node==böngésző)", async () => {
    // Ez köti a szkript Argon2id-jét a frontendéhez: azonos könyvtár + paraméter → azonos KEK
    // → a frontend wrappedMk-ja pontosan a frontend MK-jára csomagolódik ki.
    const masterKey = await recoverMasterKey(goldenEnrollment(), GOLDEN.password);
    assert.strictEqual(Buffer.from(masterKey).toString("base64"), GOLDEN.mkBase64);
});

test("BORSOZOTT wrappedMk: a szkript leszedi a borsot (openWithPepper) és feloldja", async () => {
    process.env.E2EE_PEPPER = PEPPER_A;
    try {
        // A tárolt alak: a kliens "e2ee1…" wrappedMk-ja szerver-oldalon borsozva → "pepper1…".
        const peppered = sealWithPepper(GOLDEN.wrappedMk);
        assert.ok(peppered.startsWith("pepper1."), "a borsozott alak pepper1-előtagú");
        const enrollment = {...goldenEnrollment(), wrappedMk: peppered};
        const [doc] = await decryptExport({
            documents: [goldenDoc()], enrollment, password: GOLDEN.password, section: "quotes",
        });
        assert.strictEqual(doc.quote, GOLDEN.content.quote);
    } finally {
        delete process.env.E2EE_PEPPER;
    }
});

test("ROSSZ JELSZÓ: DOB, nincs fél-eredmény", async () => {
    await assert.rejects(decryptExport({
        documents: [goldenDoc()], enrollment: goldenEnrollment(),
        password: "rossz jelszó", section: "quotes",
    }));
});

test("SWAP-VÉDELEM: a blob más _id alá téve DOB (AAD = section|_id kötés)", async () => {
    // Mutáció-próba az aadFor id-részére: ha kimaradna, ez a teszt NEM bukna.
    const wrongIdDoc = goldenDoc({_id: "aaaaaaaaaaaaaaaaaaaaaaaa"});
    await assert.rejects(decryptExport({
        documents: [wrongIdDoc], enrollment: goldenEnrollment(),
        password: GOLDEN.password, section: "quotes",
    }));
});

test("SWAP-VÉDELEM: rossz szekció-címkével DOB (AAD section-része)", async () => {
    // Mutáció-próba az aadFor section-részére.
    await assert.rejects(decryptExport({
        documents: [goldenDoc()], enrollment: goldenEnrollment(),
        password: GOLDEN.password, section: "movies",
    }));
});

test("ROSSZ BORS: a borsozott wrappedMk másik borssal nem oldható fel", async () => {
    process.env.E2EE_PEPPER = PEPPER_A;
    const peppered = sealWithPepper(GOLDEN.wrappedMk);
    process.env.E2EE_PEPPER = PEPPER_B;   // másik bors
    try {
        await assert.rejects(recoverMasterKey({...goldenEnrollment(), wrappedMk: peppered}, GOLDEN.password));
    } finally {
        delete process.env.E2EE_PEPPER;
    }
});

test("TÖBB dokumentum: mind visszafejtődik, a névtelen idézet is", async () => {
    const masterKey = Buffer.from(GOLDEN.mkBase64, "base64");
    const id2 = "5eb7cf5a86d9755df3a6c593";
    // Névtelen idézet (nincs author) — a mentésből SEMMI nem zárhat ki elemet
    // ([[backup-unconditional-and-export-word]]); a visszafejtésnek is át kell engednie.
    const content2 = {quote: "Második idézet.", fontSize: 20, createdAt: "2026-01-01T00:00:00.000Z"};
    const doc2 = {
        _id: id2, user: "u1",
        ciphertext: sealWithNodeCrypto(masterKey, JSON.stringify(content2), aadFor("quotes", id2)),
        order: 2, updatedAt: "2026-01-01T00:00:00.000Z", __v: 0,
    };
    const output = await decryptExport({
        documents: [goldenDoc(), doc2], enrollment: goldenEnrollment(),
        password: GOLDEN.password, section: "quotes",
    });
    assert.strictEqual(output.length, 2);
    assert.strictEqual(output[0].quote, GOLDEN.content.quote);
    assert.strictEqual(output[1].quote, "Második idézet.");
    assert.strictEqual(output[1].author, undefined);
    assert.strictEqual(output[1].order, 2);
});

test("openEnvelope: hibás formátum/alak DOB (formátum- és hossz-őr)", () => {
    const masterKey = Buffer.from(GOLDEN.mkBase64, "base64");
    assert.throws(() => openEnvelope(masterKey, "nemazenyem.AAAA.BBBB"));   // rossz formátum-jelölő
    assert.throws(() => openEnvelope(masterKey, "e2ee1.csak-két-rész"));    // nem 3 rész
    assert.throws(() => openEnvelope(masterKey, "e2ee1.AA.BB"));            // túl rövid IV/blob
});

test("decryptDocument: hiányzó ciphertext mező DOB", () => {
    const masterKey = Buffer.from(GOLDEN.mkBase64, "base64");
    assert.throws(() => decryptDocument(masterKey, "quotes", {_id: "x", order: 1}));
});

test("deriveKek: nem támogatott algoritmusra DOB", async () => {
    await assert.rejects(deriveKek("x", Buffer.alloc(16), {
        algorithm: "pbkdf2", memorySize: 8192, iterations: 1, parallelism: 1,
    }));
});

test("deriveSection: a fájlnévből a szekció, dátum-utótag levágva", () => {
    assert.strictEqual(deriveSection("quotes-2026-09-22.json"), "quotes");
    assert.strictEqual(deriveSection("to-dos-2026-01-05.json"), "to-dos");   // a belső kötőjel nem zavar
    assert.throws(() => deriveSection("valami.json"));                       // nincs dátum → nem található ki
});

test("parseArgs: pozicionális mentés-fájl + kapcsolók", () => {
    const options = parseArgs(["quotes-2026-09-22.json", "--enrollment", "e.json", "--section", "quotes", "--out", "out.json"]);
    assert.strictEqual(options.backupPath, "quotes-2026-09-22.json");
    assert.strictEqual(options.enrollmentPath, "e.json");
    assert.strictEqual(options.section, "quotes");
    assert.strictEqual(options.outPath, "out.json");
});

test("parseArgs: hiányzó mentés-fájl vagy beiratkozás DOB", () => {
    assert.throws(() => parseArgs(["--enrollment", "e.json"]));   // nincs pozicionális mentés-fájl
    assert.throws(() => parseArgs(["quotes.json"]));              // nincs --enrollment
});
