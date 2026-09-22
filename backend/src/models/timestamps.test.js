/* Az IDŐBÉLYEGEK szabálya: minden modellnek KÖTELEZŐ, magától nem üresedő
   updatedAt-je van.

   Miért kap ez saját hálót? Mert a napi export (backend/scripts/daily-export.js)
   az updatedAt-ből dönti el, volt-e aznap módosítás. Egy hiányzó időbélyeg nem
   okoz hibát sehol: a szkript lefut, csak épp NEM ír fájlt — egy nap csendben
   kimarad a mentésből, és ez csak akkor derül ki, amikor visszaállítani kellene.

   A createdAt viszont MÁR NEM egységes: a to-dónál nyílt, KÖTELEZŐ oszlop, az
   idézetnél az E2EE-átállással a TITKOSÍTOTT tartalmi blobba költözött (a kliens
   állítja, l. models/quotes.js) — a szervernek nincs is createdAt oszlopa. Ezért a
   createdAt-ellenőrzés modellenkénti (`hasCreatedAt`); az updatedAt mindkettőnél él.

   A validáció adatbázis NÉLKÜL fut (validateSync), tehát ez a teszt gyors és
   független a kapcsolattól. Új szekció felvételekor a modelljét ide kell írni. */
const test = require("node:test");
const assert = require("node:assert");
const Todos = require("./todos");
const Quotes = require("./quotes");

/* Érvényes törzs szekciónként — csak annyi mező, amennyi a séma required-jeit
   kielégíti —, plusz hogy VAN-e nyílt createdAt oszlopa (a to-dónak igen, az
   idézetnek az E2EE óta nincs: a blobban van). */
const MODELS = [
    ["Todos", Todos, {user: "u1", title: "Cím", category: "otthon", color: "warning", order: 1, percentage: 0}, true],
    ["Quotes", Quotes, {user: "u1", ciphertext: "e2ee1.iv.ct", order: 1}, false],
];

for (const [name, Model, body, hasCreatedAt] of MODELS) {
    test(`${name}: az időbélyegek magukra állnak be, ha nem adjuk meg őket`, () => {
        const document = new Model(body);

        assert.strictEqual(document.validateSync(), undefined);
        assert.ok(document.updatedAt instanceof Date);
        // A createdAt csak ott, ahol nyílt oszlop (l. a fájl eleji indoklást).
        if (hasCreatedAt) assert.ok(document.createdAt instanceof Date);
    });

    test(`${name}: az updatedAt KIÜRÍTÉSE érvénytelen (a napi export erre épül)`, () => {
        const document = new Model({...body, updatedAt: null});

        const error = document.validateSync();
        assert.ok(error, "a null updatedAt-et a sémának el kell utasítania");
        assert.ok(error.errors.updatedAt, "a hibának az updatedAt mezőre kell mutatnia");
    });

    if (hasCreatedAt) test(`${name}: a createdAt kiürítése is érvénytelen`, () => {
        const document = new Model({...body, createdAt: null});

        assert.ok(document.validateSync()?.errors.createdAt);
    });
}
