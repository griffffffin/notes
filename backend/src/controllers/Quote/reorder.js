const router = require("express").Router();
const Quote = require("../../models/quote");
const serverError = require("../../serverError");
const {findOwned, forbidden} = require("../../ownership");
const {shiftForMove} = require("../../ordering");

/* Egy idézet átsorolása (a lista húzása). Külön végpont az /update-től, mert
   CSAK a sorszámot mozgatja: az /update a teljes tartalmat várná, amit a húzás
   nem ismer, és egy párhuzamos szerkesztést felülírna (ugyanaz az indok, mint a
   to-dónál). A köztes elemek eltolását a közös ordering modul végzi. */
module.exports = router.post("/", (request, response) => {
    const id = request.body.id;
    const order = request.body.order;
    findOwned(Quote, id, request.userId)
        .then((quote) => {
            if (!quote) return forbidden(response);
            /* A változatlan sorszám itt KÜLÖN ág (szemben az /update-tel): a húzás
               gyakran ér véget ugyanazon a helyen, és arra a saját, beszédes válasz
               jár — fölösleges írás nélkül. */
            if (order === quote.order) return response.json("A sorrend változatlan.");

            return shiftForMove(Quote, request.userId, quote.order, order)
                .then(() => Quote.findByIdAndUpdate(id, {order: order, updatedAt: new Date()},
                    {runValidators: true}))
                .then(() => response.json("Sorrend frissítve."));
        })
        .catch((error) => serverError(response, error, "Quote.reorder"));
});
