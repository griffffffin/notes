const router = require("express").Router();
const Quote = require("../../models/quote");
const serverError = require("../../serverError");
const {shiftForInsert} = require("../../ordering");

/* Új idézet a megadott sorszámra: a beszúrási helytől fölfelé mindenkit eggyel
   lejjebb tolunk, hogy a sorszámok hézag- és ütközésmentesek maradjanak — ezt a
   szekció-független ordering modul végzi (ugyanaz a szabály a to-dónál). Az
   author elhagyható: névtelen idézet is menthető. */
module.exports = router.post("/", (request, response) => {
    const order = request.body.order;
    shiftForInsert(Quote, request.userId, order)
        .then(() => new Quote({
            user: request.userId,
            quote: request.body.quote,
            author: request.body.author,
            order: order,
            // Hiányában a séma alapértéke (155) áll be — l. quote.js.
            fontSize: request.body.fontSize,
        }).save())
        .then(() => response.json("Idézet létrehozva."))
        .catch((error) => serverError(response, error, "Quote.create"));
});
