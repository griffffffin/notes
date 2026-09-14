/* AZ ÍRÁS-VÉGPONTOK FIÓK-ALAPÚ KÉRÉS-KORLÁTOZÁSA — a VALÓDI routeren.

   Miért külön fájl: a korlátozó modul-szintű állapotot tart (fiókonként számol),
   a teszt pedig szándékosan KIMERÍTI a vödröket. A `node --test` minden
   tesztFÁJLT külön folyamatban futtat, tehát itt tiszta lappal indulunk, és nem
   terheljük rá a fogyasztást más tesztekre. Fiókonként EGY vödör: minden teszt
   SAJÁT user-azonosítót használ, hogy a korábbi teszt kimerítése ne szivárogjon
   át.

   Miért a routeren át: a rateLimit saját tesztje (middleware/rateLimit.test.js) a
   MECHANIZMUST méri. Az, hogy a create/update/delete/reorder elé oda is van
   KÖTVE — és pontosan a helyes vödörrel —, külön tény, és az elvesztése NÉMA: az
   írás ugyanúgy működne, csak korlátlanul lehetne floodolni. (Ugyanez a minta
   fogta meg a login/regisztráció bekötését — l. authRateLimit.test.js.)

   Miért kell hozzá token: ezek a végpontok az `auth` MÖGÖTT vannak, token nélkül
   az auth 401-ez, mielőtt a limiterhez érne. Ezért a böngésző útján (HttpOnly
   süti) hitelesítünk, a produkciós kiállítóval aláírt tokennel (test/authStub),
   és a `Users.findById`-t egy kész válaszra cseréljük, hogy az auth
   létezés-ellenőrzése DB nélkül átmenjen (l. endpointContract.test.js).

   ÜRES TÖRZZSEL kérünk: a limiter a validátor ELŐTT áll, tehát a 400-as elutasítás
   is fogyaszt a keretből — így a teszt nem ér adatbázist, és ezredmásodpercek
   alatt lefut. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const request = require("supertest");
const mongoose = require("mongoose");
const {userStub, sessionCookieFor} = require("./test/authStub");

process.env.JWT_SECRET = process.env.JWT_SECRET || "teszt-titok";

/* Adatbázis nincs. A rövid puffer-határidő miatt a DB-t érintő (olvasó) kontroll
   azonnal 500-zal elszáll a 10 másodperces alap-várakozás helyett — nekünk pont
   ennyi kell, hiszen a kérdés csak az, hogy NEM 429-et kap. */
mongoose.set("bufferTimeoutMS", 50);

/* A felhasználó létezés-ellenőrzésének megkerülése: bármely id-hez egy hozzá illő
   stubot adunk, így a per-fiók tokenek (A, B, …) mind átmennek az authon, és a
   limiter a userId-ra kulcsolhat. A csere a routes betöltése ELŐTT történik. */
const Users = require("./models/users");
Users.findById = async (id) => userStub(id);

const routes = require("./routes");

const app = express();
app.use(express.json());
app.use(routes);

/* Külön, valódi ObjectId minden teszthez — külön vödör, nincs átszivárgás. */
const USER = {
    writeBucket: "507f1f77bcf86cd799439011",
    sharedBucket: "507f1f77bcf86cd799439012",
    reorderSeparate: "507f1f77bcf86cd799439013",
    writeWidth: "507f1f77bcf86cd799439014",
    reorderWidth: "507f1f77bcf86cd799439015",
    isolationVictim: "507f1f77bcf86cd799439016",
    isolationBystander: "507f1f77bcf86cd799439017",
};

/* Addig kérünk egy fiók nevében, amíg 429-et nem kapunk (de legfeljebb
   `attempts`-szer). Nem darabszámra állítunk: a keret értéke a routes.js döntése,
   ezt a tesztet nem szabad minden hangoláskor átírni. */
async function untilBlocked(path, userId, attempts) {
    const cookie = sessionCookieFor(userId);
    const statuses = [];
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        const response = await request(app).post(path).set("Cookie", cookie).send({});
        statuses.push(response.status);
        if (response.status === 429) break;
    }
    return statuses;
}

const passed = (statuses) => statuses.filter((status) => status !== 429).length;

test("az írás-műveletek korlátozva vannak (előbb-utóbb 429), de a jogos használatnak tág", async () => {
    const statuses = await untilBlocked("/to-dos/create", USER.writeBucket, 200);

    assert.ok(statuses.includes(429),
        "200 create után sem jött 429 — a writeRateLimit nincs bekötve a /to-dos/create elé");
    /* A másik irány: egy aktív szerkesztés jó néhány mentése menjen át. Harmincnak
       minden körülmények között (a keret ennél jóval bőségesebb). */
    assert.ok(passed(statuses) >= 30,
        `a create már ${statuses.length}. kérésre kizárt — ez a jogos használatot is akadályozza`);
});

test("a create/update/delete EGY KÖZÖS vödörben van, fiókonként, szekciókon át", async () => {
    /* Ugyanaz a fiók: a create-tel kimerített keretből az idézet-DELETE-nek sem
       szabad maradnia — egy limiter-példány áll mind a hat írás-route-on. */
    const statuses = await untilBlocked("/to-dos/create", USER.sharedBucket, 200);
    assert.ok(statuses.includes(429), "a create nem merítette ki a vödröt — előfeltétel");

    const otherWrite = await request(app).post("/quotes/delete")
        .set("Cookie", sessionCookieFor(USER.sharedBucket)).send({});
    assert.strictEqual(otherWrite.status, 429,
        "a kimerített írás-keret után a /quotes/delete átment — nem közös a vödör (külön példány route-onként?)");
});

test("a reorder KÜLÖN vödör (a kimerített írás-keret nem érinti)", async () => {
    /* Merítsük ki a fiók ÍRÁS-keretét, majd húzzunk vele: ha a reorder ugyanabban
       a vödörben volna, itt 429-et kapnánk. A 400 (üres törzs) azt bizonyítja,
       hogy a kérés eljutott a végponthoz, és a reorder-keret még bőven áll. */
    const statuses = await untilBlocked("/to-dos/create", USER.reorderSeparate, 200);
    assert.ok(statuses.includes(429), "a create nem merítette ki a vödröt — előfeltétel");

    const reorder = await request(app).post("/to-dos/reorder")
        .set("Cookie", sessionCookieFor(USER.reorderSeparate)).send({});
    assert.notStrictEqual(reorder.status, 429,
        "a kimerített ÍRÁS-keret a reordert is blokkolta — a reorder rossz vödörben van (writeRateLimit?)");
});

test("a reorder kerete TÁGABB, mint az írásé", async () => {
    /* Relatív állítás (nem darabszám): mindkettőt kimerítjük külön fiókkal, és a
       reorder TÖBB kérést enged át, mielőtt zárna. Ha a kettő ugyanaz a vödör
       (vagy felcserélt keret) volna, ez a viszony megfordulna vagy eltűnne. */
    const writeStatuses = await untilBlocked("/to-dos/create", USER.writeWidth, 200);
    const reorderStatuses = await untilBlocked("/to-dos/reorder", USER.reorderWidth, 400);

    assert.ok(writeStatuses.includes(429) && reorderStatuses.includes(429),
        "valamelyik keret nem merült ki — az attempts-et emelni kell");
    assert.ok(passed(reorderStatuses) > passed(writeStatuses),
        `a reorder kerete (${passed(reorderStatuses)}) nem tágabb az írásénál (${passed(writeStatuses)}) — ` +
        "felcserélt vagy közös vödör?");
});

test("a korlát FIÓKONKÉNTI (nem globális, nem IP): egy fiók kimerülése nem zárja ki a másikat", async () => {
    const statuses = await untilBlocked("/to-dos/create", USER.isolationVictim, 200);
    assert.ok(statuses.includes(429), "az áldozat-fiók nem merült ki — előfeltétel");

    /* Ugyanaz a folyamat, ugyanaz az IP — CSAK a fiók más. Ha a kulcs az IP (vagy
       nincs kulcs, azaz globális) volna, ez a kérés is 429 lenne. */
    const bystander = await request(app).post("/to-dos/create")
        .set("Cookie", sessionCookieFor(USER.isolationBystander)).send({});
    assert.notStrictEqual(bystander.status, 429,
        "egy MÁSIK fiók is 429-et kapott a szomszéd kimerülése után — a korlát nem fiók-, hanem IP/globális kulcsú");
});

test("a 429 mellé Retry-After megy (a kliens tudja, mikor próbálja újra)", async () => {
    /* Az izolációs teszt fiókja már kimerült; egy újabb kérés vele 429-et ad. */
    const blocked = await request(app).post("/to-dos/create")
        .set("Cookie", sessionCookieFor(USER.isolationVictim)).send({});

    assert.strictEqual(blocked.status, 429, "az előfeltétel-fiók kerete nem maradt kimerítve");
    assert.match(blocked.headers["retry-after"], /^\d+$/);
    assert.ok(Number(blocked.headers["retry-after"]) > 0);
});

test("a korlát NEM ÉRINTI az OLVASÓ végpontokat (csak az írásra van kötve)", async () => {
    /* Kontroll: ha a limiter véletlenül a routerre általánosan kerülne, az olvasást
       is fogná. Merítsük ki a fiók írás-keretét, majd olvassunk vele: DB nincs, így
       500 jön (rövid puffer-határidő) — a lényeg, hogy NEM 429. */
    const statuses = await untilBlocked("/to-dos/create", "507f1f77bcf86cd799439018", 200);
    assert.ok(statuses.includes(429), "az írás-keret nem merült ki — előfeltétel");

    const read = await request(app).post("/to-dos")
        .set("Cookie", sessionCookieFor("507f1f77bcf86cd799439018")).send({});
    assert.notStrictEqual(read.status, 429,
        "a kimerített írás-keret után az OLVASÁS is 429 — a limiter általánosan, nem csak az írásra van bekötve");
});
