/* A JELSZÓ-TÁROLÁS: az argon2id hashelés, az algoritmus-független ellenőrzés
   (a migráció alatt bcrypt is), és az álca-hash szerkezeti kötése.

   Több NÉMA biztonsági hibát is ez a fájl őriz. A legfontosabb: ha az álca-hash
   más PARAMÉTERREL készülne, mint a valódi jelszavak, a bejelentkezés két ága
   (ismeretlen név / létező név) mérhetően eltérő ideig futna — a támadó a
   válaszidőből megtudná, létezik-e egy fiók, hiába kap azonos hibaüzenetet. Semmi
   nem hibázna: a login működne, a suite zöld lenne, a szivárgás visszanyílna.

   Az argon2 a paramétereket (m/t/p) BELEÍRJA a hashbe, ezért utólag kiolvasható —
   így a kötés ellenőrizhető anélkül, hogy időt mérnénk (az időmérés amúgy is
   ingatag alap egy tesztben). */
const test = require("node:test");
const assert = require("node:assert");
const bcrypt = require("bcrypt");
const {hashPassword, verifyPassword, needsRehash, dummyHashPromise} = require("./password");

/* Az argon2-hash kódolt paraméterei: `$argon2id$v=19$m=47104,p=1,t=1$só$hash`.
   A hármast SORREND-FÜGGETLENÜL olvassuk ki (a könyvtár m,p,t sorrendben ír, de
   erre nem építünk), onnan, ahová maga a könyvtár írta. */
function argonParams(hash) {
    const m = /[$,]m=(\d+)/.exec(hash);
    const t = /[$,]t=(\d+)/.exec(hash);
    const p = /[$,]p=(\d+)/.exec(hash);
    assert.ok(m && t && p, `nem argon2-hash vagy hiányos m/t/p: ${hash}`);
    return {m: Number(m[1]), t: Number(t[1]), p: Number(p[1])};
}

test("az álca-hash UGYANAZOKKAL a paraméterekkel készül, mint a valódi jelszavak", async () => {
    const dummy = await dummyHashPromise;
    const real = await hashPassword("egy-eleg-hosszu-teszt-jelszo-Aa1");
    assert.deepStrictEqual(argonParams(dummy), argonParams(real),
        "az álca-hash és a valódi hash paraméterei eltérnek — visszanyílt az időzítés-szivárgás");
});

/* A paraméterek alsó korlátja nem ízlés kérdése: a memória-keménység maga a
   védelem. Ha valaki „gyorsításként" a memóriát a töredékére vinné, a jelszavak
   offline törése nagyságrendekkel olcsóbb lenne — és semmi nem jelezne hibát.

   ALSÓ KORLÁT, NEM EGYENLŐSÉG. Egyenlőséggel a szám két helyen élne (itt és a
   password.js-ben), és minden hangoláskor a tesztet is át kellene írni — az ilyen
   „kézzel szinkronizált másolat" előbb-utóbb elcsúszik. Alsó korláttal a HANGOLÁS
   szabadon megy fölfelé, a gyengítés viszont hangosan bukik. A korlát az OWASP
   argon2id-minimuma (19 MiB, t=1), a mai beállításunk (46 MiB, t=1) e fölött van. */
test("a paraméterek nem eshetnek az OWASP-minimum alá", async () => {
    const {m, t} = argonParams(await dummyHashPromise);
    assert.ok(m >= 19456, `a memória ${m} KiB, elvárt legalább 19456 (19 MiB)`);
    assert.ok(t >= 1, `az iteráció ${t}, elvárt legalább 1`);
});

test("az álca-hash valódi argon2id-hash: az ellenőrzés lefut rajta és hamis", async () => {
    const dummy = await dummyHashPromise;
    assert.ok(dummy.startsWith("$argon2id$"), "az álca-hash nem argon2id");
    assert.strictEqual(await verifyPassword(dummy, "akarmi"), false);
});

test("hashPassword argon2id-t ad, amit a verifyPassword elfogad", async () => {
    const password = "helyes-jelszo-Aa1";
    const hash = await hashPassword(password);
    assert.ok(hash.startsWith("$argon2id$"), "a hashPassword nem argon2id-t adott");
    assert.strictEqual(await verifyPassword(hash, password), true);
    assert.strictEqual(await verifyPassword(hash, "rossz"), false);
});

/* A MIGRÁCIÓ ága: a verifyPassword a RÉGI, bcrypt-tel készült hasheket is ellenőrzi.
   Enélkül minden meglévő fiók némán kizárná magát az algoritmus-váltás pillanatában. */
test("a verifyPassword a régi bcrypt-hasht is elfogadja (migráció)", async () => {
    const password = "regi-fiok-jelszo-Aa1";
    const bcryptHash = bcrypt.hashSync(password, 11);
    assert.strictEqual(await verifyPassword(bcryptHash, password), true);
    assert.strictEqual(await verifyPassword(bcryptHash, "rossz"), false);
});

test("needsRehash: a bcrypt-hasht át kell hashelni, a friss argon2id-t nem", async () => {
    assert.strictEqual(needsRehash(bcrypt.hashSync("x", 11)), true,
        "a régi bcrypt-hasht argon2id-re kell állítani");
    assert.strictEqual(needsRehash(await hashPassword("y")), false,
        "a mai beállítású argon2id-hasht fölösleges újrahashelni");
    assert.strictEqual(needsRehash(await dummyHashPromise), false,
        "az álca-hash a mai beállítással készült, nem szorul rehashre");
});
