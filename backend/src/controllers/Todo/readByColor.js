const router = require("express").Router();
const Todo = require("../../models/todo");
const serverError = require("../../serverError");
const {findOwnedList} = require("../../ownership");

/* A saját to-dók egy színre szűrve (/to-do/color/:name).

   ELTÉRÉS a többi szekciótól: SZÍN-szűrés csak a to-dónál van, mert kártyaszínt is
   csak ott választ a felhasználó. A színt a validateColorFilter a rögzített
   palettához méri, tehát ide már csak ismert érték jut. */
module.exports = router.post("/", (request, response) =>
    findOwnedList(Todo, request.userId, {color: request.body.color})
        .then((todos) => response.json(todos))
        .catch((error) => serverError(response, error, "Todo.readByColor")));
