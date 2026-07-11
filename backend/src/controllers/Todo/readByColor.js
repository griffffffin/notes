const router = require("express").Router();
const find = require("./functions/find");

module.exports = router.post("/", ((request, response) =>
    find({user: request.body.user, color: request.body.color},
        "order", response, (todos) => response.json(todos))));
