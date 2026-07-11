const Todo = require("../../../models/todo");

module.exports = (id, response, then) =>
    Todo.findById(id).then(then).catch((error) => response.status(400).json("Error: " + error));
