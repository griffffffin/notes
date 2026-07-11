const Todo = require("../../../models/todo");

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
    }).then(() => response.json(title + " frissitve."))
        .catch((error) => response.status(400).json("Error: " + error));
