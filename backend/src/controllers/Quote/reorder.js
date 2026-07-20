const router = require("express").Router();
const Quote = require("../../models/quote");
const serverError = require("../../serverError");

/* Egy idézet átsorolása (a lista húzása). Külön végpont az /update-től, mert
   CSAK a sorszámot mozgatja: az /update a teljes tartalmat várná, amit a húzás
   nem ismer, és egy párhuzamos szerkesztést felülírna (ugyanaz az indok, mint a
   to-dónál). A köztes elemek egy lépéssel csúsznak. Tulajdonos-ellenőrzés. */
module.exports = router.post("/", (request, response) => {
    const id = request.body.id;
    const order = request.body.order;
    Quote.findById(id).then((quote) => {
        if (quote === null || quote.user !== request.userId)
            return response.status(403).json("Nincs jogosultságod.");

        const oldOrder = quote.order;
        if (order === oldOrder) return response.json("A sorrend változatlan.");

        const setOrder = () => Quote.findByIdAndUpdate(id, {order: order, updatedAt: new Date()}, {runValidators: true})
            .then(() => response.json("Sorrend frissítve."))
            .catch((error) => serverError(response, error, "Quote.reorder"));

        if (order < oldOrder) Quote.updateMany(
            {user: request.userId, order: {$gte: order, $lt: oldOrder}},
            {$inc: {order: 1}, $set: {updatedAt: new Date()}},
        ).then(setOrder).catch((error) => serverError(response, error, "Quote.reorder.shift"));
        else Quote.updateMany(
            {user: request.userId, order: {$lte: order, $gt: oldOrder}},
            {$inc: {order: -1}, $set: {updatedAt: new Date()}},
        ).then(setOrder).catch((error) => serverError(response, error, "Quote.reorder.shift"));
    }).catch((error) => serverError(response, error, "Quote.reorder.find"));
});
