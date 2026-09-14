const router = require("express").Router();
const Quotes = require("../../models/quotes");
const serverError = require("../../serverError");
const {shiftForDelete, undoShiftForDelete} = require("../../ordering");
const {shiftThenWrite} = require("../orderedWrite");

/* Idézet törlése: a törölt fölöttiek eggyel feljebb csúsznak, hogy ne maradjon
   lyuk a sorszámokban. A TULAJDON-ellenőrzést a route-lánc requireOwnership
   middleware-e végezte — ide már csak a saját elem jut el (request.item). */
module.exports = router.post("/", (request, response) => {
    const quote = request.item;
    const id = request.body.id;
    /* A visszavétel az eltolás TULAJDONSÁGA (l. ordering.js): ha a törlés maga
       bukik el, a feljebb csúszott szomszédok visszakerülnek. */
    return shiftThenWrite({
        shift: () => shiftForDelete(Quotes, request.userId, quote.order),
        write: () => Quotes.findByIdAndDelete(id),
        undo: () => undoShiftForDelete(Quotes, request.userId, quote.order, id),
    })
        .then(() => response.json("Idézet törölve."))
        .catch((error) => serverError(response, error, "Quotes.delete"));
});
