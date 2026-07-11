const Todo = require("../../../models/todo");

module.exports = (filter, sort, response, then) =>
    Todo.find(filter).sort(sort).then(then).catch((error) => response.status(400).json("Error: " + error));
