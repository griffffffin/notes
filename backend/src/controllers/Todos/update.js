const router = require("express").Router();
const Todos = require("../../models/todos");
const serverError = require("../../serverError");
const calculatePercentage = require("./functions/calculatePercentage");
const {shiftForMove, undoShiftForMove} = require("../../ordering");
const {shiftThenWrite} = require("../orderedWrite");

/* To-do szerkesztése. A tartalom mellett a sorszám is változhat — ilyenkor a
   reorderrel AZONOS eltolást végezzük a szomszédokon (közös ordering modul). A
   TULAJDON-ellenőrzést a route-lánc requireOwnership middleware-e végezte (a saját
   elem a request.item-en). */
module.exports = router.post("/", (request, response) => {
    const todo = request.item;
    const id = request.body.id;
    const title = request.body.title;
    const order = request.body.order;
    const save = () => Todos.findByIdAndUpdate(id, {
        title: title,
        tasks: request.body.tasks,
        taskOrder: request.body.taskOrder,
        category: request.body.category,
        color: request.body.color,
        order: order,
        // A százalékot a szerver számolja a listaelemekből, nem a kliens küldi.
        percentage: calculatePercentage(request),
        updatedAt: new Date(),
    }, {
        /* A findByIdAndUpdate alapból NEM futtatja a séma validátorait (a Mongoose
           ilyenkor nem tölti be a dokumentumot, csak parancsot küld) — enélkül a
           módosítás megkerülné a required-eket, amiket a létrehozás betart. A
           middleware már ellenőrzött, ez a második háló. */
        runValidators: true,
    }).then(() => response.json(title + " frissítve."));

    // Változatlan sorszámnál a shiftForMove nem tol el senkit, tehát nem kell külön
    // ág — a mentés utána ugyanúgy fut.
    /* Ha a mentés bukik el az eltolás UTÁN, a szomszédok visszakerülnek — enélkül
       ütközés vagy hézag maradna a listában (l. orderedWrite.js). */
    return shiftThenWrite({
        shift: () => shiftForMove(Todos, request.userId, todo.order, order),
        write: save,
        undo: () => undoShiftForMove(Todos, request.userId, todo.order, order, id),
    }).catch((error) => serverError(response, error, "Todos.update"));
});
