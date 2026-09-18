/* A KLIENS SZERZŐDÉS-HIBÁJÁT FOGADÓ VÉGPONT tesztjei.

   Három dolgot kell bizonyítani, és mindhárom külön hibalehetőség:
     (1) a jó jelentés BEKERÜL a naplóba (különben a végpont csak látszatra van);
     (2) a rossz bemenet NEM kerül be (napló-hamisítás, méret);
     (3) a végpont a VALÓDI routerben is korlátozva van (a wiring-hiba néma:
         a végpont működne, csak épp korlátlanul).

   A naplózást úgy vizsgáljuk, hogy a `console.error`-t lecseréljük egy gyűjtőre —
   nem elég a 204-et megnézni, mert az akkor is jönne, ha a napló-sor elmaradna. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const request = require("supertest");

const validateClientError = require("../middleware/validateClientError");
const clientError = require("./clientError");
const {STDERR_PRIORITY} = require("../log");

const app = express();
app.use(express.json());
/* `use`, nem `post`: a controller maga egy Router (a projekt mintája), azt pedig
   mountolni kell — egy `app.post(…, router)` alatt a belső "/" útvonal nem
   illeszkedne, és 404 jönne. Ugyanígy köti be a routes.js is. */
app.use("/client-error", validateClientError, clientError);
const post = (body) => request(app).post("/client-error").send(body);

/* A naplósorok gyűjtése egy hívás idejére. A visszaállítás `finally`-ben megy:
   ha egy állítás megbukik, a console.error akkor se maradjon kicserélve — a
   következő tesztek hibaüzenetei különben eltűnnének. */
async function captureLog(action) {
    const original = console.error;
    const lines = [];
    console.error = (...args) => lines.push(args.join(" "));
    try {
        await action();
    } finally {
        console.error = original;
    }
    return lines;
}

test("érvényes jelentés: 204, és a napló megkapja a végpont kulcsát", async () => {
    let status = 0;
    const lines = await captureLog(async () => {
        status = (await post({endpoint: "/quotes"})).status;
    });

    assert.strictEqual(status, 204);
    assert.strictEqual(lines.length, 1, "pontosan egy naplósor várt");
    assert.match(lines[0], /Kliens-szerződés hiba: \/quotes$/);
    // A sor a systemd err-prefixszel kezdődik (logProblem → console.error), és
    // KÖZVETLENÜL utána az időbélyeg — az adja meg, mikor romlott el.
    assert.ok(lines[0].startsWith(STDERR_PRIORITY), "a sor a systemd err-prefixszel kezdődik");
    assert.match(lines[0].slice(STDERR_PRIORITY.length), /^\[\d{4}-\d{2}-\d{2}T/);
});

test("a válasz TÖRZSE üres (204 No Content)", async () => {
    /* A jelentés "tűz és felejtsd el": a kliensnek nincs mit kezdenie a
       válasszal, tehát nem is adunk neki tartalmat. */
    let response;
    await captureLog(async () => { response = await post({endpoint: "/to-dos"}); });

    assert.strictEqual(response.status, 204);
    assert.strictEqual(response.text, "");
    assert.deepStrictEqual(response.body, {});
});

test("hiányzó vagy nem szöveg típusú kulcsot elutasít (400)", async () => {
    assert.strictEqual((await post({})).status, 400);
    assert.strictEqual((await post({endpoint: 42})).status, 400);
    assert.strictEqual((await post({endpoint: {$ne: null}})).status, 400);
    assert.strictEqual((await post({endpoint: ["/quotes"]})).status, 400);
});

test("SORTÖRÉST tartalmazó kulcsot elutasít — napló-hamisítás ellen (400)", async () => {
    /* Ez a mező a szerver naplójába megy. Egy sortöréssel a hívó ÚJ naplósort
       tudna íratni, azaz tetszőleges bejegyzést költhetne — a napló mint
       bizonyíték elértéktelenedne. Ezért nem escape-elünk utólag, hanem előbb
       szűkítünk. */
    const lines = await captureLog(async () => {
        const response = await post({endpoint: "/quotes\n[2020-01-01] A rendszergazda törölte a fiókot"});
        assert.strictEqual(response.status, 400);
    });

    assert.deepStrictEqual(lines, [],
        "az elutasított jelentésből SEMMI nem kerülhet a naplóba");
});

test("a hosszkorlát HATÁRA pontosan ott van, ahol kimondtuk", async () => {
    /* A perjel után legfeljebb 60 karakter. Mindkét oldalát megnézzük: ha csak a
       hosszút néznénk, egy elrontott korlát (mondjuk 10) is zöld maradna. */
    await captureLog(async () => {
        assert.strictEqual((await post({endpoint: "/" + "a".repeat(60)})).status, 204);
    });
    assert.strictEqual((await post({endpoint: "/" + "a".repeat(61)})).status, 400);
});

test("útvonalnak nem látszó kulcsot elutasít (400)", async () => {
    // Perjellel kell kezdődnie, és csak kisbetű/szám/perjel/kötőjel lehet benne.
    assert.strictEqual((await post({endpoint: "quotes"})).status, 400);
    assert.strictEqual((await post({endpoint: "/Quotes"})).status, 400);
    assert.strictEqual((await post({endpoint: "/quotes ; rm -rf"})).status, 400);
    assert.strictEqual((await post({endpoint: "/quotes?a=1"})).status, 400);
});

test("a kötőjeles és többszintű kulcsokat viszont átengedi", async () => {
    const lines = await captureLog(async () => {
        assert.strictEqual((await post({endpoint: "/quotes/search-mode"})).status, 204);
        assert.strictEqual((await post({endpoint: "/to-dos/last/order"})).status, 204);
    });
    assert.strictEqual(lines.length, 2);
});

/* A HÁTRALÉVŐ KÉT TESZT A VALÓDI ROUTERT szólítja meg. A fentiek a middleware-t
   maguk kötötték a próba-app elé, tehát zöldek maradnának akkor is, ha a
   routes.js-ből kimarad a szűkítő vagy a korlátozó — a bekötés NÉMÁN veszne el.
   (Mérve 2026-08-18: a validátor kivétele a routes.js-ből az egész backend
   tesztsort zölden hagyta, amíg ez a teszt meg nem született.)

   A KORLÁTOZÓ MODUL-SZINTŰ ÁLLAPOTOT tart, és ezek a tesztek ugyanabban a
   folyamatban futnak: az itteni kérések ugyanabból az ablakból fogynak. Ezért a
   sorrend kötött (a korlát-teszt az UTOLSÓ), és az sem darabszámra állít, hanem
   arra, hogy a 429 egyáltalán bekövetkezik-e — így nem törik el attól, ha
   fölötte egy új teszt még elhasznál pár kérést. */
const realApp = express();
realApp.use(express.json());
process.env.JWT_SECRET = process.env.JWT_SECRET || "teszt-titok";
realApp.use(require("../routes"));
const postReal = (body) => request(realApp).post("/client-error").send(body);

test("a valódi routerben a BEMENET-SZŰKÍTŐ is ott van", async () => {
    const lines = await captureLog(async () => {
        const rejected = await postReal({endpoint: "/quotes\nhamisított naplósor"});
        assert.strictEqual(rejected.status, 400,
            "a sortöréses kulcs átment — a validateClientError nincs bekötve a routes.js-ben");

        const accepted = await postReal({endpoint: "/quotes"});
        assert.strictEqual(accepted.status, 204, "az érvényes jelentésnek át kell mennie");
    });

    assert.deepStrictEqual(lines.length, 1,
        "pontosan egy naplósor várt: az elutasított jelentésből semmi nem naplózódhat");
});

test("a valódi routerben a végpont KORLÁTOZVA van (előbb-utóbb 429 jön)", async () => {
    await captureLog(async () => {
        const statuses = [];
        // Bőven a limit (20) fölött, hogy a korábbi tesztek fogyasztásától függetlenül elérjük.
        for (let attempt = 0; attempt < 25; attempt += 1) {
            // eslint-disable-next-line no-await-in-loop
            statuses.push((await postReal({endpoint: "/quotes"})).status);
        }

        assert.ok(statuses.includes(429),
            "huszonöt jelentés után sem jött 429 — a rateLimit nincs bekötve a routes.js-ben");
        assert.ok(statuses.filter((status) => status === 204).length <= 20,
            "a korlátnál (20) több jelentés ment át egyetlen ablakban");
        /* A 429 után NINCS visszaengedés ugyanabban az ablakban: ha a sorozat végén
           újra 204 jönne, az azt jelentené, hogy a számláló menet közben nullázódik. */
        assert.strictEqual(statuses[statuses.length - 1], 429);
    });
});
