/* A napi export FÁJLNEVÉNEK dátuma. Ez a mentés címkéje: eszerint választanánk
   fájlt egy visszaállításnál, tehát ha egy napot csúszik, a rossz napot állítjuk
   vissza — miközben semmi nem hibázik, a mentés lefut, a fájl mérete stimmel.

   A hiba, ami ellen a modul született: a toISOString() UTC-re vált, a szerver
   viszont helyi idő szerint jelöli ki a vizsgált napot. Nyáron (UTC+2) a helyi
   éjfél UTC-ben az előző nap 22:00, tehát az ISO-alak egy nappal visszalép.

   A teszt ezt közvetlenül állítja: olyan időpontokra, ahol a két értelmezés
   eltér, a helyi dátumnak kell kijönnie. A TZ-t a futtató környezet adja; a
   kritikus eseteket (helyi éjfél, késő este) ezért abszolút pillanatok helyett
   HELYI mezőkből építjük — így a teszt bármelyik időzónában ugyanazt állítja. */
const test = require("node:test");
const assert = require("node:assert");
const {localDateString} = require("./localDate");

test("a helyi ÉJFÉL a saját napját adja, nem az előzőt", () => {
    // A napi export pontosan ilyen pillanattal dolgozik: helyi éjfél.
    const midnight = new Date(2026, 6, 30, 0, 0, 0);   // 2026-07-30 00:00 helyi

    assert.strictEqual(localDateString(midnight), "2026-07-30");
});

test("késő este is a folyó napot adja (itt csúszna át az UTC-alak)", () => {
    const lateEvening = new Date(2026, 6, 30, 23, 30, 0);

    assert.strictEqual(localDateString(lateEvening), "2026-07-30");
});

test("hónap és nap MINDIG kétjegyű (a fájlnevek rendezhetők maradnak)", () => {
    assert.strictEqual(localDateString(new Date(2026, 0, 5, 12, 0, 0)), "2026-01-05");
});

test("hónapforduló: a hónap utolsó napja nem lép át a következőbe", () => {
    assert.strictEqual(localDateString(new Date(2026, 0, 31, 0, 0, 0)), "2026-01-31");
    assert.strictEqual(localDateString(new Date(2026, 11, 31, 0, 0, 0)), "2026-12-31");
});

/* A lényegi állítás: pozitív UTC-eltolású zónában (Budapest nyáron +2) a helyi
   éjfél ISO-alakja az ELŐZŐ napot adná. Csak akkor vizsgáljuk, ha a futtató
   környezet tényleg ilyen — máskülönben a teszt semmit nem bizonyítana. */
test("ott, ahol az ISO-alak csúszna, a helyi dátum a helyes napot adja", (t) => {
    const midnight = new Date(2026, 6, 30, 0, 0, 0);
    if (midnight.getTimezoneOffset() >= 0) {
        t.skip("a futtató környezet UTC vagy negatív eltolású — itt nincs csúszás");
        return;
    }

    assert.strictEqual(midnight.toISOString().slice(0, 10), "2026-07-29", "az ISO-alak tényleg visszalép");
    assert.strictEqual(localDateString(midnight), "2026-07-30");
});
