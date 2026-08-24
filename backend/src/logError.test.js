/* A HIBANAPLÓZÁS TESZTJEI — a napló ne szivárogtasson titkot.

   A SORREND ITT SZÁNDÉKOS: elöl a KONTROLL áll ("egyáltalán naplózunk-e, és
   benne van-e a hasznos tartalom"), és csak utána a "nem tartalmazza" állítások.
   Enélkül minden tiltó teszt attól is zöld lenne, hogy a naplózó semmit nem ír ki
   — ez a projekt egyik visszatérő csapdája (l. CLAUDE.md, "némán elromló minták"). */
const test = require("node:test");
const assert = require("node:assert");

const {logError, redactSecrets, describeError} = require("./logError");

// Valósághű alakok — a formájuk számít, mert a redaktor a FORMÁRA illeszt.
const HASH = "$2b$11$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ01234";
const DRAFT_KEY = "TvVn6r3o9dQ2sK8mYb1eXw4uZp7cLh0jNfAg5tRi3sE=";
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY2NiJ9.Zm9vYmFyc2lnbmF0dXJl";

/* A napló egyetlen hívás idejére. A visszaállítás `finally`-ben megy: ha egy
   állítás megbukik, a `console.error` akkor se maradjon kicserélve. */
function captureLog(action) {
    const original = console.error;
    const lines = [];
    console.error = (...args) => lines.push(args.map(String).join(" "));
    try {
        action();
    } finally {
        console.error = original;
    }
    return lines;
}

test("KONTROLL: a teszt-fixtúrák valódi alakúak", () => {
    /* EZT A TESZTET EGY BUKÁS ÍRATTA MEG. Az első fixtúrám két karakterrel
       hosszabb volt egy valódi bcrypt-hashnél, és a redaktor emiatt csak a
       szabályos ELEJÉT cserélte ki — a maradék két karakter bent maradt a
       szövegben. Itt ez hangos hiba volt, de egy elnézőbb állításnál (`includes`)
       némán "zöld" fixtúrán teszteltem volna a redaktort.

       A redaktor a FORMÁRA illeszt, tehát a formát a fixtúrán is számon kell kérni:
       bcrypt = "$2b$" + 2 jegy + "$" + 53 karakter (22 só + 31 hash) = 60;
       a piszkozat-kulcs = 32 bájt base64-ben = 43 karakter + egy "=". */
    assert.strictEqual(HASH.length, 60, "a bcrypt-hash fixtúra nem szabályos hosszú");
    assert.strictEqual(DRAFT_KEY.length, 44, "a piszkozat-kulcs fixtúra nem 32 bájtnyi base64");
});

test("KONTROLL: a naplósor időbélyeget, kontextust, üzenetet és vermet tartalmaz", () => {
    const lines = captureLog(() => logError("Users.create", new Error("valami elromlott")));

    assert.strictEqual(lines.length, 1, "pontosan egy naplósor várt");
    assert.match(lines[0], /^\[\d{4}-\d{2}-\d{2}T/);
    assert.match(lines[0], /Users\.create:/);
    assert.match(lines[0], /valami elromlott/);
    // A verem nélkül a napló használhatatlan lenne a hibakereséshez.
    assert.match(lines[0], /at .*logError\.test\.js/);
});

test("KONTROLL: EGYETLEN argumentumot adunk át, nem a hibaobjektumot", () => {
    /* Ez a teszt a mérésből született. A projekt napló-tesztjei `args.join(" ")`-szel
       gyűjtenek, ami `String(error)`-t hív — az pedig CSAK a "Név: üzenet" sort adja,
       a mély mezőket nem. A valódi napló ellenben `util.inspect`-tel írja ki az
       objektumot, mindenestül. Mérve (2026-08-24): ugyanazon a hibán a gyűjtő szerint
       nem volt benne a jelszó-hash, a valódi napló szerint benne volt. Ha egyetlen,
       KÉSZ szöveget adunk át, a kettő nem tud elválni — ezért állítjuk itt. */
    let received = [];
    const original = console.error;
    console.error = (...args) => { received = args; };
    try {
        logError("Users.create", new Error("bumm"));
    } finally {
        console.error = original;
    }

    assert.strictEqual(received.length, 1, "a naplózó egyetlen, kész szöveget adjon át");
    assert.strictEqual(typeof received[0], "string");
});

test("a hibaobjektum EXTRA mezői nem kerülnek a naplóba (whitelist)", () => {
    /* Így néz ki egy bulkWrite/insertMany hibája: az `err.op` MAGA a dokumentum,
       benne a jelszó-hash és a piszkozat-kulcs. Ma nincs ilyen hívásunk (mérve) —
       a lényeg épp az, hogy a napló tartalma NE függjön attól, milyen mezőket
       akaszt a hibára egy külső könyvtár. */
    const error = new Error("E11000 duplicate key error collection: to-do.users");
    error.code = 11000;
    error.writeErrors = [{err: {op: {name: "teszt", password: HASH, draftKey: DRAFT_KEY}}}];
    error.keyValue = {name: "teszt"};

    const lines = captureLog(() => logError("Users.create", error));

    assert.ok(!lines[0].includes(HASH), "a jelszó-hash a naplóba került");
    assert.ok(!lines[0].includes(DRAFT_KEY), "a piszkozat-kulcs a naplóba került");
    assert.ok(!lines[0].includes("writeErrors"), "a hiba extra mezői a naplóba kerültek");
    // A hasznos rész viszont megmarad — enélkül a fenti három állítás semmit sem ér.
    assert.match(lines[0], /E11000 duplicate key/);
    assert.match(lines[0], /code: 11000/);
});

test("a jelszó-hash az ÜZENETBEN is eltűnik (redaktor)", () => {
    // Az üzeneteket külső könyvtár fogalmazza: a whitelist nem véd meg attól,
    // ha maga az üzenet tartalmazza a titkot.
    const lines = captureLog(() => logError("Users.login", new Error(`invalid hash provided: ${HASH}`)));

    assert.ok(!lines[0].includes(HASH), "a jelszó-hash benne maradt az üzenetben");
    assert.match(lines[0], /invalid hash provided: \[REDACTED\]/);
});

test("a piszkozat-kulcs alakja eltűnik", () => {
    const lines = captureLog(() => logError("Drafts.key", new Error(`nem menthető: ${DRAFT_KEY}`)));

    assert.ok(!lines[0].includes(DRAFT_KEY));
    assert.match(lines[0], /nem menthető: \[REDACTED\]/);
});

test("a JWT eltűnik", () => {
    const lines = captureLog(() => logError("auth", new Error(`jwt malformed: ${TOKEN}`)));

    assert.ok(!lines[0].includes(TOKEN));
    assert.match(lines[0], /jwt malformed: \[REDACTED\]/);
});

test("a kapcsolati URI jelszava eltűnik, a HOSZT viszont megmarad", () => {
    /* A hoszt és a port nem titok, viszont pont az mondja meg, hova nem sikerült
       csatlakozni — ha azt is levágnánk, használhatatlan lenne a naplósor. */
    const uri = "mongodb://notes:SzuperTitkosJelszo123@127.0.0.1:27017/to-do";
    const lines = captureLog(() => logError("Adatbázis-kapcsolat", new Error(`connect failed: ${uri}`)));

    assert.ok(!lines[0].includes("SzuperTitkosJelszo123"), "az adatbázis jelszava a naplóba került");
    assert.match(lines[0], /mongodb:\/\/notes:\[REDACTED\]@127\.0\.0\.1:27017/);
});

test("a KONTEXTUS is átmegy a redaktoron", () => {
    // Oda is kerülhet titok, véletlenül (pl. egy hívó beleteszi az értéket).
    const lines = captureLog(() => logError(`Users.update ${HASH}`, new Error("bumm")));

    assert.ok(!lines[0].includes(HASH));
});

test("nem Error típusú érték: nem dob, és a típusát is naplózza", () => {
    // A JS-ben bármit lehet dobni; a naplózó nem feltételezhet Error-t.
    for (const value of ["csak egy szöveg", null, undefined, 42, {a: 1}]) {
        const lines = captureLog(() => logError("ismeretlen", value));
        assert.strictEqual(lines.length, 1);
        assert.match(lines[0], /nem Error típusú hiba \((string|object|undefined|number)\)/);
    }
});

test("dobó getterű hibaobjektumon sem száll el", () => {
    /* A naplózót 55 hívási hely éri el, mind `catch` ágból. Ha maga dobna, a
       hibakezelésből összeomlás lenne — vagyis egy 500-as válasz helyett elszállna
       a kérés (a Node pedig a `unhandledRejection`-nel akár a folyamatot is viheti). */
    const hostile = new Error("nem érdekes");
    Object.defineProperty(hostile, "stack", {get() { throw new Error("ez a getter dob"); }});

    const lines = captureLog(() => logError("ellenséges", hostile));
    assert.strictEqual(lines.length, 1);
    assert.match(lines[0], /nem állítható elő/);
});

test("a redaktor önmagában is használható, és a szöveg többi részét nem bántja", () => {
    const text = `elöl ${HASH} középen ${DRAFT_KEY} hátul`;
    assert.strictEqual(redactSecrets(text), "elöl [REDACTED] középen [REDACTED] hátul");
    // Ártalmatlan szöveget nem csonkít (nem "minden gyanús karakterláncot" cserél).
    assert.strictEqual(redactSecrets("egy egészen hétköznapi mondat"), "egy egészen hétköznapi mondat");
});

test("describeError: a verem fejlécét nem írja ki kétszer", () => {
    const description = describeError(new Error("egyszer"));
    assert.strictEqual(description.match(/Error: egyszer/g).length, 1);
});
