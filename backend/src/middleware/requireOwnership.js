const {findOwned, forbidden} = require("../ownership");
const serverError = require("../serverError");

/* TULAJDON-HATÁR MIDDLEWARE-KÉNT — a projekt legfontosabb biztonsági szabálya,
   BEDRÓTOZVA a route-láncba, mint az auth.

   MIÉRT. Eddig minden per-elem végpont (update, delete, reorder, readById,
   readForEdit) MAGA hívta a `findOwned`-et a controllerében. Ez működött, de a
   szabály elfelejtése NÉMA: egy új szekció (vagy egy új per-elem végpont), ami
   kihagyja, azonnal IDEGEN ADATOT ad ki, hibaüzenet nélkül. Middleware-ként a
   szabály a ROUTE-ban látszik, egy helyen, és a bekötése derived-teszttel
   őrizhető (ownershipBoundary.test.js) — pont mint az elem-kvótánál.

   MIT AD. Betölti az elemet, HA a kérőé (findOwned: tokenből vett userId,
   sosem a törzsből), és a `request.item`-re teszi; a controller innen dolgozik.
   Idegen vagy nem létező elem: 403 (forbidden) — a kettőt SZÁNDÉKOSAN nem
   különböztetjük meg (l. ownership.js), hogy az azonosító-próbálgatás
   értelmetlen legyen.

   HOL A LÁNCBAN. Az írás-végpontokon a `serializePerUser` MÖGÖTT áll: így a
   betöltés (és vele a `todo.order`, amire az eltolás épül) a per-user zár alatt,
   FRISSEN történik — nem csúszhat el egy párhuzamos írással. A body-validáció
   ELÉ kerül, mert nincs szüksége a törzsre (csak a `request.body.id`-re, amit a
   validateObjectId már ellenőrzött) — így az /update tulajdon-ellenőrzése is
   elérhető pusztán az id-val, ezért derived-teszttel fedhető.

   A `request.body.id` alakját a validateObjectId garantálja (előtte fut). */
function requireOwnership(Model) {
    return async (request, response, next) => {
        try {
            const item = await findOwned(Model, request.body.id, request.userId);
            if (!item) return forbidden(response);
            request.item = item;
            next();
        } catch (error) {
            serverError(response, error, `${Model.modelName}.ownership`);
        }
    };
}

module.exports = requireOwnership;
