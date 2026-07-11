const router = require("express").Router();
const findById = require("./functions/findById");
const updateMany = require("./functions/updateMany");
const Todo = require("../../models/todo");

module.exports = router.post("/", ((request, response) => {
    const id = request.body.id;
    findById(id, response, (todo) => {
        const order = todo.order;
        const title = todo.title;
        updateMany(
            {user: request.body.user, order: {$gt: order}},
            {$inc: {order: -1}, $set: {updatedAt: new Date()}},
            response,
            () => Todo.findByIdAndDelete(id)
                .then(() => response.json(title + " torolve."))
                .catch((error) => response.status(400).json("Error: " + error))
        );
    });
}));
