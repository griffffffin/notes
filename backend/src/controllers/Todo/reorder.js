const router = require("express").Router();
const Todo = require("../../models/todo");
const serverError = require("../../serverError");
const {findOwned, forbidden} = require("../../ownership");
const {shiftForMove} = require("../../ordering");

/* Egyetlen to-do átsorolása — a főoldali húzás ezt hívja.

   Miért külön végpont, és nem az /update? Mert a húzás CSAK a sorrendet
   változtatja. Az /update a teljes tartalmat várja (cím, listaelemek,
   kategória, szín), tehát a kliensnek vissza kellene küldenie mindazt, amit
   épp nem szerkesztett — ami versenyhelyzetet szülne: ha közben egy másik
   lapon módosítod a címet, az átsorolás visszaírná a régit.

   A sorszám-eltolás ugyanaz, mint az /update-nél: a közös ordering modul végzi. */
module.exports = router.post("/", (request, response) => {
    const id = request.body.id;
    const order = request.body.order;
    findOwned(Todo, id, request.userId)
        .then((todo) => {
            if (!todo) return forbidden(response);
            /* A változatlan sorszám itt KÜLÖN ág (szemben az /update-tel): a húzás
               gyakran ér véget ugyanazon a helyen, és arra a saját, beszédes válasz
               jár — fölösleges írás nélkül. */
            if (order === todo.order) return response.json("A sorrend változatlan.");

            return shiftForMove(Todo, request.userId, todo.order, order)
                .then(() => Todo.findByIdAndUpdate(id, {order: order, updatedAt: new Date()},
                    {runValidators: true}))
                .then(() => response.json("Sorrend frissítve."));
        })
        .catch((error) => serverError(response, error, "Todo.reorder"));
});
