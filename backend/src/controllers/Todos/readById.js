const router = require("express").Router();

/* Egy to-do betöltése a szerkesztőnek. A TULAJDON-ellenőrzést a route-lánc
   requireOwnership middleware-e végzi (l. routes.js): idegen vagy nem létező elem
   ott 403-at kap, ide már csak a saját elem jut el, a `request.item`-en.

   ELTÉRÉS az idézet párjától (Quotes/readForEdit.js): ott a válasz WHITELIST
   (csak a szerkesztőnek kellő mezők), itt a teljes dokumentum megy ki. Ennek oka
   nem elvi, hanem az, hogy a to-donak nincs publikus nézete — nincs olyan
   végpont, amivel a mezőkészletet össze kellene hangolni. Ha egyszer lesz, ez a
   válasz is whitelistre szűkítendő. */
module.exports = router.post("/", (request, response) => response.json(request.item));
