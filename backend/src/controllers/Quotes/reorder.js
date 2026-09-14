const router = require("express").Router();
const Quotes = require("../../models/quotes");
const serverError = require("../../serverError");
const {shiftForMove, undoShiftForMove, writeItem} = require("../../ordering");
const {shiftThenWrite} = require("../orderedWrite");

/* Egy idézet átsorolása (a lista húzása). A TULAJDON-ellenőrzést a route-lánc
   requireOwnership middleware-e végezte (request.item a saját elem). Külön végpont
   az /update-től, mert CSAK a sorszámot mozgatja: az /update a teljes tartalmat
   várná, amit a húzás nem ismer, és egy párhuzamos szerkesztést felülírna (ugyanaz
   az indok, mint a to-dónál). A köztes elemek eltolását a közös ordering modul
   végzi. */
module.exports = router.post("/", (request, response) => {
    const quote = request.item;
    const id = request.body.id;
    const order = request.body.order;
    /* A változatlan sorszám itt KÜLÖN ág (szemben az /update-tel): a húzás gyakran
       ér véget ugyanazon a helyen, és arra a saját, beszédes válasz jár —
       fölösleges írás nélkül. */
    if (order === quote.order) return response.json("Sorrend változatlan.");

    /* Ha a sorszám írása bukik el az eltolás UTÁN, a szomszédok visszakerülnek —
       enélkül ütközés vagy hézag maradna a listában (l. orderedWrite.js). */
    return shiftThenWrite({
        shift: () => shiftForMove(Quotes, request.userId, quote.order, order),
        write: () => writeItem(Quotes, id, {order: order}),
        undo: () => undoShiftForMove(Quotes, request.userId, quote.order, order, id),
    })
        .then(() => response.json("Sorrend frissítve."))
        .catch((error) => serverError(response, error, "Quotes.reorder"));
});
