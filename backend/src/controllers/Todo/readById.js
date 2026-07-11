const router = require("express").Router();
const findById = require("./functions/findById");

module.exports = router.post("/", ((request, response) =>
    findById(request.body.id, response, (todo) =>
        (todo === null || todo.user !== request.userId) ?
            response.status(403).json("Nincs jogosultságod.") :
            response.json(todo))));
