/* OLVASÓ-QUERY SCOPE — minden controller a KÉRŐRE szűr (forrás-szken).

   A projekt legfontosabb szabálya, hogy egy lista csak a kérő elemeit adja ki
   (l. ownership.js). A LISTA-végpontok ezt a `findOwnedList`-en át teszik, és azt
   az ownershipBoundary.test.js viselkedésből őrzi. A KÉZZEL szűrő olvasó-végpontok
   (pl. a to-do szűrt nézetei) a `user`-t közvetlenül a lekérdezésbe teszik — egy
   közös helper nem mindig tudja kiszolgálni őket, tehát a `user`-szűrő kézzel van
   bennük. Egy JÖVŐBELI keresés- vagy aggregáció-végpont, ami elfelejti a `user`-t,
   nem egy elemet, hanem MINDENKI adatát adná ki — némán, mert semmi nem hibázik.

   (A korábban itt névvel példázott idézet-kereső/aggregáló végpontok az
   E2EE-átállással megszűntek; a kliens-oldali keresés F3-ban jön.) A viselkedés-teszt (adott
   bemenetre adott válasz) ezt nem fogja meg: a hiányzó szűrő csak akkor derülne
   ki, ha egy MÁSIK felhasználó adata is a DB-ben van, és épp illeszkedik.

   EZ A KAPU FORRÁSBÓL dolgozik: minden controller-fájlt, ami OLVASÓ collection-
   query-t hív (find/findOne/findById/aggregate/exists/distinct/countDocuments),
   megköveteli, hogy a tulajdon-scope BIZONYÍTVA legyen — vagy `request.userId`-re
   hivatkozik (a tokenből vett kérő, sosem a törzsből), vagy a `findOwnedList`/
   `findOwned` helpert használja. Ami egyiket sem teszi, az csak INDOKKAL kerülhet
   az allowlistre (mint az authBoundary PUBLIC_ROUTES-a).

   MIÉRT CSAK OLVASÓK. Az ÍRÁS per-elem végpontjait (update/delete/reorder) a
   requireOwnership middleware zárja (request.item a saját elem), és azt az
   ownershipBoundary.test.js derived-teszttel őrzi — ott a findByIdAndUpdate/Delete
   már csak a saját elemre fut. Itt a másik osztályt fogjuk: a collection-szintű
   OLVASÁST, ahol a hiányzó szűrő nem egy, hanem az összes fiók adatát adná.

   A KAPU ÖNMAGA IS NÉMÁN ELROMOLHAT (l. [[source-scanning-guards-two-shapes]]): ha
   a felismerő regex elromlik, üresen futna és zölden hazudna. Ezért az osztályozó
   TISZTA függvény (fs-mentes), és mutáció-próbával, kontrollokkal állítjuk, hogy
   tényleg diszkriminál; a valós sweep mellett külön kontroll követeli meg, hogy
   legyen mit vizsgálnia. */
const {describe, it} = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const CONTROLLERS_DIR = path.join(__dirname, "controllers");

/* OLVASÓ collection-query-metódusok. A find/findOne/findById/aggregate/exists/
   distinct/countDocuments MIND vissza tud adni idegen dokumentumot, ha a szűrő
   nem a kérőre szűkít. Az ÍRÓ metódusok (findByIdAndUpdate, findByIdAndDelete,
   updateOne, save) SZÁNDÉKOSAN kimaradnak: azokat a requireOwnership gate fedi.

   A `\.` és a `\s*\(` a kulcs: a `\.findOne\(` nem illeszkedik a
   `findOneAndUpdate(`-re (utána nem `(` jön), a bare `findOwnedList(` pedig `.`
   nélkül van, tehát a helper hívása NEM számít nyers query-nek. */
const READER_QUERY =
    /\.\s*(?:find|findOne|findById|aggregate|exists|distinct|countDocuments)\s*\(/;

/* A tulajdon-scope bizonyítéka: a tokenből vett kérőre hivatkozik, VAGY a
   szűrést egy helyen tartó ownership-helperek VALAMELYIKÉT használja (l.
   ownership.js — mind a `user` kulcsot utoljára injektálja, nem felejthető el). */
const SCOPE_EVIDENCE = /\brequest\.userId\b/;
const OWNERSHIP_HELPER =
    /\b(?:findOwned|findOwnedList|findOneOwned|existsOwned|countOwned|ownedMatch)\b/;

/* AZ ALLOWLIST — és hogy MIÉRT szabad tulajdon-scope NÉLKÜL olvasnia. Bővíteni
   csak tudatosan, indokkal (mint az authBoundary PUBLIC_ROUTES-a). A kulcs a
   controllers/-hez relatív, POSIX-elválasztóval. */
const ALLOWED_WITHOUT_SCOPE = {
    /* A korábbi publikus megosztott idézet-végpont az E2EE-átállással MEGSZŰNT — a
       publikus megosztás a külön menetben, a Shared táblára épül. */
    "Users/login.js":
        "PRE-AUTH: a fiókot NÉV szerint keresi a hitelesítéshez — még nincs kérő, " +
        "akire szűrni lehetne (a request.userId-t épp ez a végpont alapozza meg).",
    /* A createOnce.js NEM allowlistes: a duplikált-kulcs ágon a KÖZÖS findOwned-et
       használja (l. createOnce.js), tehát a scope-bizonyíték kimutatja — a kapu
       maga engedi át, nem kivétel. Ez a maradék két bejegyzés viszont
       irreducibilis: publikus és pre-auth végpont, nincs kérő, amire szűrni. */
};

/* Egy fájl megítélése — TISZTA függvény (se fs, se hálózat), hogy kitalált
   forrásokkal, mutáció-próbával is meg tudjuk szólítani. */
function readerScopeVerdict(relPath, source) {
    const hasReaderQuery = READER_QUERY.test(source);
    const scoped = SCOPE_EVIDENCE.test(source) || OWNERSHIP_HELPER.test(source);
    const allowlisted = Object.hasOwn(ALLOWED_WITHOUT_SCOPE, relPath);
    return {hasReaderQuery, scoped, allowlisted,
        violation: hasReaderQuery && !scoped && !allowlisted};
}

/* A controllers/ rekurzív bejárása — csak a nem-teszt .js fájlok. (A TS-átállás
   ide is elér majd; a .[jt]s minta előre felkészül rá, l. exportSections.js.) */
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

describe("olvasó-query scope: minden controller a kérőre szűr (forrás-szken)", () => {
    const files = controllerFiles().sort();
    const scanned = files.map((full) => {
        const relPath = relKey(full);
        return {relPath, ...readerScopeVerdict(relPath, fs.readFileSync(full, "utf8"))};
    });

    /* KONTROLL a néma üres-találat ellen: ha a felismerő regex vagy a bejárás
       elromlik, a sweep üresen futna, és zölden jelentene semmit. Ma az EGYETLEN
       nyers-olvasó a `Users/login.js` (pre-auth, allowlistelt): minden más olvasás a
       findOwnedList/findOwned/lastOrder helpereken megy (a `.` nélküli hívás nem
       számít nyers query-nek). Az E2EE-átállás előtt a scope-olt idézet-kereső/
       -aggregáló végpontok is idekerültek — azok megszűntek, ezért csökkent a szám 1-re.
       A küszöb így >= 1: egy üres sweep (elromlott regex) továbbra is BUKTAT. Az
       osztályozó tényleges DISZKRIMINÁLÁSÁT a lenti mutáció-próba állítja, kontrollal. */
    it("a szken talál olvasó-query-t hívó fájlokat (különben a kapu üresen zöldülne)", () => {
        const withReader = scanned.filter((file) => file.hasReaderQuery);
        assert.ok(withReader.length >= 1,
            `csak ${withReader.length} olvasó-query-t hívó controllert találtam — a felismerő elromlott?`);
    });

    it("nincs tulajdon-scope NÉLKÜLI, nem allowlistelt olvasó-controller", () => {
        const offenders = scanned.filter((file) => file.violation).map((file) => file.relPath);
        assert.deepStrictEqual(offenders, [],
            "Olyan controller olvas collection-query-vel, ami nem szűr a kérőre (request.userId) és " +
            "nem is használ findOwnedList/findOwned helpert. Ha ez szándékos (publikus/pre-auth), vedd " +
            `fel az ALLOWED_WITHOUT_SCOPE listába az indokával; ha nem, szűrj a kérőre. Vétkes(ek): ${offenders.join(", ")}`);
    });

    /* KONTROLL: minden allowlist-bejegyzés VALÓBAN létező fájlra szól, és tényleg
       scope NÉLKÜLI olvasó (különben az allowlist elavult, és egy jövőbeli hibát
       csendben elfedne). */
    it("az allowlist minden bejegyzése létező, scope nélküli olvasóra szól (nem elavult)", () => {
        for (const relPath of Object.keys(ALLOWED_WITHOUT_SCOPE)) {
            const file = scanned.find((entry) => entry.relPath === relPath);
            assert.ok(file, `az allowlist "${relPath}"-ra hivatkozik, de ilyen controller nincs — elavult bejegyzés?`);
            assert.ok(file.hasReaderQuery,
                `az allowlist "${relPath}"-ot ment, de az nem hív olvasó-query-t — fölösleges bejegyzés?`);
            assert.ok(!file.scoped,
                `az allowlist "${relPath}"-ot ment, de az MÁR a kérőre szűr — vedd ki az allowlistből (a scope őrzi).`);
        }
    });
});

/* MUTÁCIÓ-PRÓBA az osztályozón: a fenti "átmegy" csak akkor bizonyít, ha a
   függvény tényleg megkülönbözteti a scope-olt és a scope nélküli olvasót. */
describe("olvasó-query scope: az osztályozó diszkriminál (kontroll)", () => {
    it("scope NÉLKÜLI olvasó, nem allowlistelt → VÉTSÉG", () => {
        assert.strictEqual(readerScopeVerdict("Fake/read.js", "Model.find({})").violation, true);
        assert.strictEqual(readerScopeVerdict("Fake/read.js", "Model.aggregate([{$match: {}}])").violation, true);
    });
    it("request.userId-re szűrő olvasó → NEM vétség", () => {
        assert.strictEqual(
            readerScopeVerdict("Fake/read.js", "Model.find({user: request.userId})").violation, false);
    });
    it("findOwnedList-et használó olvasó → NEM vétség", () => {
        assert.strictEqual(
            readerScopeVerdict("Fake/read.js", 'require("../../ownership"); Model.find({}); findOwnedList(M, x)').violation,
            false);
    });
    it("allowlistelt, scope nélküli olvasó → NEM vétség", () => {
        assert.strictEqual(readerScopeVerdict("Users/login.js", "Model.findOne({name})").violation, false);
    });
    it("olvasó-query NÉLKÜLI fájl → NEM vétség (akkor sem, ha nincs request.userId)", () => {
        assert.strictEqual(readerScopeVerdict("Fake/util.js", "response.json(request.item)").violation, false);
    });
    it("a findOwnedList bare hívása NEM számít nyers reader-query-nek", () => {
        // A helper hívása (`.` nélkül) nem lehet a hiányzó szűrő forrása — a szűrő a helperben van.
        assert.strictEqual(readerScopeVerdict("Fake/read.js", "findOwnedList(Model, request.userId)").hasReaderQuery, false);
    });
    it("a findOneAndUpdate (ÍRÓ) nem olvasó-query", () => {
        assert.strictEqual(readerScopeVerdict("Fake/write.js", "Model.findOneAndUpdate({_id}, {})").hasReaderQuery, false);
    });
});
