/* AZ AUTH-HATÁR: mi érhető el token NÉLKÜL.

   A routes.js-ben egyetlen sor választja ketté az alkalmazást:

       router.use(auth);          // innentől minden végpont hitelesítést kíván

   Ami e FÖLÖTT van regisztrálva, az publikus. Ez a projekt egyik legérzékenyebb
   ténye — a régi alkalmazás fő gyengesége épp a hiányzó szerveroldali
   hitelesítés volt —, és a mai napig SEMMI nem őrzi. Egy új végpont, ami
   figyelmetlenségből néhány sorral feljebb kerül, azonnal és NÉMÁN publikussá
   válik: nem hibázik, a felület ugyanúgy működik, a saját böngészőnk pedig
   sosem próbálja ki token nélkül. Kívülről viszont bárki eléri.

   A teszt HÁROM, egymástól független módon kérdez rá ugyanarra:

     (1) FORRÁS-SORREND: a routes.js szövegében az `auth` sora előtt pontosan a
         három, szándékosan publikus útvonal állhat. Új sor a határ fölé = bukás,
         NÉVVEL — ez az egyetlen mechanizmus, ami meg tudja mondani, MELYIK útvonal
         a hibás, ezért marad meg a jó hibaüzenetért.

     (2) A REGISZTRÁLT RÉTEGEK: ugyanez a kérdés a felépített routertől, szöveg
         nélkül. Ez a VALÓDI KAPU — l. lentebb, miért.

     (3) VISELKEDÉS: a felépített routert tényleg megszólítjuk token nélkül. Egy
         védett végpont 401-et ad, a három publikus NEM (a saját validátoruk 400-a
         jön, ami épp azt bizonyítja, hogy a kérés eljutott hozzájuk). Adatbázis
         nem kell: a hiányzó token a middleware első sorában elakad, a publikus
         végpontok pedig a validátoron.

   MIÉRT NEM ELÉG AZ (1). Mert a szöveg-illesztés FORMÁZÁS-FÜGGŐ, és a kihagyása
   NÉMA: a nem illeszkedő sor egyszerűen kimarad a gyűjtésből, a lista változatlan
   marad, a teszt zöld. MÉRVE (2026-08-16): egy BEHÚZOTT, illetve egy APOSZTRÓFOS
   `router.use` az auth-határ fölé téve a teljes backend tesztsort (190 teszt)
   ZÖLDEN hagyta — miközben az útvonal élesben publikus lett. Ugyanaz a sor a mai
   írásmóddal viszont megbukott. Vagyis a kapu nem a szándékot védte, hanem a
   szokásos formázást.

   Ezt az (1) minta tágítása nem oldja meg, csak arrébb tolja: egy többsoros hívás
   vagy egy változóból jövő útvonal továbbra is kimaradna. Ezért kell a (2), ami
   NEM a forrást olvassa, hanem a MÁR FELÉPÜLT routert kérdezi.

   (A fájl korábban azzal érvelt, hogy a rétegekből nem nyerhető vissza az
   útvonal-szöveg, ezért marad a forrás. Az első fele igaz — de nem is kell
   visszafejteni: minden réteget MEG LEHET KÉRDEZNI, hogy illeszkedik-e egy adott
   címre (`layer.match`). Nem a belsőségeit olvassuk, hanem próbát futtatunk rajta.
   És hogy a könyvtár-frissítés se tudja némán kiütni: a (2) minden feltevését
   KIMONDJA és ellenőrzi — ha az Express egyszer mást ad, az hangos bukás lesz,
   nem csendes átengedés.) */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const request = require("supertest");

// A tesztfutónak nincs .env-je; az auth middleware betöltéséhez elég egy álérték.
process.env.JWT_SECRET = process.env.JWT_SECRET || "teszt-titok";
const routes = require("./routes");
/* UGYANAZT a modulpéldányt kérjük, amit a routes.js is — a rétegek közti
   azonosság-vizsgálat (`layer.handle === auth`) csak így működik. A Node
   modul-gyorsítótára ezt garantálja: ugyanaz az útvonal, ugyanaz az objektum. */
const auth = require("./middleware/auth");

/* A SZÁNDÉKOSAN publikus útvonalak — és hogy MIÉRT azok. Ez a lista a teszt
   lelke: bővíteni csak tudatosan szabad, és aki bővíti, annak ide is le kell
   írnia az indokot. */
const PUBLIC_ROUTES = {
    "/user/create": "regisztráció — értelemszerűen nincs még tokenje",
    "/login": "bejelentkezés — ez ADJA a tokent",
    "/quotes/id": "egyetlen idézet megosztható, publikus nézete (l. routes.js)",
    "/client-error": "a kliens szerződés-hibáit a KIJELENTKEZETT úton is fogadnunk kell " +
        "(a publikus idézet-nézet is sémán ellenőriz) — korlátozva és szűk bemenettel, " +
        "l. controllers/clientError.js",
};

/* A minták TÉRKÖZ-TŰRŐEK (`\s*` a pont, a zárójel és az idézőjel körül), és
   mindhárom idézőjel-alakot elfogadják. Ez nem kozmetika: a szűk minta kihagyása
   NÉMA. A tágítás persze nem teszi teljessé — a többsoros hívást vagy a
   változóból jövő útvonalat továbbra sem látja —, ezért NEM ez a kapu, hanem a
   következő teszt; ez a jó hibaüzenetért van. */
const AUTH_LINE = /^\s*router\s*\.\s*use\s*\(\s*auth\s*\)/;
const PUBLIC_LINE =
    /^\s*router\s*\.\s*(?:use|all|get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)/;

test("a routes.js-ben csak a szándékolt útvonalak állnak az auth ELŐTT", () => {
    const source = fs.readFileSync(path.join(__dirname, "routes.js"), "utf8").split("\n");
    const authLine = source.findIndex((line) => AUTH_LINE.test(line));
    assert.ok(authLine > 0,
        "Nem találom a 'router.use(auth);' sort a routes.js-ben. Ha az alakja változott, " +
        "ezt a tesztet is vezesd át — enélkül nem őriz semmit.");

    const before = source.slice(0, authLine)
        .map((line) => line.match(PUBLIC_LINE))
        .filter(Boolean)
        .map((match) => match[1]);

    assert.deepStrictEqual(before.sort(), Object.keys(PUBLIC_ROUTES).sort(),
        "Megváltozott, mi érhető el hitelesítés NÉLKÜL. Ha ez szándékos, vedd fel a " +
        "PUBLIC_ROUTES listába az indokával együtt; ha nem, tedd a router.use(auth) alá.");
});

/* AZ ELŐZŐ TESZT FORMÁZÁS-FÜGGŐ KAPUJA HELYETT A VALÓDI: a FELÉPÜLT routert
   kérdezzük, nem a forrás szövegét. Így mindegy, hogy behúzva, aposztróffal, több
   sorban vagy változóból írták az útvonalat — a réteg attól még ott van.

   KÉT FELTÉTELT követelünk meg minden auth ELŐTTI rétegtől, és MINDKETTŐ kell:

     a) illeszkedjen legalább egy DEKLARÁLT publikus címre — különben olyan
        útvonal került a határ fölé, amiről a PUBLIC_ROUTES nem tud;
     b) NE illeszkedjen egyetlen VÉDETT címre sem — ez fogja meg az útvonal
        NÉLKÜLI közbeékelt middleware-t (`router.use(fn)`), ami mindenre illik.
        MÉRVE (2026-08-16): egy ilyen réteg az (a) feltételt magától teljesíti
        (ráillik a publikus címekre is), tehát (a) egyedül átengedné. */
const PROTECTED_PROBES = ["/to-dos", "/quotes", "/refresh"];

/* Illeszkedik-e a réteg erre a címre? A hibát NEM nyeljük el: ha a `layer.match`
   egyszer eltűnik vagy mást vár, arról tudni kell — a néma `false` pont azt a
   csendes átengedést hozná vissza, ami ellen ez a teszt van. */
const matches = (layer, probe) => {
    assert.strictEqual(typeof layer.match, "function",
        "Az Express router rétegének nincs match() metódusa — a könyvtár belső alakja " +
        "megváltozott. Ezt a tesztet át kell vezetni; addig NEM őrzi az auth-határt.");
    return !!layer.match(probe);
};

test("a felépült routerben az auth ELŐTT csak deklaráltan publikus réteg áll", () => {
    /* Az auth-réteget AZONOSSÁG alapján keressük (`handle === auth`), nem név vagy
       sorszám szerint: a middleware névtelen függvény, az átnevezése pedig nem
       mozdíthatja el ezt a tesztet. */
    assert.ok(Array.isArray(routes.stack),
        "Az Express router nem ad `stack` tömböt — a könyvtár belső alakja megváltozott.");

    const authIndex = routes.stack.findIndex((layer) => layer.handle === auth);
    assert.ok(authIndex > 0,
        "Nem találom az auth middleware rétegét a routerben. Vagy nincs regisztrálva " +
        "(ekkor MINDEN publikus!), vagy a router szerkezete változott meg.");

    const publicPaths = Object.keys(PUBLIC_ROUTES);
    const offenders = routes.stack.slice(0, authIndex).map((layer, index) => {
        const coversPublic = publicPaths.some((probe) => matches(layer, probe));
        const leaksProtected = PROTECTED_PROBES.filter((probe) => matches(layer, probe));
        if (coversPublic && leaksProtected.length === 0) return null;
        return `#${index} (${layer.handle.name || "névtelen"}): ` + (coversPublic
            ? `védett címekre is illeszkedik: ${leaksProtected.join(", ")}`
            : "egyetlen deklarált publikus címre sem illeszkedik");
    }).filter(Boolean);

    assert.deepStrictEqual(offenders, [],
        "Az auth-határ FÖLÖTT olyan réteg áll, ami nem a deklarált publikus útvonalakat " +
        "szolgálja ki — vagyis token nélkül is elérhető. Ha szándékos, vedd fel a " +
        `PUBLIC_ROUTES listába az indokával; ha nem, tedd a router.use(auth) alá. ${offenders.join(" | ")}`);
});

test("token nélkül a védett végpont 401-et ad", async () => {
    const app = express();
    app.use(express.json());
    app.use(routes);

    const response = await request(app).post("/to-dos").send({});

    assert.strictEqual(response.status, 401,
        "Egy védett végpont token nélkül is válaszolt — az auth-határ elcsúszott.");
});

/* A publikus végpontok NEM adhatnak 401-et. A 400 itt a helyes válasz: a kérés
   eljutott a saját validátorukig, és az utasította el üres törzsért — vagyis a
   hitelesítés nem állt az útjába. */
for (const [route, why] of Object.entries(PUBLIC_ROUTES)) {
    test(`token nélkül is elérhető: ${route} (${why})`, async () => {
        const app = express();
        app.use(express.json());
        app.use(routes);

        const response = await request(app).post(route).send({});

        assert.notStrictEqual(response.status, 401,
            `A ${route} hitelesítést kért, pedig szándékosan publikus. ` +
            "Ha ez a változás szándékos, a PUBLIC_ROUTES listából is vedd ki.");
    });
}
