/* AMIT A KÉT CSOMAG KÖZÖSEN TUD — és amit eddig csak komment tartott össze.

   A frontend és a backend külön npm-csomag: külön telepítés, külön build, közöttük
   JSON. Egyetlen sor kódot sem osztanak meg, tehát semmilyen eszköz — se fordító,
   se linter, se a TypeScript — nem látja, ha egy érték az egyik oldalon
   megváltozik, a másikon nem. Ma ezeket a kötéseket KOMMENTEK tartják ("a 15 perc
   a kliens tétlenségi határával egyezik, a kettőt EGYÜTT kell módosítani") — az
   pedig annyit ér, amennyit a következő módosító elolvas belőle.

   Mind a négy kötés NÉMÁN romlik el, és mind más módon:

     - a token élettartama: ha a kliens órája hosszabb lenne, a felület használhatónak
       látszana, miközben a szerver már minden kérést 401-gyel dob vissza;
     - a jelszó-szabály: ha a backend szigorodna, a felület átengedné a regisztrációt,
       és a felhasználó a szerver hibaüzenetébe futna bele — vagy fordítva, a felület
       tiltana meg olyan jelszót, amit a rendszer elfogadna;
     - a betűméret-tartomány: a stepper olyan értékig engedne, amit a validátor
       elutasít — a mentés 400-zal bukna, látszólag ok nélkül;
     - a betűméret ALAPÉRTÉKE: ha elcsúszna, a mező nélküli régi idézetek a listában
       más méretben jelennének meg, mint a szerkesztőben. Semmi nem hibázik, csak
       ugrik a szöveg.

   A TESZT SZÁNDÉKOSAN NEM RÖGZÍTI AZ ÉRTÉKEKET, csak azt, hogy a két oldal
   ugyanazt mondja. A 15 perc szabadon lehet 20 vagy 10 — de csak mindkét helyen.

   Ugyanaz a minta, mint a scripts/backupPaths.test.js-é (ott három fájl, két
   nyelv); ez a testvére a csomaghatáron. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const Quotes = require("./models/quotes");

const REPO_ROOT = path.join(__dirname, "../..");

/* A frontend-fájlt KITERJESZTÉS NÉLKÜL keressük. Nem kényelmi kérdés: a
   TypeScript-átállás alatt ugyanaz a modul hol .jsx, hol .tsx — egy bedrótozott
   kiterjesztés attól a naptól nem találná a fájlt, és a teszt "nem találom"
   helyett akár csendben mást vizsgálna. (A napi export felderítőjén ugyanez a
   csapda sült el, l. scripts/exportSections.js.) */
function resolveSource(relativeBase) {
    for (const extension of [".ts", ".tsx", ".js", ".jsx"]) {
        const candidate = path.join(REPO_ROOT, relativeBase + extension);
        if (fs.existsSync(candidate)) return candidate;
    }
    assert.fail(`Nem találom ezt a forrásfájlt (semmilyen kiterjesztéssel): ${relativeBase}`);
}

/* Egy érték kiolvasása a fájl SZÖVEGÉBŐL, nem a modult betöltve. Azért szövegből,
   mert a frontend-modulokat ez a (Node-os, jsdom nélküli) tesztfutó nem tudja
   betölteni: JSX-et tartalmaznak és böngésző-API-kra hivatkoznak.

   A HIÁNYZÓ MINTA BUKÁS, nem kihagyás. Ha valaki átírja a konstans alakját, arról
   tudni KELL — különben a teszt attól kezdve zölden futna, és közben semmit nem
   őrizne. Ez a fajta "elnémult őr" rosszabb, mint ha teszt sem lenne. */
function declared(relativeBase, pattern, what) {
    const file = resolveSource(relativeBase);
    const match = fs.readFileSync(file, "utf8").match(pattern);
    assert.ok(match, `Nem találtam meg (${what}) itt: ${path.relative(REPO_ROOT, file)} — ` +
        `a minta (${pattern}) nem illeszkedik. Ha a konstans alakja változott, ezt a tesztet is vezesd át.`);
    return match[1];
}

test("a token élettartama egyezik a kliens tétlenségi határával", () => {
    // backend/src/token.js: TOKEN_TTL = "15m"  →  ezredmásodpercben
    const ttl = declared("backend/src/token", /TOKEN_TTL\s*=\s*"(\d+)m"/, "a token élettartama");
    // frontend/src/idle.ts: IDLE_LOGOUT_MS = 15 * 60 * 1000
    const idle = declared("frontend/src/idle", /IDLE_LOGOUT_MS\s*=\s*(\d+)\s*\*\s*60\s*\*\s*1000/,
        "a kliens tétlenségi határa");

    assert.strictEqual(Number(ttl), Number(idle),
        `A token ${ttl} percig él, a kliens ${idle} perc tétlenség után léptet ki. ` +
        "Ha a kliensé a hosszabb, a felület használhatónak látszik, miközben a szerver már mindent 401-gyel dob vissza.");
});

test("a jelszó-szabály betűre azonos a két oldalon", () => {
    /* A szabály KÉT helyen kell: a backendé a valódi kapu (a kliensnek soha nem
       hiszünk), a frontendé az azonnali visszajelzés. Az elcsúszásuk viszont
       kizárólag a felhasználót bünteti. */
    const backend = declared("backend/src/controllers/Users/create",
        /PASSWORD_RULE\s*=\s*\/(.+?)\/;/, "a jelszó-szabály");
    const frontend = declared("frontend/src/components/User/entry",
        /setIsPasswordValid\(\/(.+?)\/\.test\(/, "a jelszó-szabály");

    assert.strictEqual(backend, frontend,
        "A regisztráció jelszó-szabálya eltér a két oldalon: a felület mást enged át, mint amit a szerver elfogad.");
});

/* A HIBA-STÁTUSZKÓDOK. A belépő űrlap immár nem "minden hibára ugyanazt" írja ki,
   hanem a STÁTUSZKÓD alapján dönt — ezzel viszont két szám átkerült a csomaghatár
   mindkét oldalára, és onnantól némán el tud csúszni. Ha a backend a sikertelen
   belépést egy nap 401-re írja át, a felület nem hibázik: csak "nem sikerült
   elérni a szervert"-et mond a rossz jelszóra. Semmi nem jelezné.

   Miért épp ez a két kód? Mert CSAK ez a kettő hordoz külön üzenetet a felületen;
   minden más a közös "valami elromlott" ágra esik, ott nincs mit elrontani. */
test("a sikertelen belépés státusza egyezik a felület 'hibás jelszó' ágával", () => {
    const backend = declared("backend/src/controllers/Users/login",
        /BAD_LOGIN_STATUS\s*=\s*(\d+)/, "a sikertelen belépés státusza");
    const frontend = declared("frontend/src/components/User/entryError",
        /BAD_LOGIN_STATUS\s*=\s*(\d+)/, "a 'hibás név vagy jelszó' ág státusza");

    assert.strictEqual(Number(backend), Number(frontend),
        `A szerver ${backend}-t ad a rossz jelszóra, a felület ${frontend}-re írja ki a "hibás név vagy jelszó" ` +
        "üzenetet. Elcsúszva a valódi ok helyett általános hibaüzenetet látna a felhasználó.");
});

test("a névütközés státusza egyezik a felület 'foglalt név' ágával", () => {
    const backend = declared("backend/src/controllers/Users/create",
        /NAME_TAKEN_STATUS\s*=\s*(\d+)/, "a névütközés státusza");
    const frontend = declared("frontend/src/components/User/entryError",
        /NAME_TAKEN_STATUS\s*=\s*(\d+)/, "a 'foglalt név' ág státusza");

    assert.strictEqual(Number(backend), Number(frontend),
        `A szerver ${backend}-t ad a foglalt névre, a felület ${frontend}-re számít. ` +
        "Elcsúszva a regisztráció általános hibát mutatna, és a felhasználó nem tudná, hogy nevet kell váltania.");
});

test("a betűméret tartománya egyezik a szerkesztő stepperével", () => {
    /* A backend oldalán a SÉMÁT olvassuk, nem a middleware-t — a kettő egyezését a
       middleware/fontSizeRange.test.js már őrzi. Így a lánc teljes:
       séma ↔ middleware (ott), séma ↔ frontend (itt). */
    const {min, max} = Quotes.schema.path("fontSize").options;
    const source = resolveSource("frontend/src/components/Quotes/save");
    const stepper = fs.readFileSync(source, "utf8").match(/max=\{(\d+)\}\s*min=\{(\d+)\}/);
    assert.ok(stepper, "Nem találtam a betűméret-stepper tartományát a szerkesztőben " +
        "(max={…} min={…}). Ha az alakja változott, ezt a tesztet is vezesd át.");

    assert.strictEqual(Number(stepper[2]), min, "A stepper alsó határa eltér a séma minimumától.");
    assert.strictEqual(Number(stepper[1]), max, "A stepper felső határa eltér a séma maximumától.");
});

test("a betűméret alapértéke egyezik a séma alapértékével", () => {
    const schemaDefault = Quotes.schema.path("fontSize").options.default;
    const frontendDefault = declared("frontend/src/components/Quotes/save",
        /DEFAULT_FONT_SIZE\s*=\s*(\d+)/, "a betűméret alapértéke");

    assert.strictEqual(Number(frontendDefault), schemaDefault,
        "Az új idézet a szerkesztőben más méretet kap, mint amit a séma a mező nélküli régiekre ad — " +
        "a szöveg mérete ugrana a lista és a szerkesztő között.");
});

/* AZ ÚJ ELEM AZONOSÍTÓJÁNAK HOSSZA — a legfrissebb csomaghatár-kötés.

   A létrehozás azonosítóját mostantól a KLIENS gyártja (frontend/src/objectId.ts),
   mert az `_id` egyedi indexe az egyetlen atomi eszközünk arra, hogy egy
   megismételt kérés ne hozzon létre másodpéldányt (backend createOnce.js). A
   szerver viszont ELLENŐRZI az alakot, és pontosan 24 hexa karaktert enged át.

   Ha a két oldal elcsúszik, az NEM néma — MINDEN létrehozás 400-at kapna —, de
   csak élesben derülne ki, és a felhasználó egy megmagyarázhatatlan hibát látna.
   Ezért itt, a határon kérjük számon: a kliens bájt-számai (időbélyeg + véletlen)
   pontosan annyi hexa karaktert adnak, amennyit a szerver mintája megkövetel. */
test("a kliens által gyártott azonosító hossza egyezik a szerver ellenőrzésével", () => {
    const timestampBytes = declared("frontend/src/objectId",
        /TIMESTAMP_BYTES\s*=\s*(\d+)/, "az időbélyeg bájtjai");
    const randomBytes = declared("frontend/src/objectId",
        /RANDOM_BYTES\s*=\s*(\d+)/, "a véletlen bájtok");
    // backend/src/middleware/validators.js: /^[0-9a-f]{24}$/i
    const required = declared("backend/src/middleware/validators",
        /\[0-9a-f\]\{(\d+)\}/, "az azonosító megkövetelt hossza");

    const produced = (Number(timestampBytes) + Number(randomBytes)) * 2;
    assert.strictEqual(produced, Number(required),
        `A kliens ${produced} hexa karaktert gyárt, a szerver ${required}-et vár. ` +
        "Így minden létrehozás 400-zal bukna el.");
});
