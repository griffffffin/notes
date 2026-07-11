const router = require("express").Router();
const findById = require("./functions/findById");
const calculatePercentage = require("./functions/calculatePercentage");
const findByIdAndUpdate = require("./functions/findByIdAndUpdate");
const updateMany = require("./functions/updateMany");

module.exports = router.post("/", ((request, response) => {
    const id = request.body.id;
    findById(id, response, (todo) => {
        const oldOrder = todo.order;
        const title = request.body.title;
        const tasks = request.body.tasks;
        const order = request.body.order;
        const percentage = calculatePercentage(request);

        if (order === oldOrder) findByIdAndUpdate(id, title, tasks, order, percentage, request, response)
        else if (order < oldOrder) updateMany(
            {user: request.body.user, order: {$gte: order, $lt: oldOrder}},
            {$inc: {order: 1}, $set: {updatedAt: new Date()}},
            response,
            () => findByIdAndUpdate(id, title, tasks, order, percentage, request, response));
        else updateMany(
                {user: request.body.user, order: {$lte: order, $gt: oldOrder}},
                {$inc: {order: -1}, $set: {updatedAt: new Date()}},
                response,
                () => findByIdAndUpdate(id, title, tasks, order, percentage, request, response)
            );

    });
}));
