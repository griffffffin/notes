const router = require("express").Router();
const Quotes = require("../../models/quotes");
const serverError = require("../../serverError");
const {shiftForMove, undoShiftForMove, writeItem} = require("../../ordering");
const {shiftThenWrite} = require("../orderedWrite");

/* Idézet szerkesztése. A TARTALOM a kliens által titkosított `ciphertext`
   borítékban érkezik (E2EE, l. models/quotes.js) — a szerver csak tárolja. A
   sorszám is változhat — ilyenkor a reorderrel AZONOS eltolást végezzük a
   szomszédokon (közös ordering modul). A TULAJDON-ellenőrzést a route-lánc
   requireOwnership middleware-e végezte (a saját elem a request.item-en). */
module.exports = router.post("/", (request, response) => {
    const quote = request.item;
    const id = request.body.id;
    const order = request.body.order;
    // Az updatedAt-et és a runValidators-t a writeItem adja (ordering.js) — egy
    // helyen minden item-írásnak, hogy az időbélyeg egyikből se maradhasson ki.
    const save = () => writeItem(Quotes, id, {
        ciphertext: request.body.ciphertext, order: order,
    }).then(() => response.json("Idézet frissítve."));

    // Változatlan sorszámnál a shiftForMove magától nem tol el senkit, tehát nem
    // kell külön ág — a mentés utána ugyanúgy fut.
    /* Ha a mentés bukik el az eltolás UTÁN, a szomszédok visszakerülnek — enélkül
       ütközés vagy hézag maradna a listában (l. orderedWrite.js). */
    return shiftThenWrite({
        shift: () => shiftForMove(Quotes, request.userId, quote.order, order),
        write: save,
        undo: () => undoShiftForMove(Quotes, request.userId, quote.order, order, id),
    }).catch((error) => serverError(response, error, "Quotes.update"));
});
