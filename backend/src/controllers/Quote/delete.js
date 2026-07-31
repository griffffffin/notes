const router = require("express").Router();
const Quote = require("../../models/quote");
const serverError = require("../../serverError");
const {findOwned, forbidden} = require("../../ownership");
const {shiftForDelete} = require("../../ordering");

/* Idézet törlése: a törölt fölöttiek eggyel feljebb csúsznak, hogy ne maradjon
   lyuk a sorszámokban. Csak a sajátodat törölheted — a findOwned egyszerre tölt
   be és ellenőriz (idegen vagy nem létező elem: null → 403). */
module.exports = router.post("/", (request, response) => {
    const id = request.body.id;
    findOwned(Quote, id, request.userId)
        .then((quote) => {
            if (!quote) return forbidden(response);
            return shiftForDelete(Quote, request.userId, quote.order)
                .then(() => Quote.findByIdAndDelete(id))
                .then(() => response.json("Idézet törölve."));
        })
        .catch((error) => serverError(response, error, "Quote.delete"));
});
