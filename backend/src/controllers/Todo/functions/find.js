const Todo = require("../../../models/todo");
const serverError = require("../../../serverError");

module.exports = (filter, sort, response, then) =>
    Todo.find(filter).sort(sort).then(then).catch((error) => serverError(response, error, "Todo.find"));
