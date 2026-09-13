/* A BEJELENTKEZÉS, és benne a jelszó ÁTHASHELÉSE argon2id-re.

   Az algoritmus-váltás (bcrypt → argon2id) csak az ÚJ jelszavakra hatna magától: a
   régi hash a benne tárolt algoritmussal ellenőrződik tovább. Amíg ez így van, két
   baj él egyszerre — a régi jelszó nem kapja meg az argon2id memória-keménységét, és
   a kevert hashek miatt a bejelentkezés IDEJE felhasználónként eltérhet, ami épp azt
   a "létezik-e ez a fiók" szivárgást nyitja vissza, ami ellen az álca-hash van
   (l. password.js).

   Ezért az első sikeres belépés újraírja a hasht argon2id-re. Ennek az a
   természete, hogy NÉMÁN nem történik meg: a belépés akkor is működik, ha az
   áthashelés elmarad — a hiba csak hónapokkal később, egy időmérésen látszana.
   Innen a tesztek: nem azt nézik, hogy be lehet-e lépni, hanem hogy MI TÖRTÉNIK
   a tárolt hash-sel.

   Adatbázis nincs: a Users modellt a require.cache-ben cseréljük (a
   Quotes/readAuthors.test.js mintájára), és rögzítjük, mit mentett volna. */
const test = require("node:test");
const assert = require("node:assert");
const bcrypt = require("bcrypt");
const express = require("express");
const request = require("supertest");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";

const PASSWORD = "helyes-jelszo-123";
const USER_ID = "507f1f77bcf86cd799439011";

/* Amit a controller mentett volna: {_id, password}. Tesztenként ürítjük.

   A `tokenVersion` azért van a tárolt fiókokban, mert a kiadott token ezt is
   hordozza (token.js), és a kiállítás a hiányára SZÁNDÉKOSAN elhasal — így egy
   elfelejtett mező nem néma 401-ként jelentkezik a következő kérésnél, hanem
   itt, azonnal. */
const updates = [];
let storedUser = null;

const userModelPath = require.resolve("../../models/users");
require.cache[userModelPath] = {
    id: userModelPath, filename: userModelPath, loaded: true,
    exports: {
        findOne: async ({name}) => name === "teszt" ? storedUser : null,
        updateOne: async (filter, update) => {
            updates.push({filter, update});
            return {acknowledged: true};
        },
    },
};

const {hashPassword, verifyPassword} = require("../../password");
const login = require("./login");

const app = express();
app.use(express.json());
app.use("/login", login);
const post = (body) => request(app).post("/login").send(body);

/* Az áthashelés SZÁNDÉKOSAN nem várakoztatja a választ (a felhasználót egy
   karbantartó művelet ne lassítsa), tehát a mentés a válasz UTÁN fut le. A teszt
   ezért megvárja — de nem vakon alszik egy kitalált ideig, hanem addig figyel,
   amíg meg nem történik. A határidő csak azért van, hogy egy ELMARADÓ mentésnél
   ne fagyjon meg a teszt: ilyenkor üres marad a lista, és az állítás bukik. */
async function waitForUpdate(timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (updates.length === 0 && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 20));
}

/* A hash elkészítése a tesztben MÉRHETŐ időbe telik (az argon2id ~244 ms, a bcrypt
   ~245 ms ezen a gépen), ezért fixture-ként egyszer készítjük el mindkettőt. A
   `legacyHash` a RÉGI, bcrypt-tel tárolt fiókot mintázza (a migráció kiindulása),
   a `currentHash` a MAI, argon2id-vel tárolt fiókot. */
const legacyHash = bcrypt.hashSync(PASSWORD, 11);
let currentHash;
test.before(async () => { currentHash = await hashPassword(PASSWORD); });

test.beforeEach(() => {
    updates.length = 0;
    storedUser = {_id: USER_ID, password: legacyHash, tokenVersion: 0};
});

test("sikeres belépés RÉGI (bcrypt) hash-sel: a jelszó átáll argon2id-re", async () => {
    const response = await post({name: "teszt", password: PASSWORD});
    assert.strictEqual(response.status, 200, "a belépésnek sikerülnie kell");

    await waitForUpdate();

    assert.strictEqual(updates.length, 1, "a jelszót át kellett volna hashelni");
    assert.deepStrictEqual(updates[0].filter, {_id: USER_ID});
    const saved = updates[0].update.password;
    assert.ok(saved.startsWith("$argon2id$"),
        "az új hash NEM argon2id — az algoritmus-váltás elmaradt");
    assert.ok(await verifyPassword(saved, PASSWORD),
        "az új hash nem UGYANAHHOZ a jelszóhoz tartozik — a felhasználó kizárta volna magát");
    assert.notStrictEqual(saved, legacyHash);
});

test("a belépés VÁLASZÁT nem várakoztatja meg az áthashelés", async () => {
    /* A válasz akkor is megjön, ha a mentés még folyamatban van. Ha egyszer
       `await` kerülne elé, ez a teszt még átmenne — de a felhasználó minden ilyen
       belépésnél megvárná a hash idejét (a Pi-n ~245 ms). Ezért a mentés
       ELMARADÁSÁT is vizsgáljuk a válasz pillanatában. */
    const response = await post({name: "teszt", password: PASSWORD});

    assert.strictEqual(response.status, 200);
    assert.strictEqual(updates.length, 0,
        "a mentés már a válasz előtt lefutott — az áthashelés várakoztatja a felhasználót");

    /* MEGVÁRJUK a háttérben futó mentést, mielőtt a teszt véget ér. Enélkül az
       átcsordulna a KÖVETKEZŐ tesztbe: a beforeEach kiüríti a listát, aztán ez a
       még függőben lévő írás beleesne, és a következő teszt egy nem létező
       áthashelést látna. (Pontosan ez történt először: a "mai tényezőt nem írja
       újra" teszt bukott meg tőle.) */
    await waitForUpdate();
});

test("MAI (argon2id) hash-t nem ír újra (különben minden belépés fölöslegesen hashelne)", async () => {
    storedUser = {_id: USER_ID, password: currentHash, tokenVersion: 0};

    const response = await post({name: "teszt", password: PASSWORD});
    assert.strictEqual(response.status, 200);
    await waitForUpdate(300);

    assert.deepStrictEqual(updates, []);
});

test("ROSSZ jelszónál nem nyúl a tárolt hash-hez", async () => {
    /* Áthashelni csak akkor lehet, ha a nyílt jelszó bizonyítottan helyes. Egy
       rossz jelszavú kísérletből írni a fiókot azt jelentené, hogy egy támadó
       felülírhatja más jelszavát. */
    const response = await post({name: "teszt", password: "rossz-jelszo"});

    assert.strictEqual(response.status, 400);
    await waitForUpdate(300);
    assert.deepStrictEqual(updates, []);
});

test("ISMERETLEN névnél sem ír semmit (és ugyanazt a hibát adja)", async () => {
    const response = await post({name: "nincs-ilyen", password: PASSWORD});

    assert.strictEqual(response.status, 400);
    await waitForUpdate(300);
    assert.deepStrictEqual(updates, []);
});
