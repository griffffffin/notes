const router = require("express").Router();
const Todos = require("../../models/todos");
const serverError = require("../../serverError");
const {findOwned, forbidden} = require("../../ownership");
const {shiftForDelete, undoShiftForDelete} = require("../../ordering");
const {shiftThenWrite} = require("../orderedWrite");

/* To-do törlése: a törölt fölöttiek eggyel feljebb csúsznak, hogy ne maradjon
   lyuk a sorszámokban. Csak a sajátodat törölheted (findOwned).

   ELTÉRÉS az idézet párjától (Quotes/delete.js): a visszajelzés a to-do CÍMÉT
   tartalmazza ("Bevásárlás törölve."), az idézeté általános ("Idézet törölve.") —
   egy idézet első sora hosszú és tördelt lenne, nem üzenetbe való. */
module.exports = router.post("/", (request, response) => {
    const id = request.body.id;
    findOwned(Todos, id, request.userId)
        .then((todo) => {
            if (!todo) return forbidden(response);
            /* A visszavétel az eltolás TULAJDONSÁGA (l. ordering.js): ha a törlés
               maga bukik el, a feljebb csúszott szomszédok visszakerülnek. */
            return shiftThenWrite({
                shift: () => shiftForDelete(Todos, request.userId, todo.order),
                write: () => Todos.findByIdAndDelete(id),
                undo: () => undoShiftForDelete(Todos, request.userId, todo.order, id),
            })
                .then(() => response.json(todo.title + " törölve."));
        })
        .catch((error) => serverError(response, error, "Todos.delete"));
});
