const router = require("express").Router();
const Todos = require("../../models/todos");
const serverError = require("../../serverError");
const calculatePercentage = require("./functions/calculatePercentage");
const {shiftForMove, undoShiftForMove, writeItem} = require("../../ordering");
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
    /* Az updatedAt-et és a runValidators-t a writeItem adja (ordering.js) — egy
       helyen minden item-írásnak, hogy az időbélyeg egyikből se maradhasson ki, és
       a módosítás ne kerülje meg a required-eket (a Mongoose a findByIdAndUpdate-nél
       alapból nem validál). */
    const save = () => writeItem(Todos, id, {
        title: title,
        tasks: request.body.tasks,
        taskOrder: request.body.taskOrder,
        category: request.body.category,
        color: request.body.color,
        order: order,
        // A százalékot a szerver számolja a listaelemekből, nem a kliens küldi.
        percentage: calculatePercentage(request),
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
