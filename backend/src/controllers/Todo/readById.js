const router = require("express").Router();
const findById = require("./functions/findById");

module.exports = router.post("/", ((request, response) =>
    findById(request.body.id, response, (todo) => response.json(todo))));
