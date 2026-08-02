const router = require("express").Router();
const Todos = require("../../models/todos");
const serverError = require("../../serverError");
const {findOwnedList} = require("../../ownership");

/* A saját to-dók egy kategóriára szűrve (/to-dos/category/:name) — az idézetek
   szerző-szűrésének párja. A szűrő-értéket a validateCategoryFilter engedte át
   stringként, tehát operátor nem juthat a lekérdezésbe. */
module.exports = router.post("/", (request, response) =>
    findOwnedList(Todos, request.userId, {category: request.body.category})
        .then((todos) => response.json(todos))
        .catch((error) => serverError(response, error, "Todos.readByCategory")));
