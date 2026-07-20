const router = require("express").Router();
const Quote = require("../../models/quote");
const serverError = require("../../serverError");

/* Egy idézet az azonosítója alapján — PUBLIKUS, tulajdonos-ellenőrzés NÉLKÜL:
   egy megosztott idézet-linket (/quotes/:author/:id) bárki megnyithat, aki
   ismeri az azonosítót. Ezért ül az auth middleware ELŐTT a route-táblában. Az
   írás-műveletek (create/update/delete/reorder) továbbra is auth + tulajdonos-
   ellenőrzés mögött vannak, tehát a megosztás CSAK olvasásra jó.

   Nem létező idézetnél 404 (nem 403, mint a to-dónál): itt nincs mit rejteni,
   az idézetek eleve nyilvánosan olvashatók. */
module.exports = router.post("/", (request, response) =>
    Quote.findById(request.body.id)
        .then((quote) => quote
            ? response.json(quote)
            : response.status(404).json("Nincs ilyen idézet."))
        .catch((error) => serverError(response, error, "Quote.readById")));
