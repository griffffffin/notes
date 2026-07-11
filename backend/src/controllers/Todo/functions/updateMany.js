const Todo = require("../../../models/todo");

module.exports = (filter, update, response, then) =>
    Todo.updateMany(filter, update).then(then).catch((error) => response.status(400).json("Error: " + error));
