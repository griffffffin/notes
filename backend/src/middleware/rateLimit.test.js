/* A KÉRÉS-KORLÁTOZÁS tesztjei. Az idő NEM valódi: minden teszt saját órát ad át
   (`now`), így az ablak csúszása azonnal kipróbálható — a `setTimeout`-tal váró
   időfüggő teszt lassú lenne, és a gép terhelésétől függően billegne.

   A LEGFONTOSABB ESET a "határ-burst" tesztje: azt a különbséget méri, ami miatt
   a korlátozó fix ablakról CSÚSZÓ ablakra váltott. Fix ablakkal az a teszt
   megbukik — ez nem feltételezés, hanem a váltás előtti állapoton mérve. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const request = require("supertest");

const rateLimit = require("./rateLimit");

const WINDOW_MS = 60000;

/* Egy próba-app a korlátozóval. A `clock` egy állítható óra: a teszt lépteti,
   nem az idő múlása. */
function buildApp({max = 2, windowMs = WINDOW_MS} = {}) {
    const clock = {value: 1000000};
    const app = express();
    app.use(express.json());
    app.post("/probe",
        rateLimit({windowMs, max, message: "Túl sok kérés.", now: () => clock.value}),
        (request_, response) => response.json({ok: true}));
    return {app, clock};
}

test("a limiten BELÜL minden kérés átmegy", async () => {
    const {app} = buildApp({max: 3});

    for (let attempt = 0; attempt < 3; attempt += 1)
        assert.strictEqual((await request(app).post("/probe").send({})).status, 200,
            `a ${attempt + 1}. kérés még belefért volna a limitbe`);
});

test("a limit FÖLÖTT 429 jön, és a controller nem fut le", async () => {
    const {app} = buildApp({max: 2});

    await request(app).post("/probe").send({});
    await request(app).post("/probe").send({});
    const blocked = await request(app).post("/probe").send({});

    assert.strictEqual(blocked.status, 429);
    assert.strictEqual(blocked.body, "Túl sok kérés.");
    /* A controller válasza {ok: true} volna — ha az jönne vissza, a korlátozó
       átengedte volna a kérést, csak a státuszt írta át. */
    assert.notDeepStrictEqual(blocked.body, {ok: true});
});

test("a 429 mellé Retry-After fejléc megy, másodpercben", async () => {
    const {app, clock} = buildApp({max: 1});

    await request(app).post("/probe").send({});
    clock.value += 20000;                       // az ablakból 40 másodperc van hátra
    const blocked = await request(app).post("/probe").send({});

    assert.strictEqual(blocked.status, 429);
    assert.strictEqual(blocked.headers["retry-after"], "40");
});

test("az ablakból kicsúszó kérés helyet szabadít fel", async () => {
    const {app, clock} = buildApp({max: 1});

    assert.strictEqual((await request(app).post("/probe").send({})).status, 200);
    assert.strictEqual((await request(app).post("/probe").send({})).status, 429);

    clock.value += WINDOW_MS;                   // az első kérés kicsúszott

    assert.strictEqual((await request(app).post("/probe").send({})).status, 200,
        "a kicsúszott kérésnek fel kell szabadítania a helyét");
});

test("AZ ABLAKHATÁRON SINCS BURST — ez a csúszóablak lényege", async () => {
    /* Fix ablakkal ez a teszt MEGBUKIK (mérve a váltás előtti kódon): ott a
       szelet elején a számláló nullázódik, tehát a szelet végén és a következő
       elején együtt a limit KÉTSZERESE fér át néhány másodperc alatt. Egy
       jelszó-szótárnak pont ez a burst ér a legtöbbet.

       Az elrendezés: keret 2, ablak 60 s. Kérés a 0. és az 59. másodpercben —
       mindkettő belefér. A 61.-ben a legelső már kicsúszott, tehát jár egy hely.
       A 62.-ben viszont a 61. és az 59. másodperci kérés IS az ablakon belül van,
       tehát tele van: 429. Fix ablaknál a 61. másodperc új szeletet nyitna, és
       mindkét kérés átmenne. */
    const {app, clock} = buildApp({max: 2, windowMs: 60000});
    const at = async (second) => {
        clock.value = 1000000 + second * 1000;
        return (await request(app).post("/probe").send({})).status;
    };

    assert.strictEqual(await at(0), 200);
    assert.strictEqual(await at(59), 200);
    assert.strictEqual(await at(61), 200, "a 0. másodperci kérés már kicsúszott, jár egy hely");
    assert.strictEqual(await at(62), 429,
        "három kérés fért át 60 másodpercen belül, pedig a keret kettő — " +
        "ez a fix ablak határ-burstje, amit a csúszóablak megszüntet");
});

test("a hibás beállítás AZONNAL hibázik, nem csendben enged át mindent", () => {
    /* Egy elgépelt vagy hiányzó `max` mellett a korlátozó némán elromlana: a
       `times.length < undefined` mindig hamis, tehát MINDEN kérést blokkolna — és
       ugyanígy egy nullás/negatív érték is értelmetlen viselkedést adna. Semmi nem
       szólna róla. Ezért a gyár a létrehozáskor dob: indításkor, hangosan. */
    assert.throws(() => rateLimit({windowMs: WINDOW_MS, message: "x"}), /max/);
    assert.throws(() => rateLimit({windowMs: 0, max: 5, message: "x"}), /windowMs/);
    assert.throws(() => rateLimit({windowMs: WINDOW_MS, max: 0, message: "x"}), /max/);
});

test("a régi hívók kitakarodnak a memóriából (nem szivárog)", () => {
    /* A korlátozó minden hívót megjegyez. Takarítás nélkül ez lassú
       memóriaszivárgás: minden valaha látott IP örökre bent maradna. A takarítást
       közvetlenül, HTTP nélkül próbáljuk ki — így a Map viselkedése látszik, nem
       csak a válaszkód.

       A middleware-t kézzel hívjuk, három hívóval; utána két teljes ablakot
       ugrunk, és egy ÚJ kérés kiváltja a takarítást. Ha a régi bejegyzések bent
       maradnának, a negyedik hívó kérése után négyet találnánk. */
    const clock = {value: 0};
    const limiter = rateLimit({windowMs: WINDOW_MS, max: 5, message: "x", now: () => clock.value});
    const call = (ip) => new Promise((resolve) => {
        limiter({ip}, {set: () => {}, status: () => ({json: () => {}})}, resolve);
    });

    return (async () => {
        await call("1.1.1.1");
        await call("2.2.2.2");
        await call("3.3.3.3");
        clock.value += WINDOW_MS * 2;
        await call("4.4.4.4");

        /* A takarítás után a negyedik hívó kérése ÚJRA átmegy — ez önmagában nem
           bizonyítja a törlést. A bizonyíték: a három régi hívó időbélyegei
           kicsúsztak az ablakból, tehát mindhárman újra kérhetnek ötször 429 nélkül. */
        for (const ip of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) {
            let blocked = false;
            for (let attempt = 0; attempt < 5; attempt += 1) {
                // eslint-disable-next-line no-await-in-loop
                await new Promise((resolve) => {
                    limiter({ip}, {
                        set: () => {},
                        status: () => ({json: () => { blocked = true; resolve(); }}),
                    }, resolve);
                });
            }
            assert.strictEqual(blocked, false,
                `a ${ip} régi időbélyegei bent maradtak — a lejárt bejegyzéseket nem takarítottuk ki`);
        }
    })();
});

test("a hívókat KÜLÖN számoljuk (az egyik kimerítése nem zárja ki a másikat)", () => {
    const clock = {value: 0};
    const limiter = rateLimit({windowMs: WINDOW_MS, max: 1, message: "x", now: () => clock.value});
    const results = [];
    const call = (ip) => new Promise((resolve) => {
        limiter({ip}, {
            set: () => {},
            status: (code) => ({json: () => { results.push(code); resolve(); }}),
        }, () => { results.push(200); resolve(); });
    });

    return (async () => {
        await call("1.1.1.1");
        await call("1.1.1.1");
        await call("2.2.2.2");

        assert.deepStrictEqual(results, [200, 429, 200],
            "a második hívó saját ablakot kap — nem az elsőét folytatja");
    })();
});

test("a `keyOf` a vödör kulcsa — más IP, AZONOS kulcs egy vödörbe esik", () => {
    /* Ez a login fiók-korlátjának a lényege (routes.js): a kulcs a fióknév, nem
       az IP. Két kérés KÜLÖNBÖZŐ IP-ről, de AZONOS névre ugyanabba a vödörbe kell
       essen — különben egy botnet ezer címről egyetlen fiókra próbálhatna. A
       kontroll a végén: MÁS névre külön vödör jár, tehát a korlát nem globális. */
    const clock = {value: 0};
    const limiter = rateLimit({
        windowMs: WINDOW_MS, max: 1, message: "x", now: () => clock.value,
        keyOf: (request) => request.body.name,
    });
    const results = [];
    const call = (ip, name) => new Promise((resolve) => {
        limiter({ip, body: {name}}, {
            set: () => {},
            status: (code) => ({json: () => { results.push(code); resolve(); }}),
        }, () => { results.push(200); resolve(); });
    });

    return (async () => {
        await call("1.1.1.1", "alice");
        await call("2.2.2.2", "alice");   // más IP, de ugyanaz a fiók → tele
        await call("9.9.9.9", "bob");     // kontroll: más fiók, saját vödör

        assert.deepStrictEqual(results, [200, 429, 200],
            "az azonos kulcsú kérések egy vödörbe esnek, a másik kulcs külön vödröt kap");
    })();
});

test("IP nélküli kérés sem csúszik át korlátozás nélkül", () => {
    /* A megengedő ág (nincs IP → engedd) néma kiskapu lenne. Az ismeretlen
       hívókat közös vödörbe soroljuk, tehát a második kérésük már 429. */
    const clock = {value: 0};
    const limiter = rateLimit({windowMs: WINDOW_MS, max: 1, message: "x", now: () => clock.value});
    const statuses = [];
    const call = () => new Promise((resolve) => {
        limiter({}, {
            set: () => {},
            status: (code) => ({json: () => { statuses.push(code); resolve(); }}),
        }, () => { statuses.push(200); resolve(); });
    });

    return (async () => {
        await call();
        await call();
        assert.deepStrictEqual(statuses, [200, 429]);
    })();
});
