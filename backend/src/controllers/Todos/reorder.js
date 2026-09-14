const router = require("express").Router();
const Todos = require("../../models/todos");
const serverError = require("../../serverError");
const {shiftForMove, undoShiftForMove} = require("../../ordering");
const {shiftThenWrite} = require("../orderedWrite");

/* Egyetlen to-do átsorolása — a főoldali húzás ezt hívja. A TULAJDON-ellenőrzést
   a route-lánc requireOwnership middleware-e végezte (request.item a saját elem).

   Miért külön végpont, és nem az /update? Mert a húzás CSAK a sorrendet
   változtatja. Az /update a teljes tartalmat várja (cím, listaelemek, kategória,
   szín), tehát a kliensnek vissza kellene küldenie mindazt, amit épp nem
   szerkesztett — ami versenyhelyzetet szülne: ha közben egy másik lapon módosítod
   a címet, az átsorolás visszaírná a régit.

   A sorszám-eltolás ugyanaz, mint az /update-nél: a közös ordering modul végzi. */
module.exports = router.post("/", (request, response) => {
    const todo = request.item;
    const id = request.body.id;
    const order = request.body.order;
    /* A változatlan sorszám itt KÜLÖN ág (szemben az /update-tel): a húzás gyakran
       ér véget ugyanazon a helyen, és arra a saját, beszédes válasz jár —
       fölösleges írás nélkül. */
    if (order === todo.order) return response.json("Sorrend változatlan.");

    /* Ha a sorszám írása bukik el az eltolás UTÁN, a szomszédok visszakerülnek —
       enélkül ütközés vagy hézag maradna a listában (l. orderedWrite.js). */
    return shiftThenWrite({
        shift: () => shiftForMove(Todos, request.userId, todo.order, order),
        write: () => Todos.findByIdAndUpdate(id, {order: order, updatedAt: new Date()},
            {runValidators: true}),
        undo: () => undoShiftForMove(Todos, request.userId, todo.order, order, id),
    })
        .then(() => response.json("Sorrend frissítve."))
        .catch((error) => serverError(response, error, "Todos.reorder"));
});
