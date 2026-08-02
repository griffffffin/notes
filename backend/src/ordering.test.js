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
const {shiftForInsert, shiftForDelete, shiftForMove} = require("./ordering");

const USER = "user-1";

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

    await shiftForInsert(Model, USER, 3);

    assert.strictEqual(Model.calls.length, 1);
    assert.deepStrictEqual(Model.calls[0].filter, {user: USER, order: {$gte: 3}});
    assert.strictEqual(Model.calls[0].update.$inc.order, 1);
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
