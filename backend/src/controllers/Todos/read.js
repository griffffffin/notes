const router = require("express").Router();
const Todos = require("../../models/todos");
const serverError = require("../../serverError");
const {findOwnedList} = require("../../ownership");

// A bejelentkezett felhasználó saját to-dói, sorszám szerint rendezve. A user a
// tokenből jön (request.userId), sosem a kérés törzséből.
module.exports = router.post("/", (request, response) =>
    findOwnedList(Todos, request.userId)
        .then((todos) => response.json(todos))
        .catch((error) => serverError(response, error, "Todos.read")));
