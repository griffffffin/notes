const Todo = require("../../../models/todo");
const serverError = require("../../../serverError");

module.exports = (id, response, then) =>
    Todo.findById(id).then(then).catch((error) => serverError(response, error, "Todo.findById"));
