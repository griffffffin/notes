const router = require("express").Router();

/* Egy idézet betöltése a SZERKESZTŐNEK — a TULAJDON-ellenőrzést a route-lánc
   requireOwnership middleware-e végzi (l. routes.js), a saját elem a
   `request.item`-en jön. Szándékosan KÜLÖN a publikus /quotes/id-tól: a
   szerkesztőnek a sorszám (order) is kell (a sorszám-választó kezdőértéke), az
   viszont egy névtelen, megosztott-link-látogatóra nem tartozik — ezért a
   publikus végpont már NEM adja ki (l. readById.js). Itt a kérő bizonyítottan
   bejelentkezett ÉS a SAJÁT idézetét tölti, tehát az order kiadható. A válasz
   továbbra is WHITELIST: csak a szerkesztőnek kellő mezők mennek ki, a user-id és
   az időbélyegek soha.

   Idegen (vagy nem létező) idézeténél a middleware 403-at ad — pontosan úgy, mint
   az írás-műveleteknél (update/delete/reorder): a szerkesztő-betöltés nem publikus
   felfedező-felület, a tulajdon-szabály itt ugyanaz. (A publikus olvasás 404-et
   ad, mert ott nincs mit rejteni — itt viszont a létezést sem áruljuk el
   idegennek.) */
module.exports = router.post("/", (request, response) => {
    const quote = request.item;
    response.json({quote: quote.quote, author: quote.author, order: quote.order,
        fontSize: quote.fontSize});
});
