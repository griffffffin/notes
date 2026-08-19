/* A BEJELENTKEZÉS, és benne a jelszó ÁTHASHELÉSE.

   A költségtényező emelése (10 → 11) csak az ÚJ jelszavakra hatna: a bcrypt a
   tényezőt a hashbe írja, a régi hash tehát a régivel ellenőrződik tovább. Amíg
   ez így van, két baj él egyszerre — a régi jelszó nem kapja meg a védelmet, és
   a kevert tényezők miatt a bejelentkezés IDEJE felhasználónként eltér, ami épp
   azt a "létezik-e ez a fiók" szivárgást nyitja vissza, ami ellen az álca-hash
   van (l. password.js).

   Ezért az első sikeres belépés újraírja a hasht. Ennek az egésznek az a
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
const OLD_FACTOR = 9;              // "régi" tényező: bármi, ami nem a mai
const USER_ID = "507f1f77bcf86cd799439011";

// Amit a controller mentett volna: {_id, password}. Tesztenként ürítjük.
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

const {SALT_WORK_FACTOR} = require("../../password");
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

/* A hash elkészítése a tesztben MÉRHETŐ időbe telik (a 11-es tényező ~245 ms
   ezen a gépen), ezért fixture-ként egyszer készítjük el mindkettőt. */
const oldHash = bcrypt.hashSync(PASSWORD, OLD_FACTOR);
const currentHash = bcrypt.hashSync(PASSWORD, SALT_WORK_FACTOR);

test.beforeEach(() => {
    updates.length = 0;
    storedUser = {_id: USER_ID, password: oldHash};
});

test("sikeres belépés RÉGI tényezőjű hash-sel: a jelszó átáll a maira", async () => {
    const response = await post({name: "teszt", password: PASSWORD});
    assert.strictEqual(response.status, 200, "a belépésnek sikerülnie kell");

    await waitForUpdate();

    assert.strictEqual(updates.length, 1, "a jelszót át kellett volna hashelni");
    assert.deepStrictEqual(updates[0].filter, {_id: USER_ID});
    const saved = updates[0].update.password;
    assert.strictEqual(bcrypt.getRounds(saved), SALT_WORK_FACTOR,
        "az új hash NEM a mai költségtényezővel készült");
    assert.ok(await bcrypt.compare(PASSWORD, saved),
        "az új hash nem UGYANAHHOZ a jelszóhoz tartozik — a felhasználó kizárta volna magát");
    assert.notStrictEqual(saved, oldHash);
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

test("MAI tényezőjű hash-t nem ír újra (különben minden belépés fölöslegesen hashelne)", async () => {
    storedUser = {_id: USER_ID, password: currentHash};

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
