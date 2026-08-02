/* A napi mentés KAPUJA: minden modellnek nyilatkoznia kell arról, hogy a napi
   export menti-e (scripts/exportSections.js).

   Miért kap ez saját hálót? Mert a mentésből kimaradás a legcsendesebb hiba a
   projektben: nem kivétel, nem hibás válasz, nem is lassulás — egyszerűen nincs
   fájl. Semmi nem jelez, amíg valaki vissza nem akar állítani. A felderítő ezt
   hangossá teszi (nyilatkozat nélküli modell = elszálló export), ez a teszt
   pedig előrehozza az elszállást ÉJJEL EGYRŐL a commit pillanatára.

   Két rétegben dolgozik: a hibaágakat kitalált ("fake") modellekkel járja végig
   — így nem kell ideiglenes fájlokat gyártani —, egy teszt viszont a VALÓDI
   modell-mappára fut, mert a felejtés pont ott történik. */
const test = require("node:test");
const assert = require("node:assert");
const {discoverSections, sectionsFrom} = require("./exportSections");
const Users = require("../src/models/users");

/* Modellt utánzó minimális objektum. A felderítő csak két dolgot néz rajta: a
   nyilatkozatot (exportName) és azt, hogy a séma ismeri-e a szükséges mezőket —
   ezt a `schema.path()` utánzása adja. A nyilatkozat SZÓRÁSSAL kerül be, hogy a
   "semmit nem mond magáról" eset (üres objektum) valóban hiányzó saját
   tulajdonság legyen, ne `undefined` értékű. */
function fakeModel(declaration, fields = ["user", "order", "updatedAt"]) {
    return {
        ...declaration,
        schema: {path: (name) => (fields.includes(name) ? {} : undefined)}
    };
}

test("a valódi modellek MINDEGYIKE dönt magáról (ez a kapu)", () => {
    // Ha egy új szekció modelljéből kimarad az exportName, ez a sor dob.
    const sections = discoverSections();

    for (const section of sections) {
        assert.ok(section.name.length > 0, `${section.file}: üres fájlnév-előtag`);
        assert.ok(section.model, `${section.name}: nincs modell a szekció mellett`);
    }
});

/* Nem elég, hogy "valamit mond magáról": a users-nek KIMONDOTTAN null-t kell
   mondania. Ez az egyetlen modell, aminél az export ténylegesen kárt okozna
   (jelszó-hash sima szöveges JSON-ban, amit a mentés-lehúzás más gépre is visz),
   ezért külön, névre szóló őrszem. */
test("a users SOHA nem exportálódik (jelszó-hash)", () => {
    assert.strictEqual(Users.exportName, null);
    assert.ok(!discoverSections().some((section) => section.model === Users));
});

test("a nyilatkozat nélküli modelltől a felderítés HIBÁRA fut", () => {
    assert.throws(
        () => sectionsFrom([["movies.js", fakeModel({})]]),
        /movies\.js.*exportName/s,
        "a nyilatkozat nélküli modellnek hibát kell okoznia, nem néma kihagyást");
});

test("a kimondott null kihagyást jelent, nem hibát", () => {
    const sections = sectionsFrom([
        ["quotes.js", fakeModel({exportName: "quotes"})],
        ["users.js", fakeModel({exportName: null})]
    ]);

    assert.deepStrictEqual(sections.map((section) => section.name), ["quotes"]);
});

test("az üres vagy nem-szöveg előtag hibára fut", () => {
    for (const bad of ["", "   ", 42, {}, true]) {
        assert.throws(() => sectionsFrom([["movies.js", fakeModel({exportName: bad})]]),
            /exportName/, `elfogadta ezt az előtagot: ${JSON.stringify(bad)}`);
    }
});

/* A fájlnév-előtag a fájlrendszerbe megy: az útvonal-szerű név nem elgépelés,
   hanem csendben máshová mentés (vagy kilépés az EXPORT_DIR-ből). */
test("az útvonalat tartalmazó előtag hibára fut", () => {
    for (const bad of ["../movies", "movies/2026", "/movies"]) {
        assert.throws(() => sectionsFrom([["movies.js", fakeModel({exportName: bad})]]),
            /fájlnév-előtag/, `elfogadta ezt az előtagot: ${JSON.stringify(bad)}`);
    }
});

/* A három mező, amire maga az export épül. Mindhárom hiánya CSENDBEN rontana:
   user nélkül idegen adat kerülne a fájlba, order nélkül esetleges a sorrend,
   updatedAt nélkül pedig SOHA nem születne fájl (a módosítás-vizsgálat mindig
   nullát találna) — utóbbi pont az a néma adatvesztés, ami ellen az egész
   nyilatkozat készült. */
test("a hiányzó export-mezők (user, order, updatedAt) hibára futnak", () => {
    const allFields = ["user", "order", "updatedAt"];

    for (const missing of allFields) {
        const fields = allFields.filter((field) => field !== missing);
        assert.throws(
            () => sectionsFrom([["movies.js", fakeModel({exportName: "movies"}, fields)]]),
            new RegExp(missing),
            `a hiányzó "${missing}" mezőt észre kellett volna vennie`);
    }
});

test("két szekció nem vihet azonos fájlnév-előtagot", () => {
    assert.throws(() => sectionsFrom([
        ["movies.js", fakeModel({exportName: "movies"})],
        ["films.js", fakeModel({exportName: "movies"})]
    ]), /movies\.js.*films\.js|films\.js.*movies\.js/s);
});

test("nulla mentendő szekció hibára fut, nem sikeres üres futásra", () => {
    assert.throws(() => sectionsFrom([["users.js", fakeModel({exportName: null})]]),
        /szekciót sem/);
});
