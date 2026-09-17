/* KIMENŐ VÁLASZ-WHITELIST — a controllerek nem kerülhetik meg a toJSON-t
   (forrás-szken). Testvére a readerScope.test.js-nek: az a KÉRŐRE SZŰRÉST teszi
   elfelejthetetlenné, ez a KIMENŐ MEZŐK szűkítését.

   A SZABÁLY (CLAUDE.md 7. pont). Ami a response.json-nal kimegy, az a modell
   toJSON-whitelistjén át szűkül — csak a hálózatra szánt mezőket adja ki, egy
   jövőbeli érzékeny séma-mező nem szivárog (l. publicJson.js). DE a toJSON CSAK a
   Mongoose-DOKUMENTUMOKRA fut. A `.lean()` sima JS-objektumot ad vissza, amin
   NINCS toJSON — tehát egy `.lean()`-nel olvasó és a találatot response.json-ba
   adó controller a TELJES dokumentumot kiküldené (tulajdonos `user`, `__v`,
   időbélyegek, és bármely jövőbeli érzékeny mező), némán. Ez a whitelist csendes
   kiürülése.

   MA TISZTA, DE NEM VÉDETT. A `.lean()` egyedül a napi exportban él (scripts/, a
   controllereken KÍVÜL — a mentésnek a teljes doksi KELL, feltétel nélkül, l.
   [[backup-unconditional-and-export-word]]); a controllerekben sehol. De semmi nem
   AKADÁLYOZZA, hogy egy jövőbeli lista-végpont — például a ~10k elemű szekciók
   lapozásához, teljesítményért — bevezesse, és akkor a whitelist némán megkerülhető
   lesz. Ez a kapu ezt teszi elfelejthetetlenné: a controllers/ egyetlen fájlja sem
   hívhat `.lean()`-t indok (allowlist) nélkül.

   MIÉRT CSAK .lean(). Ez a whitelist-megkerülés egyértelmű, elterjedt vektora, és
   a projekt SAJÁT indoklása (publicJson.js) is ezt nevezi meg. Az aggregate szintén
   POJO-t ad, de azt a pipeline alakítja (readAuthors: szerzőket csoportosít, nem
   dokumentumot ad ki), és a readerScope.test.js már megköveteli, hogy a kérőre
   szűrjön; egy teljes doksit $project nélkül kiadó aggregate ritkább, más alakú
   eset. A kézzel összeállított válasz (Quotes/readById.js) eleve whitelist
   konstrukcióból ad ki mezőket. A kaput a lean egyértelmű esetére szabjuk; ha
   valaha az aggregate is vektorrá válik, az a saját, külön kapuja.

   A KAPU ÖNMAGA IS NÉMÁN ELROMOLHAT (üres sweep = hamis zöld, l.
   [[source-scanning-guards-two-shapes]]): ha a felismerő regex vagy a bejárás
   elromlik, üresen futna és zölden hazudna. Ezért az osztályozó TISZTA függvény
   (fs-mentes), és mutáció-próbával, kontrollal állítjuk, hogy tényleg diszkriminál;
   külön kontroll követeli meg, hogy a bejárás egyáltalán találjon fájlokat. */
const {describe, it} = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const CONTROLLERS_DIR = path.join(__dirname, "controllers");

/* A `.lean()` hívása: pont, tetszőleges whitespace, `lean`, majd `(`. A `.lean(`
   nem illeszkedik pl. a `cleanup(`-ra (az elején nincs pont+`lean` határ), a
   `\.` viszont megköveteli a metódus-hívás alakot. */
const LEAN_QUERY = /\.\s*lean\s*\(/;

/* AZ ALLOWLIST — mely controller olvashat mégis `.lean()`-nel, és MIÉRT szabad.
   Ma ÜRES, és ez szándékos: egyetlen mai read-controllernek sincs oka megkerülni a
   whitelistet. Bővíteni csak tudatosan, indokkal (mint az authBoundary
   PUBLIC_ROUTES-a vagy a readerScope allowlistja) — és aki ide `.lean()`-t vesz
   fel, annak a válasz mezőit KÉZZEL kell whitelisteznie (mint Quotes/readById.js),
   különben a teljes doksi kimegy. A kulcs a controllers/-hez relatív, POSIX-
   elválasztóval. */
const ALLOWED_LEAN = {};

/* Egy fájl megítélése — TISZTA függvény (se fs, se hálózat), hogy kitalált
   forrásokkal, mutáció-próbával is meg tudjuk szólítani. Az allowlist PARAMÉTER
   (alapból a valódi), hogy a diszkriminációt üres és nem-üres listával is
   állíthassuk — a readerScope ott valós allowlistelt fájllal bizonyít, itt az
   allowlist üres, ezért a listát injektáljuk. */
function leanVerdict(relPath, source, allowlist = ALLOWED_LEAN) {
    const hasLean = LEAN_QUERY.test(source);
    const allowlisted = Object.hasOwn(allowlist, relPath);
    return {hasLean, allowlisted, violation: hasLean && !allowlisted};
}

/* A controllers/ rekurzív bejárása — csak a nem-teszt .js/.ts fájlok. (A
   TS-átállás ide is elér majd; a .[jt]s minta előre felkészül rá, mint a
   readerScope-ban és az exportSections-ben.) */
function controllerFiles(directory = CONTROLLERS_DIR) {
    const out = [];
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) out.push(...controllerFiles(full));
        else if (/\.[jt]s$/.test(entry.name) && !/\.test\.[jt]s$/.test(entry.name)) out.push(full);
    }
    return out;
}

// A relatív, POSIX-elválasztós kulcs (az allowlist és a hibaüzenetek ezt használják).
const relKey = (full) => path.relative(CONTROLLERS_DIR, full).split(path.sep).join("/");

describe("kimenő válasz-whitelist: egyetlen controller sem kerüli meg a toJSON-t .lean()-nel", () => {
    const files = controllerFiles().sort();
    const scanned = files.map((full) => {
        const relPath = relKey(full);
        return {relPath, ...leanVerdict(relPath, fs.readFileSync(full, "utf8"))};
    });

    /* KONTROLL a néma üres-találat ellen: ha a bejárás elromlik, a sweep üresen
       futna, és zölden jelentene semmit. Ma 33 controller van; a 20-as alsó határ
       jóval alatta, de messze a nulla fölött — egy elromlott bejárás (üres lista)
       hangosan bukik. (A LEAN_QUERY felismerő diszkriminációját a lenti
       mutáció-próba állítja, nem ez: ma HELYESEN nincs egyetlen .lean() sem.) */
    it("a bejárás megtalálja a controller-fájlokat (különben a kapu üresen zöldülne)", () => {
        assert.ok(scanned.length >= 20,
            `csak ${scanned.length} controller-fájlt találtam — a bejárás elromlott?`);
    });

    it("nincs allowlisten kívüli .lean() a controllerekben", () => {
        const offenders = scanned.filter((file) => file.violation).map((file) => file.relPath);
        assert.deepStrictEqual(offenders, [],
            ".lean() sima JS-objektumot ad, amin NEM fut a toJSON-whitelist — a válasz a TELJES " +
            "dokumentumot kiadná (user, __v, időbélyeg, jövőbeli érzékeny mező). Ha szándékos " +
            "(és a válasz mezőit KÉZZEL whitelistezed, mint Quotes/readById.js), vedd fel az " +
            `ALLOWED_LEAN listába az indokával; egyébként olvass toJSON-os dokumentumként. Vétkes(ek): ${offenders.join(", ")}`);
    });

    /* KONTROLL: minden allowlist-bejegyzés VALÓBAN létező, .lean()-t hívó fájlra
       szól (különben az allowlist elavult, és egy jövőbeli hibát csendben elfedne).
       Ma üres, tehát a ciklus nem fut — a kontroll akkor válik éléssé, ha valaki
       felvesz egy bejegyzést. */
    it("az allowlist minden bejegyzése létező, .lean()-t hívó fájlra szól (nem elavult)", () => {
        for (const relPath of Object.keys(ALLOWED_LEAN)) {
            const file = scanned.find((entry) => entry.relPath === relPath);
            assert.ok(file, `az allowlist "${relPath}"-ra hivatkozik, de ilyen controller nincs — elavult bejegyzés?`);
            assert.ok(file.hasLean,
                `az allowlist "${relPath}"-ot ment, de az nem hív .lean()-t — fölösleges bejegyzés?`);
        }
    });
});

/* MUTÁCIÓ-PRÓBA az osztályozón: a fenti "átmegy" csak akkor bizonyít, ha a
   függvény tényleg megkülönbözteti a .lean()-t hívó és nem hívó forrást, és
   tiszteli az allowlistot. */
describe("kimenő válasz-whitelist: az osztályozó diszkriminál (kontroll)", () => {
    it(".lean()-t hívó, nem allowlistelt → VÉTSÉG", () => {
        assert.strictEqual(leanVerdict("Fake/read.js", "Model.find({user}).lean()").violation, true);
        assert.strictEqual(leanVerdict("Fake/read.js", "await Model.findById(id).lean();").violation, true);
    });
    it("a whitespace-es .lean( alak is illeszkedik", () => {
        assert.strictEqual(leanVerdict("Fake/read.js", "Model.find({}) . lean ()").hasLean, true);
    });
    it(".lean() NÉLKÜLI forrás → NEM vétség", () => {
        assert.strictEqual(leanVerdict("Fake/read.js", "response.json(request.item)").violation, false);
        assert.strictEqual(leanVerdict("Fake/read.js", "Model.find({user: request.userId})").violation, false);
    });
    it("a 'cleanup(' NEM számít .lean() hívásnak (a pont+lean határ kell)", () => {
        assert.strictEqual(leanVerdict("Fake/util.js", "function cleanup() {}").hasLean, false);
    });
    it("allowlistelt fájl .lean()-nel → NEM vétség (injektált allowlisttal bizonyítva)", () => {
        const allowlist = {"Fake/read.js": "teszt-indok"};
        assert.strictEqual(leanVerdict("Fake/read.js", "Model.find({}).lean()", allowlist).violation, false);
    });
});
