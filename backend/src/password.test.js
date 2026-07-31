/* A jelszó-tárolás két paraméterének ÖSSZETARTOZÁSA.

   Ez a teszt egy NÉMA biztonsági hibát őriz. Ha az álca-hash más költség-
   tényezővel készülne, mint a valódi jelszavak, a bejelentkezés két ága
   (ismeretlen név / létező név) mérhetően eltérő ideig futna — a támadó a
   válaszidőből megtudná, létezik-e egy fiók, hiába kap azonos hibaüzenetet.
   Semmi nem hibázna: a login működne, a teszt-suite zöld lenne, a szivárgás
   viszont visszanyílna.

   A bcrypt a költségtényezőt BELEÍRJA a hashbe, ezért utólag kiolvasható
   (getRounds) — így a kötés ellenőrizhető anélkül, hogy időt mérnénk (az
   időmérés amúgy is ingatag alap egy tesztben). */
const test = require("node:test");
const assert = require("node:assert");
const bcrypt = require("bcrypt");
const {SALT_WORK_FACTOR, DUMMY_HASH} = require("./password");

test("az álca-hash UGYANAZZAL a költségtényezővel készül, mint a valódi jelszavak", () => {
    assert.strictEqual(bcrypt.getRounds(DUMMY_HASH), SALT_WORK_FACTOR);
});

/* A tényező alsó korlátja nem ízlés kérdése: a bcrypt lassúsága maga a védelem.
   Ha valaki "gyorsításként" 4-re vinné (a bcrypt megengedi), a jelszavak offline
   törése nagyságrendekkel olcsóbb lenne — és semmi nem jelezne hibát. */
test("a költségtényező nem csökkenhet a mai szint alá", () => {
    assert.ok(SALT_WORK_FACTOR >= 10, `a költségtényező ${SALT_WORK_FACTOR}, elvárt legalább 10`);
});

/* Az álca-hash ÉRVÉNYES bcrypt-hash: a compare lefut rajta, és hamisat ad. Ha
   csak egy tetszőleges string lenne, a compare azonnal (számítás nélkül) térne
   vissza — az ismeretlen ág megint gyorsabb lenne a létezőnél. */
test("az álca-hash valódi bcrypt-hash: az összehasonlítás lefut rajta és hamis", async () => {
    assert.strictEqual(await bcrypt.compare("akarmi", DUMMY_HASH), false);
});
