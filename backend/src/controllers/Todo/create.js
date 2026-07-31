const router = require("express").Router();
const Todo = require("../../models/todo");
const serverError = require("../../serverError");
const calculatePercentage = require("./functions/calculatePercentage");
const {shiftForInsert} = require("../../ordering");

/* Új to-do a megadott sorszámra: a beszúrási helytől fölfelé mindenkit eggyel
   lejjebb tolunk (közös ordering modul), majd mentünk. A készültségi százalékot
   a szerver számolja a listaelemekből — a kliens nem küldheti, hogy ne
   hazudhasson. */
module.exports = router.post("/", (request, response) => {
    const order = request.body.order;
    const title = request.body.title;
    shiftForInsert(Todo, request.userId, order)
        .then(() => new Todo({
            user: request.userId,
            title: title,
            tasks: request.body.tasks,
            taskOrder: request.body.taskOrder,
            category: request.body.category,
            color: request.body.color,
            order: order,
            percentage: calculatePercentage(request),
        }).save())
        .then(() => response.json(title + " létrehozva."))
        .catch((error) => serverError(response, error, "Todo.create"));
});
