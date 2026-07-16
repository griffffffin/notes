const Todo = require("../../../models/todo");
const serverError = require("../../../serverError");

module.exports = (id, title, tasks, order, percentage, request, response) =>
    Todo.findByIdAndUpdate(id, {
        title: title,
        tasks: tasks,
        taskOrder: request.body.taskOrder,
        category: request.body.category,
        color: request.body.color,
        order: order,
        percentage: percentage,
        updatedAt: new Date()
    }, {
        /* A findByIdAndUpdate alapból NEM futtatja a séma validátorait (a
           Mongoose ilyenkor nem tölti be a dokumentumot, csak parancsot küld) —
           enélkül a módosítás megkerülte volna a required-eket, amiket a
           létrehozás betart. A middleware már ellenőrzött, ez a második háló. */
        runValidators: true,
    }).then(() => response.json(title + " frissitve."))
        .catch((error) => serverError(response, error, "Todo.findByIdAndUpdate"));
