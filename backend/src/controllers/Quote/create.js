const router = require("express").Router();
const Quote = require("../../models/quote");
const serverError = require("../../serverError");

/* Új idézet a megadott sorszámra: a beszúrási helytől fölfelé mindenkit eggyel
   lejjebb tolunk, hogy a sorszámok hézag- és ütközésmentesek maradjanak — ugyanaz
   a minta, mint a to-do create-nél, csak tartalomban vékonyabb (nincs szín,
   százalék, listaelem). Az author elhagyható: névtelen idézet is menthető. */
module.exports = router.post("/", (request, response) => {
    const order = request.body.order;
    Quote.updateMany(
        {user: request.userId, order: {$gte: order}},
        {$inc: {order: 1}, $set: {updatedAt: new Date()}},
    )
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
