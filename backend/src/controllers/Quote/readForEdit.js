const router = require("express").Router();
const Quote = require("../../models/quote");
const serverError = require("../../serverError");
const {findOwned, forbidden} = require("../../ownership");

/* Egy idézet betöltése a SZERKESZTŐNEK — auth MÖGÖTT, TULAJDONOS-ellenőrzéssel.
   Szándékosan KÜLÖN a publikus /quotes/id-tól: a szerkesztőnek a sorszám (order)
   is kell (a sorszám-választó kezdőértéke), az viszont egy névtelen, megosztott-
   link-látogatóra nem tartozik — ezért a publikus végpont már NEM adja ki (l.
   readById.js). Itt a kérő bizonyítottan bejelentkezett ÉS a SAJÁT idézetét tölti,
   tehát az order kiadható. A válasz továbbra is WHITELIST: csak a szerkesztőnek
   kellő mezők mennek ki, a user-id és az időbélyegek soha.

   Idegen (vagy nem létező) idézeténél 403 — pontosan úgy, mint az írás-műveleteknél
   (update/delete/reorder): a szerkesztő-betöltés nem publikus felfedező-felület,
   a tulajdon-szabály itt ugyanaz. (A publikus olvasás 404-et ad, mert ott nincs
   mit rejteni — itt viszont a létezést sem áruljuk el idegennek.) */
module.exports = router.post("/", (request, response) =>
    findOwned(Quote, request.body.id, request.userId)
        .then((quote) => quote
            ? response.json({quote: quote.quote, author: quote.author, order: quote.order,
                fontSize: quote.fontSize})
            : forbidden(response))
        .catch((error) => serverError(response, error, "Quote.readForEdit")));
