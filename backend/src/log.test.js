/* A NAPLÓZÁS TESZTJEI — a napló ne szivárogtasson titkot.

   A SORREND ITT SZÁNDÉKOS: elöl a KONTROLL áll ("egyáltalán naplózunk-e, és
   benne van-e a hasznos tartalom"), és csak utána a "nem tartalmazza" állítások.
   Enélkül minden tiltó teszt attól is zöld lenne, hogy a naplózó semmit nem ír ki
   — ez a projekt egyik visszatérő csapdája (l. CLAUDE.md, "némán elromló minták"). */
const test = require("node:test");
const assert = require("node:assert");
const {readdirSync, readFileSync} = require("node:fs");
const {basename, join} = require("node:path");

const {logInfo, logError, redactSecrets, describeError, neutralizeControls, STDERR_PRIORITY} = require("./log");

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
    // A systemd err-prefix a sor legelején; az időbélyeg KÖZVETLENÜL utána.
    assert.ok(lines[0].startsWith(STDERR_PRIORITY), "a hibasor a systemd err-prefixszel kezdődik");
    assert.match(lines[0].slice(STDERR_PRIORITY.length), /^\[\d{4}-\d{2}-\d{2}T/);
    assert.match(lines[0], /Users\.create:/);
    assert.match(lines[0], /valami elromlott/);
    /* A verem nélkül a napló használhatatlan lenne a hibakereséshez. A fájl a
       SAJÁT nevét kérdezi meg: egy átnevezés különben itt bukna el, ott, ahol a
       verem tartalmához semmi köze (pontosan ez történt a log.js-re nevezéskor). */
    assert.match(lines[0], new RegExp(`at .*${basename(__filename)}`));
});

test("a hibasor systemd err-prefixet kap (a -p err ettől lát), az info NEM", () => {
    /* A hiba (console.error) az err-prefixszel megy — enélkül a journalctl -p err
       VAK volt rá (mérve 2026-09-17). Az info (console.log) prefix nélkül marad: az
       info a helyes prioritása, egy téves <3> hamis err-riasztást adna. Ez a két
       állítás EGYÜTT őrzi a szétválasztást: a prefix elhagyása vagy az infóra
       tévedése pontosan itt bukik. */
    const errLines = captureLog(() => logError("Users.create", new Error("bumm")));
    assert.ok(errLines[0].startsWith(STDERR_PRIORITY),
        "a hibasor nem kapta meg az err-prefixet — a journalctl -p err vak marad rá");

    // Az info a console.log-ra megy; külön kapjuk el.
    const original = console.log;
    const infoLines = [];
    console.log = (...args) => infoLines.push(args.map(String).join(" "));
    try {
        logInfo("A szerver fut.");
    } finally {
        console.log = original;
    }
    assert.ok(!infoLines[0].startsWith(STDERR_PRIORITY),
        "az info-sor err-prefixet kapott — az info nem hiba, ez hamis riasztás lenne");
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

test("logInfo: időbélyeggel, egyetlen szövegként naplóz", () => {
    const original = console.log;
    const received = [];
    console.log = (...args) => received.push(args);
    try {
        logInfo("A szerver fut.");
    } finally {
        console.log = original;
    }

    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].length, 1, "a naplózó egyetlen, kész szöveget adjon át");
    assert.match(received[0][0], /^\[\d{4}-\d{2}-\d{2}T.*A szerver fut\.$/);
});

test("logInfo: a redaktor ezen az úton is lefut", () => {
    /* Az üzenet interpolált értéket is hordozhat, és az hozhat titkot — pl. egy
       "a(z) X felhasználó kulcsa megújult" alakú sor. A hiba-ág redakciója
       önmagában nem véd meg ettől: ez másik csatorna (console.log). */
    const original = console.log;
    const lines = [];
    console.log = (...args) => lines.push(args.map(String).join(" "));
    try {
        logInfo(`kulcs kiadva: ${DRAFT_KEY}`);
    } finally {
        console.log = original;
    }

    assert.ok(!lines[0].includes(DRAFT_KEY), "a piszkozat-kulcs a naplóba került");
    assert.match(lines[0], /kulcs kiadva: \[REDACTED\]/);
});

test("napló-injekció: a hibaüzenet sortörése nem nyit új sort, a verem viszont ép marad", () => {
    /* MÉRVE (2026-09-13): az express.json a hibás törzs egy darabját idézi a
       SyntaxError üzenetébe, sortörésestül — ez a serverError → logError úton,
       HITELESÍTÉS NÉLKÜL a journalba kerülne, és a sortörés hamis bejegyzést
       nyitna. A beidézett sortörést semlegesítjük; a verem KERET-sorai (a mi
       tartalmunk) viszont ép sortöréssel maradnak. */
    const injected = new Error('Unexpected token, "garbage\nHAMIS naplósor" is not valid JSON');
    const lines = captureLog(() => logError("POST /to-dos", injected));

    assert.strictEqual(lines.length, 1, "pontosan egy console.error hívás várt");
    assert.ok(!lines[0].includes("\nHAMIS"), "a beinjektált sortörés a naplóban maradt");
    assert.match(lines[0], /garbage\\x0aHAMIS naplósor/, "a beidézett tartalom láthatóan escape-elve kell maradjon");
    /* KONTROLL a TÚL-semlegesítés ellen: a verem keret-sorai ép sortöréssel
       maradnak — enélkül a fenti állítások egy „mindent ellapítunk" megoldásra is
       zöldek lennének, az viszont olvashatatlanná tenné a stacket. */
    assert.ok(lines[0].includes("\n    at "), "a verem keret-sorainak sortörései elvesztek");
});

test("logInfo: a vezérlőkaraktert semlegesíti (napló-injekció ellen)", () => {
    /* A logInfo interpolált külső értéket hordozhat (pl. egy jövőbeli
       felhasználónév), és NINCS benne verem — ezért az egész sor egyetlen sor
       kell maradjon. */
    const original = console.log;
    const lines = [];
    console.log = (...args) => lines.push(args.map(String).join(" "));
    try {
        logInfo("normál\nHAMIS érték");
    } finally {
        console.log = original;
    }

    assert.strictEqual(lines.length, 1);
    assert.ok(!lines[0].includes("\n"), "a sortörés a logInfo-naplóban maradt");
    assert.match(lines[0], /normál\\x0aHAMIS érték/);
});

test("neutralizeControls: a vezérlőket escape-eli, a többit békén hagyja", () => {
    assert.strictEqual(neutralizeControls("a\nb\tc\rd\x7fe"), "a\\x0ab\\x09c\\x0dd\\x7fe");
    // Ártalmatlan szöveget nem bánt (nem „minden gyanús karaktert" cserél).
    assert.strictEqual(neutralizeControls("egy egészen hétköznapi mondat"), "egy egészen hétköznapi mondat");
});

/* ───────────────────────── AZ ŐR ─────────────────────────

   A naplózás egyetlen kapuja a log.js legyen. Ez ma fegyelem kérdése: bárki
   írhat egy közvetlen console-hívást, és attól semmi nem hibázik — csak a titok
   kikerül. Ez tehát GÉPI KAPU egy néma visszacsúszás ellen.

   MIÉRT TILOS MINDEN CONSOLE-HÍVÁS, és nem csak a hibás. Az őr korábban azt
   nézte, szerepel-e a hívásban az `error` szó — de egy `console.log(user)`
   ugyanúgy kiírja a jelszó-hasht, és abban nincs benne az a szó. A szűkebb
   szabály tehát nem kevesebbet védett, hanem rosszabbul: pont a legártatlanabbnak
   látszó alakot engedte át.

   ÉS A SZIGORÚBB SZABÁLY EGYSZERŰBB ŐRT AD. A régi minta az `error` KÖZELSÉGÉT
   kereste a hívás után, amiből két hamis riasztás is származott: a `[^;]*`
   átnyúlt a következő sorba (egy metódus-lánc egyetlen utasítás, így egy ártatlan
   `console.log`-ot rótt fel a mögötte álló `.catch` paraméteréért), és a
   kommentben IDÉZETT hívás is illeszkedett rá. Most elég a puszta hívás alakja:
   `console.<bármi>(`. A soron átnyúlás kérdése ezzel megszűnt.

   AMI MARADT A RÉGI TANULSÁGBÓL: a kommentben idézett alak továbbra is illeszkedne,
   ezért a magyarázó kommentek a hívást ZÁRÓJEL NÉLKÜL írják — az őr hibaüzenete meg
   is mondja ezt annak, aki belefut.

   A KIVÉTELEK okkal vannak, és ha bővül a lista, azt indokolni kell.

   ⚠ A KITERJESZTÉS-CSAPDA MIATT `.js` ÉS `.ts` fájlokat is nézünk: a backend
   ESM/TypeScript-átállása alatt a `.js`-re szűrő felderítés NÉMÁN hagyna ki
   fájlokat (l. CLAUDE.md 4. pont, és scripts/exportSections.js tanulsága).

   ⚠ A `scripts/` MAPPA SZÁNDÉKOSAN NINCS BENNE: azok parancssori eszközök, ahol a
   console a felhasználónak szóló KIMENET, nem szerver-napló. */
const GUARD_EXEMPT = new Set(["log.js"]);
// A puszta hívás alakja. Az `\w+` bármely csatornát fedi (log, error, warn, info…).
const CONSOLE_CALL = /console\.\w+\(/;

function sourceFiles() {
    return readdirSync(__dirname, {recursive: true, encoding: "utf8"})
        .filter((name) => /\.(js|ts)$/.test(name))
        .filter((name) => !/\.test\.(js|ts)$/.test(name))
        .filter((name) => !GUARD_EXEMPT.has(name));
}

test("ŐR: a forrásban nincs közvetlen console-hívás", () => {
    const files = sourceFiles();

    /* A GYŰJTŐ-CSAPDA ELLEN: ha a felderítés elromlik (rossz glob, átrendezett
       mappák), a lista ÜRESEN maradna, és a teszt némán zöld lenne. Ezért előbb
       azt állítjuk, hogy egyáltalán találtunk forrást — és egy KONKRÉTAT is. */
    assert.ok(files.length >= 20, `csak ${files.length} forrásfájlt találtam — a felderítés romlott el`);
    assert.ok(files.includes("serverError.js"), "a serverError.js kimaradt a felderítésből");

    /* KONTROLL: a minta felismeri MINDKÉT csatornát (a `console.log` volt a rés),
       és nem riad a kommentben, zárójel nélkül IDÉZETT alakra. */
    assert.match('console.error("Bejelentkezési hiba:", error);', CONSOLE_CALL);
    assert.match('console.log(`A(z) ${user._id} jelszava átállt.`);', CONSOLE_CALL);
    assert.doesNotMatch("a hibaobjektumot adta át a `console.error`-nak", CONSOLE_CALL);

    const offenders = files.filter((name) => CONSOLE_CALL.test(readFileSync(join(__dirname, name), "utf8")));
    assert.deepStrictEqual(offenders, [],
        "ezek a fájlok közvetlenül naplóznak — a log.js-en át menjenek (logInfo/logError): " + offenders.join(", ") +
        ". (Ha KOMMENTBEN idéznéd a tiltott alakot, hagyd el a zárójelet — a minta a hívásra illeszt.)");
});
