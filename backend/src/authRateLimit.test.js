/* A HITELESÍTÉSI VÉGPONTOK KÉRÉS-KORLÁTOZÁSA — a VALÓDI routeren.

   Miért külön fájl: a korlátozó modul-szintű állapotot tart (hívónként számol), a
   teszt pedig szándékosan KIMERÍTI az ablakot. A `node --test` minden tesztFÁJLT
   külön folyamatban futtat, tehát itt tiszta lappal indulunk, és nem terheljük rá
   a fogyasztást más tesztekre.

   Miért a routeren át: a rateLimit saját tesztje (middleware/rateLimit.test.js) a
   MECHANIZMUST méri. Az, hogy a /login és a /user/create elé oda is van KÖTVE,
   külön tény — és az elvesztése néma: a bejelentkezés ugyanúgy működne, csak
   korlátlanul lehetne próbálgatni. MÉRVE (2026-08-18): a kötés kivétele a
   routes.js-ből e teszt nélkül a teljes backend sort zölden hagyta.

   ÜRES TÖRZZSEL kérünk. A korlátozó a validátor ELŐTT áll, tehát a 400-as
   elutasítás is fogyaszt a keretből — így a teszt nem hívja a bcryptet, és
   ezredmásodpercek alatt lefut. Ez egyben azt is bizonyítja, amit a routes.js
   komment kimond: a SIKERTELEN próbálkozás is számít. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const request = require("supertest");

process.env.JWT_SECRET = process.env.JWT_SECRET || "teszt-titok";
const routes = require("./routes");

const app = express();
app.use(express.json());
app.use(routes);

/* Addig kérünk, amíg 429-et nem kapunk (de legfeljebb `attempts`-szer). Nem
   darabszámra állítunk: a keret értéke a routes.js döntése, ezt a tesztet nem
   szabad minden hangoláskor átírni. Amit állítunk: a korlát LÉTEZIK, és a
   jogos használatnak elég tág. */
async function untilBlocked(path, attempts) {
    const statuses = [];
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        const response = await request(app).post(path).send({});
        statuses.push(response.status);
        if (response.status === 429) break;
    }
    return statuses;
}

test("a /login korlátozva van (előbb-utóbb 429), de nem szűkebben pár próbálkozásnál", async () => {
    const statuses = await untilBlocked("/login", 40);

    assert.ok(statuses.includes(429),
        "negyven kísérlet után sem jött 429 — a rateLimit nincs bekötve a /login elé");
    /* A másik irány: egy elgépelt jelszó után ne zárjuk ki magunkat. Öt
       próbálkozásnak minden körülmények között át kell mennie. */
    assert.ok(statuses.filter((status) => status !== 429).length >= 5,
        `a /login már ${statuses.length}. kísérletre kizárt — ez a jogos használatot is akadályozza`);
});

test("a 429 mellé Retry-After megy (a kliens tudja, mikor próbálja újra)", async () => {
    const blocked = await request(app).post("/login").send({});

    assert.strictEqual(blocked.status, 429, "az előző teszt már kimerítette az ablakot");
    assert.match(blocked.headers["retry-after"], /^\d+$/);
    assert.ok(Number(blocked.headers["retry-after"]) > 0);
});

test("a /user/create is korlátozva van, a loginnál SZŰKEBBEN", async () => {
    const statuses = await untilBlocked("/user/create", 40);

    assert.ok(statuses.includes(429),
        "negyven kísérlet után sem jött 429 — a rateLimit nincs bekötve a /user/create elé");
    /* A regisztráció ritka művelet: a kerete szándékosan szűkebb a loginénál. Ha
       ez megfordulna, az azt jelentené, hogy valaki felcserélte a beállításokat. */
    assert.ok(statuses.length < 20,
        `a regisztráció kerete (${statuses.length}) nem szűkebb a loginénál — felcserélt beállítás?`);
});

/* (A korábbi „publikus /quotes/id korlátozva van" teszt MEGSZŰNT az egyetlen auth
   ELŐTTI olvasó végponttal együtt: az E2EE-átállás után nincs publikus idézet-nézet.
   A publikus megosztás a külön menetben, a Shared táblára épül — az ottani publikus
   végpont rate-limit tesztje ott születik meg.) */

test("a KORLÁTOZÁS NEM ÉRINTI a többi végpontot (nem globális)", async () => {
    /* Kontroll: ha a korlátozó véletlenül útvonal NÉLKÜL kerülne a routerbe
       (`router.use(rateLimit(…))`), MINDENT korlátozna — és a fenti tesztek
       ettől is zöldek lennének. Egy védett végpont a kimerített ablak után is a
       maga 401-ét adja, nem 429-et. */
    const response = await request(app).post("/to-dos").send({});

    assert.strictEqual(response.status, 401,
        "a hitelesítési korlátozó más végpontra is ráterült — útvonal nélkül van bekötve?");
});
