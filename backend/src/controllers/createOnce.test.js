/* AZ IDEMPOTENS LÉTREHOZÁS tesztjei — adatbázis nélkül, a modellt hívás-rögzítő
   mockra cserélve (mint az ordering.test.js).

   Amit itt számon kérünk, az nem "működik-e a mentés", hanem a LÉPÉSEK SORRENDJE
   és az ütközés kétágú kezelése. Ez a modul ugyanis egyetlen dolog miatt létezik:
   tranzakció nincs (mérve: a FerretDB v2 `commitTransaction` parancsot sem
   ismer), tehát az egyedi `_id`-index az EGYETLEN atomi kapunk arra, hogy egy
   megismételt kérés ne hozzon létre másodpéldányt. Ha a sorrend megfordul, a kapu
   némán hatástalanná válik: minden zöld marad, csak épp duplikálódnak az elemek. */
const test = require("node:test");
const assert = require("node:assert");
const {createOnce} = require("./createOnce");

const USER = "user-1";
const OTHER_USER = "user-2";
const NEW_ID = "507f1f77bcf86cd799439011";

const duplicateKeyError = () => Object.assign(new Error("E11000 duplicate key"), {code: 11000});

/* A mock a HÍVÁSOK SORRENDJÉT is rögzíti, nem csak a tényüket: a beszúrás és a
   tolás egymáshoz képesti helye maga a vizsgált viselkedés. */
const mockModel = ({saveError = null, shiftError = null, existing = undefined, generatedId = null} = {}) => {
    const steps = [];
    function Model(data) { Object.assign(this, data); }
    /* A `save()` a MENTETT dokumentumot adja vissza — ahogy a Mongoose is. Ha a
       hívó nem adott azonosítót, a mentés generál egyet: ezt mintázza a
       `generatedId`. */
    Model.prototype.save = function () {
        steps.push("save");
        if (saveError) return Promise.reject(saveError);
        if (this._id === undefined && generatedId) this._id = generatedId;
        return Promise.resolve(this);
    };
    Model.findById = (id) => { steps.push("findById:" + id); return Promise.resolve(existing); };
    Model.findByIdAndDelete = (id) => { steps.push("delete:" + id); return Promise.resolve(null); };
    Model.steps = steps;
    Model.shift = (model, userId, order, insertedId) => {
        steps.push(`shift:${userId}:${order}:${insertedId}`);
        return shiftError ? Promise.reject(shiftError) : Promise.resolve();
    };
    return Model;
};

const run = (Model) => createOnce({
    Model, userId: USER, order: 2, shift: Model.shift,
    document: {_id: NEW_ID, user: USER, order: 2, title: "Új"},
});

test("előbb SZÚR BE, és csak utána tol — ez a sorrend maga a védelem", async () => {
    const Model = mockModel();

    const created = await run(Model);

    assert.strictEqual(created, true);
    assert.deepStrictEqual(Model.steps, ["save", `shift:${USER}:2:${NEW_ID}`]);
});

test("a MEGISMÉTELT kérés nem hoz létre újat, és NEM is tol", async () => {
    /* A duplikált kulcs azt jelenti, hogy ez a létrehozás már megtörtént. A tolás
       ilyenkor kártétel volna: mindenkit eltolna egy olyan beszúrás miatt, ami
       már korábban megvolt — pontosan ez rontotta el a sorszámozást. */
    const Model = mockModel({saveError: duplicateKeyError(), existing: {_id: NEW_ID, user: USER}});

    const created = await run(Model);

    assert.strictEqual(created, false, "nem MOST jött létre");
    assert.deepStrictEqual(Model.steps, ["save", "findById:" + NEW_ID]);
});

test("IDEGEN elemmel ütköző azonosító NEM számít sikernek", async () => {
    /* Az azonosítót a kliens adja, tehát kitalálhat olyat is, ami már valaki másé.
       Ilyenkor nem mondunk sikert (az azt jelentené, hogy a mentése megvan), és
       nem is áruljuk el, hogy az az azonosító létezik — a hívó általános
       szerverhibát kap, a napló pedig megkapja az esetet. */
    const Model = mockModel({saveError: duplicateKeyError(), existing: {_id: NEW_ID, user: OTHER_USER}});

    await assert.rejects(run(Model), (error) => error.code === 11000);
    assert.deepStrictEqual(Model.steps, ["save", "findById:" + NEW_ID]);
});

test("ütköző azonosító, de a dokumentum nincs meg: szintén nem siker", async () => {
    // Elvi eset (időzítés), de a kód nem eshet át rajta csendben.
    const Model = mockModel({saveError: duplicateKeyError(), existing: null});

    await assert.rejects(run(Model), (error) => error.code === 11000);
});

test("azonosító NÉLKÜL a MENTETT dokumentumé kerül az eltolás kizárásába", async () => {
    /* A hívó elhagyhatja az azonosítót (ilyenkor a Mongoose generál). Az eltolás
       ekkor sem tolhatja el magát az új elemet — a kizárásnak a MENTETT dokumentum
       azonosítójára kell épülnie, nem a (hiányzó) bemenetire. */
    const Model = mockModel({generatedId: "aaaaaaaaaaaaaaaaaaaaaaaa"});

    await createOnce({
        Model, userId: USER, order: 2, shift: Model.shift,
        document: {user: USER, order: 2, title: "Új"},
    });

    assert.deepStrictEqual(Model.steps, ["save", `shift:${USER}:2:aaaaaaaaaaaaaaaaaaaaaaaa`]);
});

test("NEM duplikált hibát változatlanul továbbenged", async () => {
    const Model = mockModel({saveError: Object.assign(new Error("hálózat"), {code: 42})});

    await assert.rejects(run(Model), (error) => error.code === 42);
    // Nem keresgélünk: a duplikált kulcs az EGYETLEN eset, amit értelmezünk.
    assert.deepStrictEqual(Model.steps, ["save"]);
});

test("ha a TOLÁS bukik el, visszaveszi a beszúrást", async () => {
    /* Enélkül két elem maradna ugyanazon a sorszámon. Az ütközés rosszabb, mint a
       hézag: a rendezés és a húzás is a sorszámokból dolgozik. */
    const Model = mockModel({shiftError: new Error("adatbázis")});

    await assert.rejects(run(Model), {message: "adatbázis"});
    assert.deepStrictEqual(Model.steps, ["save", `shift:${USER}:2:${NEW_ID}`, "delete:" + NEW_ID]);
});
