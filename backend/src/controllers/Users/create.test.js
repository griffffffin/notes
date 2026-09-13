/* A REGISZTRÁCIÓ JELSZÓ-ERŐSSÉG ELLENŐRZÉSEI.

   A formai szabályt (PASSWORD_RULE) a frontendContract.test.js már a kliens
   oldalával egyezésre őrzi; itt a formán TÚLI védelmek a tét: a gyakori jelszó és
   a névvel egyező jelszó elutasítása. Ezek NÉMÁN tűnnének el (a regisztráció
   ugyanúgy működne, csak gyenge jelszót is elfogadna), ezért mindegyikhez saját,
   izolált eset jár — a mutáció-próba szerint az adott ág kivételére pontosan a
   hozzá tartozó teszt bukjon.

   Adatbázis nincs: a Users modellt a require.cache-ben cseréljük (a login.test.js
   mintájára). A gyenge-jelszó ágak a bcrypt és a mentés ELŐTT ütnek, tehát azok a
   mockot nem is érintik; a mock a sikeres úthoz kell. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const request = require("supertest");

process.env.JWT_SECRET = process.env.JWT_SECRET || "teszt-titok-csak-a-teszthez";

const USER_ID = "507f1f77bcf86cd799439011";
let saved = null;

/* A Users itt KONSTRUKTOR (a create.js `new Users({…}).save()`-et hív). A save a
   mentett dokumentumot adja vissza, a tokenVersionnel együtt — a token kiállítása
   annak hiányára szándékosan elhasal (token.js), tehát a mock a valóságot tükrözi. */
const userModelPath = require.resolve("../../models/users");
function FakeUser(doc) {
    this.name = doc.name;
    this.password = doc.password;
}
FakeUser.prototype.save = async function save() {
    saved = {_id: USER_ID, name: this.name, password: this.password, tokenVersion: 0};
    return saved;
};
require.cache[userModelPath] = {
    id: userModelPath, filename: userModelPath, loaded: true, exports: FakeUser,
};

const create = require("./create");

const app = express();
app.use(express.json());
app.use(create);

const register = (name, password) => request(app).post("/").send({name, password});

/* A `saved` modul-szintű, tesztek közt osztott — tesztenként nullázzuk, különben
   egy (esetleg mutáció miatt) mentő eset elszennyezné a következő `saved === null`
   állítását, és a mutáció-próba rossz tesztet buktatna. */
test.beforeEach(() => { saved = null; });

test("a formailag rossz jelszó 400 (a formai szabály őre — kontroll)", async () => {
    /* Kontroll: ez a régi, formai kapu. Ha ez elromlana, a lenti 422-es esetek
       „zöldje" attól is jöhetne, hogy már a formánál elakad — ezért mérjük külön. */
    const response = await register("valakiuj", "rovid");
    assert.strictEqual(response.status, 400);
});

test("a GYAKORI jelszó 422-t kap (a listán szereplő, formailag jó jelszó)", async () => {
    /* A „Trustno1" formailag szabályos (kis+nagy+szám, 8 kar), de kisbetűsítve
       („trustno1") rajta van a gyakori-jelszó-listán. A név MÁS, hogy tisztán a
       lista-ág süljön el, ne a névegyezés. */
    const response = await register("egyedinev", "Trustno1");
    assert.strictEqual(response.status, 422,
        "a gyakori jelszót át kellett volna dobni 422-vel (commonPasswords ág)");
    assert.strictEqual(saved, null, "gyakori jelszóra nem szabad fiókot menteni");
});

test("a NÉVVEL EGYEZŐ jelszó 422-t kap (akkor is, ha nincs a listán)", async () => {
    /* A „Zqxjkw37” formailag jó és NINCS a listán (ellenőrizve) — így ha ez 422,
       az kizárólag a névegyezés-ág műve. Kis-/nagybetűtől függetlenül egyeznie kell. */
    const response = await register("Zqxjkw37", "zQXJKW37");
    assert.strictEqual(response.status, 422,
        "a névvel (kis-/nagybetűtől függetlenül) egyező jelszót 422-vel kell dobni");
    assert.strictEqual(saved, null, "névvel egyező jelszóra nem szabad fiókot menteni");
});

test("az egyedi, erős jelszó SIKERES (elmenti a fiókot, a nevet adja vissza)", async () => {
    /* „Str0ngUnique9”: formailag jó, nincs a listán, nem egyezik a névvel — át kell
       jutnia. Ez egyben a fenti tiltások kontrollja: bizonyítja, hogy nem MINDENT
       utasítunk el (a 422-k nem egy elgépelt, mindig igaz feltételből jönnek). */
    const response = await register("uniqueuser", "Str0ngUnique9");

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body, {name: "uniqueuser"});
    assert.strictEqual(saved.name, "uniqueuser", "a fiókot el kellett volna menteni");
});
