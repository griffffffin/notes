const router = require("express").Router();
const find = require("./functions/find");

module.exports = router.post("/", ((request, response) =>
    find({user: request.userId, category: request.body.category},
        "order", response, (todos) => response.json(todos))));
