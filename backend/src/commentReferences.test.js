/* A KOMMENTEKBEN EMLÍTETT FÁJLOK LÉTEZNEK-E.

   A repo kommentjei sűrűn hivatkoznak egymásra ("l. Quotes/save.tsx"), és a
   CLAUDE.md ezt meg is KÖVETELI: az `ELTÉRÉS`-kommentnek ki kell mondania a párja
   KONKRÉT fájlnevét, hogy a tudatos elhajlások grep-pel előkereshetők legyenek.

   CSAKHOGY EGY FÁJLNÉV A KOMMENTBEN KÉZZEL SZINKRONIZÁLT MÁSOLAT. Semmi nem
   mozdítja együtt a fájllal: átnevezéskor, mappa-váltáskor vagy egy
   nyelv-átálláskor csendben elavul. Nem hibázik semmi — csak a hivatkozás visz
   sehova, és épp azt a felderíthetőséget rontja el, amit a szabály ígér.

   MÉRVE (2026-08-16), a TypeScript-átállás után: 55 komment hivatkozott `.jsx`
   fájlra, miközben a repóban NULLA `.jsx` fájl volt. Rajtuk kívül 8 további
   hivatkozás mutatott `.js` néven olyan modulra, ami már `.ts` — és négy elavult
   név magában a CLAUDE.md-ben állt, abban a fájlban, ami a szabályt kimondja.
   Egyik sem okozott hibát; mind csak félrevezetett.

   EZ AZ ŐR ÉPP A KÖVETKEZŐ ÁTÁLLÁSRA KÉSZÜL. Amikor a backend `.js`-ről `.ts`-re
   vált, egy csapásra elavul minden `.js`-re mutató komment — az `ELTÉRÉS`-eké is.
   Akkor ez a teszt HANGOSAN felsorolja őket, ahelyett hogy évekig maradnának.

   MIÉRT CSAK A KOMMENTEKET NÉZI. Az `import`-okban álló útvonalakat már a fordító
   és a bundler ellenőrzi — ott a hibás hivatkozás úgyis hangos. A komment az
   egyetlen hely, ahol egy fájlnév ellenőrizetlenül elavulhat. (Mérve: a teljes
   forrásra engedve 12 fel nem oldható találat jött, abból 8 csak a
   node_modules-beli CSS-importok és regex-törmelék volt; csak a kommentekre
   szűkítve 4 maradt, mind valódi eset.) */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "../..");

/* A hivatkozás-vadász minta. Két részlete NEM kozmetika:

   - a `(?<![.\w/-])` visszatekintés megakadályozza, hogy egy hosszabb név KÖZEPÉN
     kezdjünk illeszteni. Enélkül minden `.d.ts` említés és minden olyan hely, ahol
     két kiterjesztést perjellel sorolunk fel, egy-egy nem létező "fájlnevet"
     termelt volna (a vezető pont után maradt csonkot) — örök hamis riasztás.
     MÉRVE: pontosan három ilyen törmelék tűnt el a visszatekintéstől;
   - a névet a saját LEZÁRÓJÁIG olvassuk (`\b` a kiterjesztés után), nem egy
     megengedett-karakter lista határáig. A karakterlista csonkítana, és a csonk
     ütközhetne egy valódi névvel — az néma hamis ZÖLD volna. */
const FILE_REFERENCE = /(?<![.\w/-])([A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:jsx?|tsx?|css|html|sh))\b/g;

/* Blokk- és sor-kommentek. A markdownban (CLAUDE.md) az EGÉSZ fájl "komment",
   ezért ott nem szűrünk. */
const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

/* Az URL-eket előbb kivágjuk. Egy `http://localhost:3000/index.html` alakú cím
   különben a port-számmal együtt akadna fenn egy fájlnévnek látszó darabként —
   holott az nem fájl, hanem port + útvonal.

   (Ez a sor egyben MEGMUTATJA, hogy a kivágás működik: a fenti cím itt áll a
   kommentben, és mégsem jelenti fel magát. Ezért nem is kell ennek a fájlnak
   kivételt kérnie saját magára, ellentétben a typeAssertions.test.ts-szel, ami
   szükségképpen tartalmazza a tiltott alakot.) */
const stripUrls = (text) => text.replace(/https?:\/\/\S+/g, "");

/* AMI SZÁNDÉKOSAN NEM A REPO FÁJLJA — és miért. Ez a lista a teszt lelke, mint az
   authBoundary PUBLIC_ROUTES-a: bővíteni csak indokkal szabad. */
const NOT_OUR_FILES = {
    "lib.dom.d.ts": "a TypeScript saját típuskönyvtára, nem a repóé",
    "vite/types/importMeta.d.ts": "a Vite típusfájlja a node_modules-ban",
    "quotes.ts": "SZÁNDÉKOSAN nem létező: a kiterjesztés-csapdát bemutató példa (exportSections.js)",
    "Node.js": "a futtatókörnyezet neve, nem fájlnév",
};

const SOURCE_ROOTS = ["frontend/src", "backend/src", "backend/scripts"];
const DOCS = ["CLAUDE.md"];

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else out.push(full);
    }
    return out;
}

/* A repo MINDEN fájlja a feloldáshoz — nem csak a vizsgált gyökerek: egy komment
   hivatkozhat a deploy/ mappára vagy az index.html-re is. */
function repoFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (["node_modules", ".git", "dist", "coverage"].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) repoFiles(full, out);
        else out.push(path.relative(REPO_ROOT, full));
    }
    return out;
}

function collectReferences() {
    const known = repoFiles(REPO_ROOT);
    const found = [];

    const scan = (file, text) => {
        for (const match of stripUrls(text).matchAll(FILE_REFERENCE))
            found.push({file: path.relative(REPO_ROOT, file), reference: match[1], known});
    };

    for (const root of SOURCE_ROOTS)
        for (const file of walk(path.join(REPO_ROOT, root))) {
            const source = fs.readFileSync(file, "utf8");
            for (const comment of source.match(COMMENTS) || []) scan(file, comment);
        }

    for (const doc of DOCS)
        scan(path.join(REPO_ROOT, doc), fs.readFileSync(path.join(REPO_ROOT, doc), "utf8"));

    return {found, known};
}

const {found, known} = collectReferences();

/* KONTROLL. Ez a teszt GYŰJTŐ alakú: a nem illeszkedő sor egyszerűen kimarad, a
   lista nem nő, és a lenti állítás zölden átmegy. Egy elnémult minta így semmit
   nem őrizne — a darabszám-elvárás ez ellen véd. (A mai érték ~380; a 100-as
   küszöb bőven a zaj alatt van, de a "semmit nem talált" esetet elkapja.) */
test("a hivatkozás-kereső maga működik (különben a teszt némán semmit sem őrizne)", () => {
    assert.ok(found.length > 100,
        `Csak ${found.length} fájl-hivatkozást találtam a kommentekben. A minta vagy a ` +
        "bejárás elromlott — enélkül ez a teszt zölden futna, és semmit nem ellenőrizne.");
});

test("minden kommentben említett fájl LÉTEZIK", () => {
    const broken = found
        .filter(({reference}) => !(reference in NOT_OUR_FILES))
        .filter(({reference}) => !known.some(
            (file) => file === reference || file.endsWith(path.sep + reference)))
        .map(({file, reference}) => `${file} -> ${reference}`);

    assert.deepStrictEqual([...new Set(broken)].sort(), [],
        "Ezek a kommentek nem létező fájlra hivatkoznak. Vagy elavult a név (átnevezés, " +
        "mappa-váltás, nyelv-átállás), vagy elgépelés — mindkettő elrontja azt a " +
        "grep-es felderíthetőséget, amit a CLAUDE.md az ELTÉRÉS-kommentektől megkövetel. " +
        "Ha a hivatkozás SZÁNDÉKOSAN nem repo-fájl, vedd fel a NOT_OUR_FILES listába, indokkal.");
});
