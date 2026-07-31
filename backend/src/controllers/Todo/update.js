const router = require("express").Router();
const Todo = require("../../models/todo");
const serverError = require("../../serverError");
const calculatePercentage = require("./functions/calculatePercentage");
const {findOwned, forbidden} = require("../../ownership");
const {shiftForMove} = require("../../ordering");

/* To-do szerkesztése. A tartalom mellett a sorszám is változhat — ilyenkor a
   reorderrel AZONOS eltolást végezzük a szomszédokon (közös ordering modul).
   Csak a sajátodat módosíthatod. */
module.exports = router.post("/", (request, response) => {
    const id = request.body.id;
    findOwned(Todo, id, request.userId)
        .then((todo) => {
            if (!todo) return forbidden(response);

            const title = request.body.title;
            const order = request.body.order;
            const save = () => Todo.findByIdAndUpdate(id, {
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
                /* A findByIdAndUpdate alapból NEM futtatja a séma validátorait (a
                   Mongoose ilyenkor nem tölti be a dokumentumot, csak parancsot küld) —
                   enélkül a módosítás megkerülné a required-eket, amiket a létrehozás
                   betart. A middleware már ellenőrzött, ez a második háló. */
                runValidators: true,
            }).then(() => response.json(title + " frissítve."));

            // Változatlan sorszámnál a shiftForMove nem tol el senkit, tehát nem
            // kell külön ág — a mentés utána ugyanúgy fut.
            return shiftForMove(Todo, request.userId, todo.order, order).then(save);
        })
        .catch((error) => serverError(response, error, "Todo.update"));
});
