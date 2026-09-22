const router = require("express").Router();

/* Egy idézet betöltése a SZERKESZTŐNEK — a TULAJDON-ellenőrzést a route-lánc
   requireOwnership middleware-e végzi (l. routes.js), a saját elem a
   `request.item`-en jön. A kérő bizonyítottan bejelentkezett ÉS a SAJÁT idézetét
   tölti, tehát a sorszám (a sorszám-választó kezdőértéke) kiadható.

   A VÁLASZ WHITELIST: a titkosított boríték (`ciphertext`) és a nyílt sorszám
   (`order`) megy ki, a user-id és az időbélyegek soha. A tartalmi mezőket (idézet,
   szerző, betűméret, createdAt) a kliens a borítékból fejti vissza a mesterkulccsal
   (frontend/src/e2ee/content.ts) — a szerver azokat nem is látja (E2EE).

   Idegen (vagy nem létező) idézeténél a middleware 403-at ad — pontosan úgy, mint
   az írás-műveleteknél (update/delete/reorder): a szerkesztő-betöltés nem publikus
   felfedező-felület, a létezést sem áruljuk el idegennek. */
module.exports = router.post("/", (request, response) => {
    const quote = request.item;
    response.json({ciphertext: quote.ciphertext, order: quote.order});
});
