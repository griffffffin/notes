/* A FELHASZNÁLÓNKÉNTI SOROSÍTÁS tesztjei — adatbázis és hálózat nélkül.

   Amit itt számon kérünk, az nem az, hogy "lefut", hanem hogy MI FED ÁT MIVEL. A
   zár egyetlen dolgot ígér: ugyanannak a felhasználónak két sorszám-művelete nem
   futhat egyszerre. Ha ez elromlik, semmi nem hibázik — csak a lista sorszámai
   lesznek rosszak, csendben (l. a modul fejlécében a méréseket). */
const test = require("node:test");
const assert = require("node:assert");
const {EventEmitter} = require("node:events");
const {withUserLock, serializePerUser, lockedUsers} = require("./userLock");

const USER = "user-1";
const OTHER = "user-2";

/* Kézben tartott feladat: a teszt dönti el, mikor fejeződik be. Enélkül a
   "nem fedik át egymást" állítás időzítésre épülne — ami terhelt gépen elcsúszik. */
const controllable = (log, name) => {
    let markStarted;
    let settle;
    const started = new Promise((resolve) => { markStarted = resolve; });

    const task = () => {
        log.push(name + ":kezdet");
        markStarted();
        return new Promise((resolve, reject) => { settle = {resolve, reject}; });
    };
    const finish = (error) => {
        log.push(name + ":vég");
        if (error) settle.reject(error);
        else settle.resolve();
    };
    return {task, started, finish};
};

test("ugyanannak a felhasználónak a műveletei NEM fednek át", async () => {
    const log = [];
    const first = controllable(log, "első");
    const second = controllable(log, "második");

    const firstResult = withUserLock(USER, first.task);
    const secondResult = withUserLock(USER, second.task);
    await first.started;

    // A második MÉG EL SEM KEZDŐDÖTT, pedig már beadtuk.
    assert.deepStrictEqual(log, ["első:kezdet"]);

    first.finish();
    await firstResult;
    await second.started;
    second.finish();
    await secondResult;

    assert.deepStrictEqual(log, ["első:kezdet", "első:vég", "második:kezdet", "második:vég"]);
});

test("KÜLÖNBÖZŐ felhasználók műveletei párhuzamosan futnak", async () => {
    /* A zár nem globális: két felhasználó egymás listáját nem tudja elrontani,
       tehát nincs miért egymásra várniuk. Ha ez elromlana, a rendszer nem hibázna
       — csak lassulna, és senki nem venné észre, miért. */
    const log = [];
    const mine = controllable(log, "enyém");
    const theirs = controllable(log, "másé");

    const mineResult = withUserLock(USER, mine.task);
    const theirsResult = withUserLock(OTHER, theirs.task);
    await mine.started;
    await theirs.started;

    assert.deepStrictEqual(log, ["enyém:kezdet", "másé:kezdet"]);

    mine.finish();
    theirs.finish();
    await Promise.all([mineResult, theirsResult]);
});

test("egy ELBUKOTT művelet nem mérgezi meg a sort", async () => {
    /* A lánc a bukás UTÁN is fut tovább. Enélkül egy hibás mentés a felhasználó
       minden további sorszám-műveletét megbénítaná — a felület "csak nem
       reagálna". */
    const log = [];
    const failing = controllable(log, "bukó");
    const next = controllable(log, "utána");

    const failingResult = withUserLock(USER, failing.task);
    const nextResult = withUserLock(USER, next.task);
    await failing.started;
    failing.finish(new Error("adatbázis"));

    // A HIBA A HÍVÓÉ marad: a zár nem nyeli el.
    await assert.rejects(failingResult, {message: "adatbázis"});

    await next.started;
    next.finish();
    await nextResult;
    assert.deepStrictEqual(log, ["bukó:kezdet", "bukó:vég", "utána:kezdet", "utána:vég"]);
});

test("a lezárult láncok NEM gyűlnek a memóriában", async () => {
    const log = [];
    const only = controllable(log, "egyetlen");

    const result = withUserLock("takaritas-proba", only.task);
    await only.started;
    assert.ok(lockedUsers() > 0, "futás közben van bejegyzés");

    only.finish();
    await result;
    // A takarítás egy mikrotaszkkal később fut le.
    await new Promise((resolve) => setImmediate(resolve));

    assert.strictEqual(lockedUsers(), 0, "a lefutott lánc bejegyzése eltűnik");
});

/* A MIDDLEWARE-alak: meddig tart a zár? A VÁLASZIG — nem a `next()` hívásáig. Ha
   csak a next()-ig tartana, a zár azelőtt oldódna fel, hogy a controller
   befejezte volna a két adatbázis-műveletét, és nem védene semmit. */
const fakeResponse = () => new EventEmitter();

test("a middleware a VÁLASZIG tartja a zárat", async () => {
    const log = [];
    const firstResponse = fakeResponse();
    const secondResponse = fakeResponse();

    serializePerUser({userId: USER}, firstResponse, () => log.push("első kérés fut"));
    serializePerUser({userId: USER}, secondResponse, () => log.push("második kérés fut"));
    await new Promise((resolve) => setImmediate(resolve));

    // A második kérés kezelője EL SEM INDULT, amíg az első válasza nem ment ki.
    assert.deepStrictEqual(log, ["első kérés fut"]);

    firstResponse.emit("finish");
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepStrictEqual(log, ["első kérés fut", "második kérés fut"]);
    secondResponse.emit("finish");
});

test("a MEGSZAKADT kapcsolat is feloldja a zárat", async () => {
    /* Enélkül egy félbehagyott kérés (bezárt fül, elveszett wifi) örökre bent
       tartaná a zárat, és a felhasználó minden további sorrend-művelete
       válaszolatlanul lógna — a felület némán megállna. */
    const log = [];
    const abandoned = fakeResponse();
    const later = fakeResponse();

    serializePerUser({userId: "megszakadt"}, abandoned, () => log.push("elhagyott"));
    serializePerUser({userId: "megszakadt"}, later, () => log.push("későbbi"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepStrictEqual(log, ["elhagyott"]);

    abandoned.emit("close");
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepStrictEqual(log, ["elhagyott", "későbbi"]);
    later.emit("finish");
});
