const router = require("express").Router();
const Quote = require("../../models/quote");
const serverError = require("../../serverError");

/* Idézet törlése: a törölt fölöttiek eggyel feljebb csúsznak, hogy ne maradjon
   lyuk a sorszámokban. Tulajdonos-ellenőrzés: csak a sajátodat törölheted. */
module.exports = router.post("/", (request, response) => {
    const id = request.body.id;
    Quote.findById(id).then((quote) => {
        if (quote === null || quote.user !== request.userId)
            return response.status(403).json("Nincs jogosultságod.");
        Quote.updateMany(
            {user: request.userId, order: {$gt: quote.order}},
            {$inc: {order: -1}, $set: {updatedAt: new Date()}},
        )
            .then(() => Quote.findByIdAndDelete(id))
            .then(() => response.json("Idézet törölve."))
            .catch((error) => serverError(response, error, "Quote.delete"));
    }).catch((error) => serverError(response, error, "Quote.delete.find"));
});
