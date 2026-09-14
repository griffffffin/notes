/* IDEMPOTENS LÉTREHOZÁS — szekciótól függetlenül, egy helyen.

   MIT OLD MEG. Egy elbukott mentés után a felhasználó újra megnyomja a Mentés
   gombot (vagy a háttérmentés magától újrapróbál, l. frontend/src/saveRetry.ts).
   Ha az első kérés valójában MEGÉRKEZETT, és csak a VÁLASZ veszett el — ez az
   időtúllépés tipikus alakja —, akkor a második kérés eddig még egy elemet
   hozott létre.

   MÉRVE (2026-08-21, izolált adatbázisban, valódi FerretDB-vel), és a kár két
   különböző súlyú volt:

     - SOROS ismétlés (a második kérés akkor indul, amikor az első már
       befejeződött): egy fölös elem, de a sorszámozás ép marad;
     - PÁRHUZAMOS ismétlés (az első kérés MÉG FUT — pontosan ezt csinálja a 15
       másodperces időtúllépés utáni újranyomás): a fölös elem MELLETT elromlik a
       sorszámozás invariánsa is. Mért eredmény: [1, 2, 2, 4, 5, 6, 7] — két elem
       ugyanazon a sorszámon, és hézag a harmadiknál.

   HOGYAN. Az azonosítót a KLIENS adja (a szerkesztő megnyitásakor születik, és a
   piszkozatba is bekerül), a szerver pedig ELŐBB SZÚR BE, és csak utána tol. Az
   `_id` egyedi indexe így atomi kapuvá válik: a megismételt kérés beszúrása
   duplikált-kulcs hibára fut, mi pedig ebből TUDJUK, hogy ez a létrehozás már
   megtörtént — nem csinálunk semmit, és sikert jelentünk.

   Ez a kapu azért kell, mert TRANZAKCIÓ NINCS: mérve (2026-08-21) a FerretDB v2
   `commitTransaction` parancsot sem ismer, tehát a beszúrás és a tolás nem
   köthető össze atomi egységbe. Amink van, az az egyedi index — azt használjuk.

   AZ ÜTKÖZÉS KÉT ESETE. A duplikált kulcs nem feltétlenül a mi ismétlésünk: egy
   idegen (vagy egy kitalált) azonosító is ütközhet valaki más elemével. Ilyenkor
   NEM mondunk sikert, és nem is áruljuk el, hogy az az azonosító létezik — a
   hívó általános szerverhibát kap, a napló pedig megkapja az esetet.

   HA A TOLÁS BUKIK EL a sikeres beszúrás után, visszavesszük a beszúrást. Enélkül
   két elem maradna ugyanazon a sorszámon, ami rosszabb, mint egy hézag: a
   rendezés és a húzás is ebből dolgozik. A visszavétel maga is elbukhat — akkor
   marad az ütközés, de ennél többet tranzakció nélkül nem tehetünk. */

const {findOwned} = require("../ownership");

const DUPLICATE_KEY = 11000;

/**
 * Létrehoz egy elemet, majd elhelyezi a sorszámozott listában — legfeljebb egyszer.
 *
 * @param Model     a szekció Mongoose-modellje
 * @param userId    a tulajdonos (a tokenből, nem a kérés törzséből)
 * @param order     a beszúrási hely
 * @param document  a teljes dokumentum, benne a kliens adta `_id`-vel
 * @param shift     a beszúrási eltolás (ordering.js `shiftForInsert`)
 * @returns a létrehozás megtörtént-e MOST (false = már korábban létrejött)
 */
async function createOnce({Model, userId, order, document, shift}) {
    let saved;
    try {
        saved = await new Model(document).save();
    } catch (error) {
        if (error?.code !== DUPLICATE_KEY) throw error;
        /* Ugyanaz a kérés másodszor? Csak akkor, ha a meglévő elem a MIÉNK — a
           tulajdon-ellenőrzést a KÖZÖS findOwned végzi (ownership.js), nem egy itt
           megismételt user-hasonlítás. A tulajdonost a tokenből vett userId adja,
           nem a kérés törzse. Ha az elem a miénk, findOwned visszaadja; idegen VAGY
           nem létező azonosítóra null — ilyenkor az eredeti duplikált-kulcs hibát
           dobjuk tovább, és nem áruljuk el, hogy az azonosító létezik. */
        if (await findOwned(Model, document._id, userId)) return false;
        throw error;
    }
    /* AZ ELTOLÁS A MENTETT dokumentum azonosítóját kapja, nem a bemenetit. A kettő
       majdnem mindig ugyanaz — de ha a hívó nem adott azonosítót, a bemeneti
       `undefined`, a mentett viszont a Mongoose által generált valódi érték. Így a
       kizárás akkor is pontos, amikor az azonosító nem a kliensé. */
    try {
        await shift(Model, userId, order, saved._id);
    } catch (error) {
        // A lista épsége fontosabb, mint az új elem: visszavesszük a beszúrást.
        await Model.findByIdAndDelete(saved._id).catch(() => undefined);
        throw error;
    }
    return true;
}

module.exports = {createOnce};
