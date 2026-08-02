/* A napi mentés KAPUJA: minden modellnek nyilatkoznia kell arról, hogy a napi
   export menti-e (scripts/exportSections.js).

   Miért kap ez saját hálót? Mert a mentésből kimaradás a legcsendesebb hiba a
   projektben: nem kivétel, nem hibás válasz, nem is lassulás — egyszerűen nincs
   fájl. Semmi nem jelez, amíg valaki vissza nem akar állítani. A felderítő ezt
   hangossá teszi (nyilatkozat nélküli modell = hiba + nem-nulla kilépés), ez a
   teszt pedig előrehozza a bukást ÉJJEL EGYRŐL a commit pillanatára.

   A hibák NEM dobással jönnek, hanem a szekciók mellett, listában: a hangos
   hibának nem szabad járulékos kárt okoznia, tehát egy rossz modell mellett a
   többi szekció mentése MÉG elkészül. Ezt a viselkedést is teszt őrzi.

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

// Egy szabályos szekció, amit a hibás modellek MELLÉ teszünk: neki minden esetben meg kell maradnia.
const HEALTHY = ["quotes.js", fakeModel({exportName: "quotes"})];

test("a valódi modellek MINDEGYIKE dönt magáról (ez a kapu)", () => {
    const {sections, errors} = discoverSections();

    // Ha egy új szekció modelljéből kimarad az exportName, itt fog kibukni, névvel.
    assert.deepStrictEqual(errors, []);
    for (const section of sections) {
        assert.ok(section.name.length > 0, `${section.file}: üres fájlnév-előtag`);
        assert.ok(section.model, `${section.name}: nincs modell a szekció mellett`);
    }
});

/* Nem elég, hogy "valamit mond magáról": a users-nek KIMONDOTTAN null-t kell
   mondania. Ez az egyetlen modell, aminél az export ténylegesen kárt okozna
   (jelszó-hash sima szöveges JSON-ban, harminc példányban), ezért külön, névre
   szóló őrszem. */
test("a users SOHA nem exportálódik (jelszó-hash)", () => {
    assert.strictEqual(Users.exportName, null);
    assert.ok(!discoverSections().sections.some((section) => section.model === Users));
});

test("a nyilatkozat nélküli modell HIBÁT okoz, néven nevezve", () => {
    const {errors} = sectionsFrom([["movies.js", fakeModel({})]]);

    assert.strictEqual(errors.length, 1);
    assert.match(errors[0], /movies\.js.*exportName/s);
});

/* A keményítés lényege: a hangos hiba nem viheti magával a működő mentéseket.
   Enélkül egy elfelejtett nyilatkozat MINDEN szekció aznapi mentését elhagyná —
   vagyis a néma adatvesztés helyébe egy hangos, de nagyobb adatvesztés lépne. */
test("egy rossz modell mellett a többi szekció MÉG exportálódik", () => {
    const {sections, errors} = sectionsFrom([["movies.js", fakeModel({})], HEALTHY]);

    assert.deepStrictEqual(sections.map((section) => section.name), ["quotes"]);
    assert.strictEqual(errors.length, 1);
});

test("a kimondott null kihagyást jelent, nem hibát", () => {
    const {sections, errors} = sectionsFrom([HEALTHY, ["users.js", fakeModel({exportName: null})]]);

    assert.deepStrictEqual(sections.map((section) => section.name), ["quotes"]);
    assert.deepStrictEqual(errors, []);
});

test("az üres vagy nem-szöveg előtag hibát okoz", () => {
    for (const bad of ["", "   ", 42, {}, true]) {
        const {errors} = sectionsFrom([["movies.js", fakeModel({exportName: bad})]]);
        assert.match(errors.join("\n"), /exportName/, `elfogadta ezt az előtagot: ${JSON.stringify(bad)}`);
    }
});

/* A fájlnév-előtag a fájlrendszerbe megy: az útvonal-szerű név nem elgépelés,
   hanem csendben máshová mentés (vagy kilépés az EXPORT_DIR-ből). */
test("az útvonalat tartalmazó előtag hibát okoz", () => {
    for (const bad of ["../movies", "movies/2026", "/movies"]) {
        const {errors} = sectionsFrom([["movies.js", fakeModel({exportName: bad})]]);
        assert.match(errors.join("\n"), /fájlnév-előtag/, `elfogadta ezt az előtagot: ${JSON.stringify(bad)}`);
    }
});

/* A három mező, amire maga az export épül. Mindhárom hiánya CSENDBEN rontana:
   user nélkül idegen adat kerülne a fájlba, order nélkül esetleges a sorrend,
   updatedAt nélkül pedig SOHA nem születne fájl (a módosítás-vizsgálat mindig
   nullát találna) — utóbbi pont az a néma adatvesztés, ami ellen az egész
   nyilatkozat készült. */
test("a hiányzó export-mezők (user, order, updatedAt) hibát okoznak", () => {
    const allFields = ["user", "order", "updatedAt"];

    for (const missing of allFields) {
        const fields = allFields.filter((field) => field !== missing);
        const {sections, errors} = sectionsFrom([["movies.js", fakeModel({exportName: "movies"}, fields)]]);

        assert.deepStrictEqual(sections, [], `a hibás modell nem exportálható (hiányzó "${missing}")`);
        assert.match(errors.join("\n"), new RegExp(missing),
            `a hiányzó "${missing}" mezőt észre kellett volna vennie`);
    }
});

/* Azonos előtagnál a két szekció ugyanabba a fájlba írna, és a retenciójuk is
   keveredne — ezért EGYIKET SEM exportáljuk, de a harmadik, vétlen szekció megy. */
test("két szekció nem vihet azonos fájlnév-előtagot — egyiket sem exportáljuk", () => {
    const {sections, errors} = sectionsFrom([
        ["movies.js", fakeModel({exportName: "movies"})],
        ["films.js", fakeModel({exportName: "movies"})],
        HEALTHY
    ]);

    assert.deepStrictEqual(sections.map((section) => section.name), ["quotes"]);
    assert.match(errors.join("\n"), /movies\.js.*films\.js/s);
});

test("nulla mentendő szekció hibát okoz, nem sikeres üres futást", () => {
    const {errors} = sectionsFrom([["users.js", fakeModel({exportName: null})]]);

    assert.match(errors.join("\n"), /szekciót sem/);
});
