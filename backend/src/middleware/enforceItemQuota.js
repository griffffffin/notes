const serverError = require("../serverError");

/* FIÓKONKÉNTI ELEM-KVÓTA — egy szekció ennyi elemnél többet nem enged létrehozni
   egy fióknak. A kvótát a MODELL deklarálja (Model.itemQuota, l. models/todos.js);
   ez a middleware olvassa ki és kényszeríti a create-végpont előtt.

   KÉT KÜLÖN TENGELY. A write-rate-limit (routes.js) a SEBESSÉGET fogja (gyors
   abúzus-burst); ez a VÉGÖSSZEGET (lassú, kitartó tárhely-feltöltés). Egyik sem
   váltja a másikat.

   MIÉRT MIDDLEWARE, NEM A createOnce-BAN. A kvóta-túllépés VÁRT, felhasználónak
   szóló hiba (mint az üres cím vagy a hibás id) — 403-at ad, ahol a hívó fogalmazza
   meg, épp mint a többi validátor. A serverError SZÁNDÉKOSAN csak a VÁRATLAN
   hibákat kezeli (500 + napló); a kvótát oda vinni téves 500-at és fölös naplózást
   adna (l. serverError.js kommentje).

   AZ IDEMPOTENS ISMÉTLÉS a határon ÁTMEHET: ha a kliens-adott `id` már a MI
   elemünk, a create nem hoz létre újat (l. createOnce.js egyedi-index kapuja,
   [[create-duplicate-idempotency]]). Enélkül egy elveszett-válaszú create
   újrapróbája a kvóta-határon tévesen elbukna. Ez a második lekérdezés CSAK a
   határon fut, a gyakorlatban soha.

   A SZÁMLÁLÁS a per-user zár (serializePerUser) ELŐTT fut, mert az őr a
   validateObjectId után, a zár előtt áll. Ez azt jelenti, hogy két PÁRHUZAMOS,
   UGYANAZON fiók általi create pontosan a határon a kvótát néhánnyal túlléphetné
   (mindkettő a régi számot látja). Ez tudatosan elfogadott: a kvóta ~500k-s
   ABSZOLÚT védőháló, nem pontos számláló — pár elem eltérés a határon lényegtelen,
   és a jogos használat úgysem közelíti. A pontos sorosításért cserébe a
   body-validáció mögé, a zár alá kellene tenni, ami a lenti szekció-agnosztikus
   őr-tesztet szekció-specifikussá tenné. */
function enforceItemQuota(Model) {
    const quota = Model.itemQuota;
    /* WIRING-IDEJŰ ellenőrzés: ha egy modellt kvóta nélkül kötnek ide, az INDULÁSKOR
       szálljon el hangosan, ne kérésenként, némán. (A hiányzó DEKLARÁCIÓT a gate is
       fogja commitnál; ez a wiring hibáját fogja.) */
    if (!Number.isInteger(quota) || quota <= 0)
        throw new Error(`enforceItemQuota: a(z) ${Model.modelName} nem deklarál pozitív egész itemQuota-t ` +
            `(kaptam: ${JSON.stringify(quota)}). Minden tartalmi szekció-modellnek meg kell adnia (l. models/todos.js).`);

    return async (request, response, next) => {
        try {
            if (await Model.countDocuments({user: request.userId}) < quota) return next();
            if (await Model.exists({_id: request.body.id, user: request.userId})) return next();
            return response.status(403).json(
                "Elérted ennek a szekciónak az elemkorlátját. Új elem felvételéhez törölj néhányat.");
        } catch (error) {
            /* A számlálás/létezés-lekérdezés DB-hibája váratlan — a create maga is
               elszállna a DB nélkül. Egységesen a serverError kezeli (500 + napló). */
            return serverError(response, error, `${Model.modelName}.quota`);
        }
    };
}

module.exports = enforceItemQuota;
