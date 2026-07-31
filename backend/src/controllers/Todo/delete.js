const router = require("express").Router();
const Todo = require("../../models/todo");
const serverError = require("../../serverError");
const {findOwned, forbidden} = require("../../ownership");
const {shiftForDelete} = require("../../ordering");

/* To-do törlése: a törölt fölöttiek eggyel feljebb csúsznak, hogy ne maradjon
   lyuk a sorszámokban. Csak a sajátodat törölheted (findOwned).

   ELTÉRÉS az idézet párjától (Quote/delete.js): a visszajelzés a to-do CÍMÉT
   tartalmazza ("Bevásárlás törölve."), az idézeté általános ("Idézet törölve.") —
   egy idézet első sora hosszú és tördelt lenne, nem üzenetbe való. */
module.exports = router.post("/", (request, response) => {
    const id = request.body.id;
    findOwned(Todo, id, request.userId)
        .then((todo) => {
            if (!todo) return forbidden(response);
            return shiftForDelete(Todo, request.userId, todo.order)
                .then(() => Todo.findByIdAndDelete(id))
                .then(() => response.json(todo.title + " törölve."));
        })
        .catch((error) => serverError(response, error, "Todo.delete"));
});
