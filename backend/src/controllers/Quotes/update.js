const router = require("express").Router();
const Quotes = require("../../models/quotes");
const serverError = require("../../serverError");
const {findOwned, forbidden} = require("../../ownership");
const {shiftForMove} = require("../../ordering");

/* Idézet szerkesztése. A tartalom (idézet, szerző, betűméret) mellett a sorszám
   is változhat — ilyenkor a reorderrel AZONOS eltolást végezzük a szomszédokon
   (közös ordering modul). Csak a sajátodat módosíthatod. */
module.exports = router.post("/", (request, response) => {
    const id = request.body.id;
    findOwned(Quotes, id, request.userId)
        .then((quote) => {
            if (!quote) return forbidden(response);

            const order = request.body.order;
            const save = () => Quotes.findByIdAndUpdate(
                id,
                {quote: request.body.quote, author: request.body.author, order: order,
                    fontSize: request.body.fontSize, updatedAt: new Date()},
                {runValidators: true},
            ).then(() => response.json("Idézet frissítve."));

            // Változatlan sorszámnál a shiftForMove magától nem tol el senkit,
            // tehát nem kell külön ág — a mentés utána ugyanúgy fut.
            return shiftForMove(Quotes, request.userId, quote.order, order).then(save);
        })
        .catch((error) => serverError(response, error, "Quotes.update"));
});
