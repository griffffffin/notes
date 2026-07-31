/* A BETŰMÉRET tartománya KÉT helyen van kimondva, szándékosan:

     - a Mongoose-sémán (models/quote.js: min/max) — ez az utolsó védvonal, ami
       akkor is véd, ha egy jövőbeli végpont megkerülné a middleware-t;
     - a bemenet-ellenőrzésben (validateQuote.js: MIN/MAX_FONTSIZE) — ez utasítja
       el a rossz kérést olvasható üzenettel, mielőtt az adatbázisig jutna.

   A két réteg függetlensége ÉRTÉK (ezért nem vontuk össze őket), az elcsúszásuk
   viszont néma hiba: ha a middleware tágabb, a séma dobja el a mentést egy csúf
   500-zal; ha szűkebb, a felhasználó olyat nem tud beállítani, amit a rendszer
   amúgy elfogadna. Egyik esetben sem hibázik semmi ott, ahol a hibát elrontották.

   Ezért a tartomány HATÁRAIT vetjük össze: a séma opcióit közvetlenül olvassuk,
   a middleware-t pedig a határértékek körül próbáljuk ki. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const request = require("supertest");
const Quote = require("../models/quote");
const {validateQuoteBody} = require("./validateQuote");

// A séma a forrás: innen olvassuk ki, mit enged meg a modell.
const schemaOptions = Quote.schema.path("fontSize").options;
const MIN = schemaOptions.min;
const MAX = schemaOptions.max;

const app = express();
app.use(express.json());
app.post("/quote", validateQuoteBody, (request_, response) => response.json({ok: true}));

const VALID = {quote: "Az élet szép.", author: "Valaki", order: 1};
const post = (fontSize) => request(app).post("/quote").send({...VALID, fontSize});

test("a séma tartománya értelmes (van alsó és felső határ, az alap közéjük esik)", () => {
    assert.ok(Number.isInteger(MIN) && Number.isInteger(MAX), "a határoknak egész számoknak kell lenniük");
    assert.ok(MIN < MAX);
    assert.ok(schemaOptions.default >= MIN && schemaOptions.default <= MAX,
        "a séma alapértelmezett betűmérete a saját tartományán kívülre esik");
});

test("a middleware átengedi a séma HATÁRAIT (alsó és felső érték)", async () => {
    assert.strictEqual((await post(MIN)).status, 200, `a ${MIN} (séma-minimum) nem ment át a middleware-en`);
    assert.strictEqual((await post(MAX)).status, 200, `a ${MAX} (séma-maximum) nem ment át a middleware-en`);
});

test("a middleware elutasítja a séma tartományán KÍVÜLI értékeket", async () => {
    assert.strictEqual((await post(MIN - 1)).status, 400,
        `a ${MIN - 1} átment a middleware-en, pedig a séma eldobná (500 lenne belőle)`);
    assert.strictEqual((await post(MAX + 1)).status, 400,
        `a ${MAX + 1} átment a middleware-en, pedig a séma eldobná (500 lenne belőle)`);
});

/* A séma OLDALÁRÓL is: amit a middleware átenged, azt a modellnek el kell
   fogadnia — és fordítva. A validateSync adatbázis nélkül fut. */
test("a séma elfogadja a határértékeket, és elutasítja a rajtuk kívülieket", () => {
    const validate = (fontSize) =>
        new Quote({user: "u1", quote: "Idézet", order: 1, fontSize}).validateSync()?.errors.fontSize;

    assert.strictEqual(validate(MIN), undefined);
    assert.strictEqual(validate(MAX), undefined);
    assert.ok(validate(MIN - 1), "a séma-minimum alatti értéket a modellnek el kell utasítania");
    assert.ok(validate(MAX + 1), "a séma-maximum feletti értéket a modellnek el kell utasítania");
});
