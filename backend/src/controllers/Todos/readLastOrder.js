const router = require("express").Router();
const Todos = require("../../models/todos");
const serverError = require("../../serverError");
const {lastOrder} = require("../../ordering");

/* A felhasználó legnagyobb to-do sorszáma — a szerkesztő sorszám-választójának
   felső korlátja. A számítás a közös ordering modulban él (indexre támaszkodó
   sort + limit 1), ugyanaz, mint az idézeteknél. */
module.exports = router.post("/", (request, response) =>
    lastOrder(Todos, request.userId)
        .then((order) => response.json(order))
        .catch((error) => serverError(response, error, "Todos.readLastOrder")));
