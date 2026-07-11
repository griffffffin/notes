const router = require("express").Router();
const find = require("./functions/find");

module.exports = router.post("/", ((request, response) =>
    find({user: request.body.user, category: request.body.category},
        "order", response, (todos) => response.json(todos))));
