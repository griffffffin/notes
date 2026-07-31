const router = require("express").Router();
const Todo = require("../../models/todo");
const serverError = require("../../serverError");
const {findOwned, forbidden} = require("../../ownership");

/* Egy to-do betöltése a szerkesztőnek, tulajdonos-ellenőrzéssel.

   ELTÉRÉS az idézet párjától (Quote/readForEdit.js): ott a válasz WHITELIST
   (csak a szerkesztőnek kellő mezők), itt a teljes dokumentum megy ki. Ennek oka
   nem elvi, hanem az, hogy a to-donak nincs publikus nézete — nincs olyan
   végpont, amivel a mezőkészletet össze kellene hangolni. Ha egyszer lesz, ez a
   válasz is whitelistre szűkítendő. */
module.exports = router.post("/", (request, response) =>
    findOwned(Todo, request.body.id, request.userId)
        .then((todo) => todo ? response.json(todo) : forbidden(response))
        .catch((error) => serverError(response, error, "Todo.readById")));
