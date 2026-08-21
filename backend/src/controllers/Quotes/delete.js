const router = require("express").Router();
const Quotes = require("../../models/quotes");
const serverError = require("../../serverError");
const {findOwned, forbidden} = require("../../ownership");
const {shiftForDelete, undoShiftForDelete} = require("../../ordering");
const {shiftThenWrite} = require("../orderedWrite");

/* Idézet törlése: a törölt fölöttiek eggyel feljebb csúsznak, hogy ne maradjon
   lyuk a sorszámokban. Csak a sajátodat törölheted — a findOwned egyszerre tölt
   be és ellenőriz (idegen vagy nem létező elem: null → 403). */
module.exports = router.post("/", (request, response) => {
    const id = request.body.id;
    findOwned(Quotes, id, request.userId)
        .then((quote) => {
            if (!quote) return forbidden(response);
            /* A visszavétel az eltolás TULAJDONSÁGA (l. ordering.js): ha a törlés
               maga bukik el, a feljebb csúszott szomszédok visszakerülnek. */
            return shiftThenWrite({
                shift: () => shiftForDelete(Quotes, request.userId, quote.order),
                write: () => Quotes.findByIdAndDelete(id),
                undo: () => undoShiftForDelete(Quotes, request.userId, quote.order, id),
            })
                .then(() => response.json("Idézet törölve."));
        })
        .catch((error) => serverError(response, error, "Quotes.delete"));
});
