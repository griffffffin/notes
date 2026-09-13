/* A GYAKORI-JELSZÓ-LISTA modul tesztjei.

   Két dolgot őrzünk: (1) a lista tényleg felismeri a gyakori jelszót, kis-/
   nagybetűtől függetlenül, és nem ad hamis találatot; (2) a NÉMA LEMONDÁS elleni
   kapu — ha a fájl majdnem üres, a betöltés HANGOSAN dob, nem enged át csendben
   mindent. A második eset a fontosabb: enélkül a védelem a lista bármely
   megsérülésekor észrevétlenül kikapcsolna. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {isCommonPassword, loadCommonPasswords, MIN_EXPECTED} = require("./commonPasswords");

test("felismeri a listán szereplő jelszót, kis-/nagybetűtől függetlenül", () => {
    /* A „trustno1” a lista eleji, ismert bejegyzés. A create.js a bemenetet
       kisbetűsítve keresi, tehát a „Trustno1” és a „TRUSTNO1” is találat kell
       legyen — különben a nagybetűsítéssel meg lehetne kerülni a tiltást. */
    assert.strictEqual(isCommonPassword("trustno1"), true);
    assert.strictEqual(isCommonPassword("Trustno1"), true);
    assert.strictEqual(isCommonPassword("TRUSTNO1"), true);
});

test("NEM ad hamis találatot egy egyedi jelszóra (kontroll)", () => {
    /* Kontroll: e nélkül a fenti „igaz” attól is jöhetne, hogy a modul MINDENRE
       igazat ad (pl. üres bemenetre, vagy egy elrontott `has`-ra). */
    assert.strictEqual(isCommonPassword("Str0ngUnique9"), false);
    assert.strictEqual(isCommonPassword("zqxjkw37"), false);
});

test("a KAPU: majdnem üres lista betöltése HANGOSAN dob, nem enged át csendben", () => {
    /* A néma lemondás a legveszélyesebb hiba: egy csonka fájllal a Set kicsi
       lenne, és az `isCommonPassword` mindig hamisat adna — a védelem eltűnne
       egyetlen jel nélkül. A modul ezért a küszöb (MIN_EXPECTED) alatt dob. */
    const tempFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "common-pw-")), "tiny.txt");
    fs.writeFileSync(tempFile, "Password1\nWelcome1\n");   // két sor, jóval a küszöb alatt

    assert.throws(() => loadCommonPasswords(tempFile), /bejegyzést adott/,
        `a ${MIN_EXPECTED} alatti lista betöltésének hibát kell dobnia, nem csendben elfogadnia`);
});

test("a valódi lista betöltődik, és bőven a küszöb fölött van", () => {
    /* A tényleges, repóban tárolt lista összeáll (a fenti kapu tehát az ÉLES úton
       nem sül el). Nem pontos darabszámra állítunk — az a karbantartáskor
       változhat —, csak arra, hogy a küszöb fölött van. */
    const passwords = loadCommonPasswords();
    assert.ok(passwords.size >= MIN_EXPECTED,
        `a valódi lista csak ${passwords.size} bejegyzést adott (küszöb: ${MIN_EXPECTED})`);
});
