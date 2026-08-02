/* A tulajdon-szabály tesztjei. Ez a projekt legfontosabb biztonsági döntése —
   az, hogy egy elemhez csak a tulajdonosa fér hozzá —, ezért önálló hálót kap,
   nem csak a végpontok tesztjeiben él.

   Kulcsállítás: a "nincs ilyen elem" és a "van, de nem a tiéd" eset MEGKÜLÖNBÖZ-
   TETHETETLEN. Ha valaha valaki "javításként" külön 404-et adna a hiányzóra, ez
   a teszt bukna — pedig épp az azonosság az, ami az azonosító-próbálgatással
   való felderítést értelmetlenné teszi. */
const test = require("node:test");
const assert = require("node:assert");
const {findOwned, forbidden} = require("./ownership");

const OWNER = "user-1";
const STRANGER = "user-2";
const ITEM = {_id: "item-1", user: OWNER, title: "Sajátom"};

const Model = {
    findById: (id) => Promise.resolve(String(id) === ITEM._id ? ITEM : null),
};

test("a tulajdonos megkapja az elemet", async () => {
    assert.strictEqual(await findOwned(Model, ITEM._id, OWNER), ITEM);
});

test("IDEGEN nem kapja meg (null)", async () => {
    assert.strictEqual(await findOwned(Model, ITEM._id, STRANGER), null);
});

test("nem létező elemre ugyanaz a null — a létezést sem áruljuk el", async () => {
    assert.strictEqual(await findOwned(Model, "nincs-ilyen", OWNER), null);
});

/* FAIL CLOSED: ha az azonosító nem szöveg (hanem pl. egy objektum, aminek a
   toString-je a helyes id-t adná), az összehasonlítás nem "majdnem egyezik",
   hanem MEGTAGAD. Kétes bemenetnél a hozzáférés-vezérlés mindig a szigorúbb
   irányba dőljön.

   FIGYELEM — ez a teszt NEM őrzi a `user` mező típusváltását. Ha a mező valaha
   ObjectId lenne (ma szöveg, l. models/todos.js), a szigorú === mindig hamisat
   adna, azaz MINDENKI 403-at kapna a sajátjára — és ez a teszt ATTÓL MÉG ZÖLD
   MARADNA, hiszen épp a típuseltérés elutasítását állítja. A típusváltás tehát
   ennek a tesztnek ÉS az ownership.js összehasonlításának EGYÜTTES átírását
   kívánja; erre a felelősségre a modul kommentje figyelmeztet. */
test("nem-szöveg azonosító esetén MEGTAGAD (fail closed)", async () => {
    const objectLikeUser = {toString: () => OWNER};

    assert.strictEqual(await findOwned(Model, ITEM._id, objectLikeUser), null);
});

test("az elutasítás 403, egységes üzenettel", () => {
    const captured = {};
    const response = {
        status(code) { captured.code = code; return this; },
        json(body) { captured.body = body; return this; },
    };

    forbidden(response);

    assert.strictEqual(captured.code, 403);
    assert.strictEqual(captured.body, "Nincs jogosultságod.");
});
