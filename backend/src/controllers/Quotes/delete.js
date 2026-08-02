const router = require("express").Router();
const Quotes = require("../../models/quotes");
const serverError = require("../../serverError");
const {findOwned, forbidden} = require("../../ownership");
const {shiftForDelete} = require("../../ordering");

/* Idézet törlése: a törölt fölöttiek eggyel feljebb csúsznak, hogy ne maradjon
   lyuk a sorszámokban. Csak a sajátodat törölheted — a findOwned egyszerre tölt
   be és ellenőriz (idegen vagy nem létező elem: null → 403). */
module.exports = router.post("/", (request, response) => {
    const id = request.body.id;
    findOwned(Quotes, id, request.userId)
        .then((quote) => {
            if (!quote) return forbidden(response);
            return shiftForDelete(Quotes, request.userId, quote.order)
                .then(() => Quotes.findByIdAndDelete(id))
                .then(() => response.json("Idézet törölve."));
        })
        .catch((error) => serverError(response, error, "Quotes.delete"));
});
