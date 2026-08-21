/* A sorszámozott lista szabályának tesztjei — adatbázis nélkül, a modellt egy
   hívás-rögzítő mockra cserélve. Azt vizsgáljuk, hogy MILYEN updateMany-t kap az
   adatbázis: a szűrő intervalluma és az eltolás iránya a lista integritásának
   lelke (egy elrontott $gte/$gt lyukat vagy ütközést hagyna a sorszámokban).

   Ez a modul-szintű háló szándékosan MEGKETTŐZI a controller-tesztek (Todos/,
   Quotes/ ordering.test.js) állításait: azok azt bizonyítják, hogy a VÉGPONTOK a
   helyes műveletet hívják, ez pedig azt, hogy a MŰVELET maga helyes — a kettő
   együtt fedi le a láncot, és egy jövőbeli szekció már ingyen kapja az utóbbit. */
const test = require("node:test");
const assert = require("node:assert");
const {shiftForInsert, shiftForDelete, shiftForMove,
    undoShiftForDelete, undoShiftForMove} = require("./ordering");

const USER = "user-1";
// Az imént beszúrt elem azonosítója — az eltolásból ki kell maradnia.
const INSERTED = "507f1f77bcf86cd799439011";

// A modell egyetlen dolga itt, hogy megjegyezze, mivel hívták.
const mockModel = () => {
    const calls = [];
    return {
        calls,
        updateMany: (filter, update) => { calls.push({filter, update}); return Promise.resolve({}); },
    };
};

test("beszúrás: a helyen álló ÉS a fölötte lévők ($gte) eggyel lejjebb csúsznak", async () => {
    const Model = mockModel();

    await shiftForInsert(Model, USER, 3, INSERTED);

    assert.strictEqual(Model.calls.length, 1);
    assert.deepStrictEqual(Model.calls[0].filter, {user: USER, order: {$gte: 3}, _id: {$ne: INSERTED}});
    assert.strictEqual(Model.calls[0].update.$inc.order, 1);
});

/* AZ ÚJ ELEM KIHAGYÁSA nem apróság: a beszúrás MEGELŐZI a tolást (az egyedi
   `_id`-index a mi atomi kapunk az ismételt kérés ellen, l. createOnce.js), és az
   új dokumentum maga is a `>= order` tartományban áll. Kihagyás nélkül tehát
   magát tolná el eggyel, és pont a saját helyén maradna hézag. */
test("beszúrás: az ÉPP BESZÚRT elemet kihagyja az eltolásból", async () => {
    const Model = mockModel();

    await shiftForInsert(Model, USER, 1, INSERTED);

    assert.deepStrictEqual(Model.calls[0].filter._id, {$ne: INSERTED});
});

test("törlés: csak a törölt FÖLÖTT állók ($gt) csúsznak feljebb", async () => {
    const Model = mockModel();

    await shiftForDelete(Model, USER, 3);

    assert.strictEqual(Model.calls.length, 1);
    assert.deepStrictEqual(Model.calls[0].filter, {user: USER, order: {$gt: 3}});
    assert.strictEqual(Model.calls[0].update.$inc.order, -1);
});

test("mozgatás felfelé (5 → 2): a [2, 5) intervallum eggyel lejjebb", async () => {
    const Model = mockModel();

    await shiftForMove(Model, USER, 5, 2);

    assert.deepStrictEqual(Model.calls[0].filter, {user: USER, order: {$gte: 2, $lt: 5}});
    assert.strictEqual(Model.calls[0].update.$inc.order, 1);
});

test("mozgatás lefelé (5 → 8): a (5, 8] intervallum eggyel feljebb", async () => {
    const Model = mockModel();

    await shiftForMove(Model, USER, 5, 8);

    assert.deepStrictEqual(Model.calls[0].filter, {user: USER, order: {$lte: 8, $gt: 5}});
    assert.strictEqual(Model.calls[0].update.$inc.order, -1);
});

test("mozgatás ugyanoda: NINCS adatbázis-hívás (nem írunk fölöslegesen)", async () => {
    const Model = mockModel();

    await shiftForMove(Model, USER, 5, 5);

    assert.strictEqual(Model.calls.length, 0);
});

/* A szomszédok updatedAt-je is frissül. Ez nem kozmetika: a napi export ebből
   dönti el, volt-e változás az előző napon — enélkül egy csak-átrendezéses nap
   kimaradna a mentésből. */
test("minden eltolás frissíti az érintettek updatedAt-jét", async () => {
    const Model = mockModel();

    await shiftForInsert(Model, USER, 1);
    await shiftForDelete(Model, USER, 1);
    await shiftForMove(Model, USER, 5, 2);

    for (const call of Model.calls) assert.ok(call.update.$set.updatedAt instanceof Date);
});

/* A szűrő MINDIG tartalmazza a felhasználót. Ez a legdrágább elrontható részlet:
   user nélkül egy beszúrás MINDEN felhasználó sorszámait eltolná. */
test("minden eltolás a saját felhasználóra szűkít", async () => {
    const Model = mockModel();

    await shiftForInsert(Model, USER, 1);
    await shiftForDelete(Model, USER, 1);
    await shiftForMove(Model, USER, 5, 2);

    for (const call of Model.calls) assert.strictEqual(call.filter.user, USER);
});

/* A VISSZAVÉTELEK ODA-VISSZA PRÓBÁJA.

   A fenti tesztek azt nézik, MILYEN updateMany megy ki. Ez a blokk mást kérdez:
   ha az eltolás megtörtént, de a rá következő írás elbukott, a visszavétel
   TÉNYLEG az eredeti állapotot állítja-e helyre? Ehhez a szűrőt nem elég
   megnézni — alkalmazni kell.

   Ezért a mock itt nem csak jegyzetel, hanem VÉGRE IS HAJTJA az updateMany-t egy
   memóriabeli listán. Így az állítás nem a szűrő alakjáról szól (amit el lehet
   olvasni a kódból is), hanem az EREDMÉNYRŐL: a lista sorszámai visszaállnak. */
const applyingModel = (items) => {
    const state = items.map((item) => ({...item}));
    const matches = (item, filter) => {
        if (item.user !== filter.user) return false;
        const range = filter.order ?? {};
        if (range.$gte !== undefined && item.order < range.$gte) return false;
        if (range.$gt !== undefined && item.order <= range.$gt) return false;
        if (range.$lte !== undefined && item.order > range.$lte) return false;
        if (range.$lt !== undefined && item.order >= range.$lt) return false;
        if (filter._id !== undefined && item._id === filter._id.$ne) return false;
        return true;
    };
    return {
        state,
        orders: () => state.map((item) => item.order),
        updateMany: (filter, update) => {
            for (const item of state) if (matches(item, filter)) item.order += update.$inc.order;
            return Promise.resolve({});
        },
    };
};

const LIST = () => [1, 2, 3, 4, 5].map((order) => ({_id: "id-" + order, user: USER, order}));

test("a szimulátor tényleg tol (kontroll: enélkül minden oda-vissza próba üres)", async () => {
    const Model = applyingModel(LIST());

    await shiftForInsert(Model, USER, 3, "nincs-ilyen");

    assert.deepStrictEqual(Model.orders(), [1, 2, 4, 5, 6]);
});

test("TÖRLÉS eltolása és visszavétele: a lista visszaáll", async () => {
    /* A félbemaradt törlés: a szomszédok már feljebb csúsztak, a törlendő elem
       viszont MÉG megvan — épp ez az ütközés, amit a visszavétel felold. */
    const Model = applyingModel(LIST());
    const deleted = {id: "id-3", order: 3};

    await shiftForDelete(Model, USER, deleted.order);
    assert.deepStrictEqual(Model.orders(), [1, 2, 3, 3, 4], "a félbemaradt állapot: ÜTKÖZÉS");

    await undoShiftForDelete(Model, USER, deleted.order, deleted.id);

    assert.deepStrictEqual(Model.orders(), [1, 2, 3, 4, 5]);
});

test("MOZGATÁS FELFELÉ eltolása és visszavétele: a lista visszaáll", async () => {
    const Model = applyingModel(LIST());

    await shiftForMove(Model, USER, 5, 2);
    assert.deepStrictEqual(Model.orders(), [1, 3, 4, 5, 5], "a mozgatott elem még a régi helyén");

    await undoShiftForMove(Model, USER, 5, 2, "id-5");

    assert.deepStrictEqual(Model.orders(), [1, 2, 3, 4, 5]);
});

test("MOZGATÁS LEFELÉ eltolása és visszavétele: a lista visszaáll", async () => {
    const Model = applyingModel(LIST());

    await shiftForMove(Model, USER, 1, 4);
    assert.deepStrictEqual(Model.orders(), [1, 1, 2, 3, 5], "a mozgatott elem még a régi helyén");

    await undoShiftForMove(Model, USER, 1, 4, "id-1");

    assert.deepStrictEqual(Model.orders(), [1, 2, 3, 4, 5]);
});

test("MINDEN mozgatás-pár visszafordítható (a teljes tartomány végigpróbálva)", async () => {
    /* Nem egy-két kiszemelt eset: az 1..5 lista MINDEN (honnan, hova) párja. Egy
       elrontott intervallum-vég ($gt vs $gte) így nem tud kicsúszni a próbából. */
    for (let from = 1; from <= 5; from++) {
        for (let to = 1; to <= 5; to++) {
            const Model = applyingModel(LIST());

            await shiftForMove(Model, USER, from, to);
            await undoShiftForMove(Model, USER, from, to, "id-" + from);

            assert.deepStrictEqual(Model.orders(), [1, 2, 3, 4, 5], `${from} → ${to}`);
        }
    }
});

test("MINDEN törlés-hely visszafordítható", async () => {
    for (let order = 1; order <= 5; order++) {
        const Model = applyingModel(LIST());

        await shiftForDelete(Model, USER, order);
        await undoShiftForDelete(Model, USER, order, "id-" + order);

        assert.deepStrictEqual(Model.orders(), [1, 2, 3, 4, 5], "törlés a(z) " + order + ". helyről");
    }
});
