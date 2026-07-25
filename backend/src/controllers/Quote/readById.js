const router = require("express").Router();
const Quote = require("../../models/quote");
const serverError = require("../../serverError");

/* Egy idézet az azonosítója alapján — PUBLIKUS, tulajdonos-ellenőrzés NÉLKÜL:
   egy megosztott idézet-linket (/quotes/:author/:id) bárki megnyithat, aki
   ismeri az azonosítót. Ezért ül az auth middleware ELŐTT a route-táblában. Az
   írás-műveletek (create/update/delete/reorder) továbbra is auth + tulajdonos-
   ellenőrzés mögött vannak, tehát a megosztás CSAK olvasásra jó.

   Nem létező idézetnél 404 (nem 403, mint a to-dónál): itt nincs mit rejteni,
   az idézetek eleve nyilvánosan olvashatók.

   A válasz egy WHITELIST — csak a felsorolt mezők mennek ki, semmi más. Így a
   tulajdonos user-azonosítója és az időbélyegek (createdAt/updatedAt) SOSEM
   szivárognak: a user-id kiszivárogtatásával bárki, aki egy megosztott linket
   lát, összepárosíthatná az ugyanahhoz a fiókhoz tartozó megosztott idézeteket.
   A whitelist (nem blacklist) szándékos: ha később új mező kerül a sémába, az
   sem szivároghat ki automatikusan — csak amit itt kiírunk.

   A `quote`, `author` és `fontSize` a publikus nézetnek (Quote/public.jsx) kell —
   a megosztott idézet is a saját betűméretével jelenik meg. Az `order` a
   SZERKESZTŐNEK (Quote/save.jsx a `/quotes/id`-t hívja betöltéskor, és a
   sorszám-választó kezdőértékét ebből veszi). A szerkesztő csak bejelentkezve
   érhető el (a /quotes/update route login mögött van), de ugyanezt a publikus
   végpontot használja, ezért az `order`-t is ki kell adni. Se a sorszám (listabeli
   pozíció), se a betűméret nem érzékeny adat, szemben a user-id-vel. */
module.exports = router.post("/", (request, response) =>
    Quote.findById(request.body.id)
        .then((quote) => quote
            ? response.json({quote: quote.quote, author: quote.author, order: quote.order,
                fontSize: quote.fontSize})
            : response.status(404).json("Nincs ilyen idézet."))
        .catch((error) => serverError(response, error, "Quote.readById")));
