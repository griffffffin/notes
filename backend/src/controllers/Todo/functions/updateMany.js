const Todo = require("../../../models/todo");
const serverError = require("../../../serverError");

module.exports = (filter, update, response, then) =>
    Todo.updateMany(filter, update).then(then).catch((error) => serverError(response, error, "Todo.updateMany"));
