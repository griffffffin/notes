const router = require("express").Router();
const updateMany = require("./functions/updateMany");
const Todo = require("../../models/todo");
const serverError = require("../../serverError");
const calculatePercentage = require("./functions/calculatePercentage");

module.exports = router.post("/", ((request, response) => {
    const order = request.body.order;
    updateMany(
        {user: request.userId, order: {$gte: order}},
        {$inc: {order: 1}, $set: {updatedAt: new Date()}},
        response,
        () => {
            const title = request.body.title;
            const tasks = request.body.tasks;
            const percentage = calculatePercentage(request);
            new Todo({
                user: request.userId,
                title: title,
                tasks: tasks,
                taskOrder: request.body.taskOrder,
                category: request.body.category,
                color: request.body.color,
                order: order,
                percentage: percentage
            }).save()
                .then(() => response.json(title + " letrehozva."))
                .catch((error) => serverError(response, error, "Todo.save"))
        }
    );
}));
