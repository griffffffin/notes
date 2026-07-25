const router = require("express").Router();
const Quote = require("../../models/quote");
const serverError = require("../../serverError");

/* Idézet szerkesztése. A tartalom (idézet, szerző) mellett a sorszám is
   változhat — ilyenkor a reorderrel AZONOS eltolást végezzük a szomszédokon.
   Tulajdonos-ellenőrzés: csak a sajátodat módosíthatod. */
module.exports = router.post("/", (request, response) => {
    const id = request.body.id;
    Quote.findById(id).then((quote) => {
        if (quote === null || quote.user !== request.userId)
            return response.status(403).json("Nincs jogosultságod.");

        const oldOrder = quote.order;
        const order = request.body.order;
        const save = () => Quote.findByIdAndUpdate(
            id,
            {quote: request.body.quote, author: request.body.author, order: order,
                fontSize: request.body.fontSize, updatedAt: new Date()},
            {runValidators: true},
        )
            .then(() => response.json("Idézet frissítve."))
            .catch((error) => serverError(response, error, "Quote.update"));

        // A sorszám nem változott: csak a tartalmat írjuk, nem tolunk senkit.
        if (order === oldOrder) return save();
        // Felfelé: a köztes elemek lejjebb csúsznak; lefelé: feljebb.
        if (order < oldOrder) Quote.updateMany(
            {user: request.userId, order: {$gte: order, $lt: oldOrder}},
            {$inc: {order: 1}, $set: {updatedAt: new Date()}},
        ).then(save).catch((error) => serverError(response, error, "Quote.update.shift"));
        else Quote.updateMany(
            {user: request.userId, order: {$lte: order, $gt: oldOrder}},
            {$inc: {order: -1}, $set: {updatedAt: new Date()}},
        ).then(save).catch((error) => serverError(response, error, "Quote.update.shift"));
    }).catch((error) => serverError(response, error, "Quote.update.find"));
});
