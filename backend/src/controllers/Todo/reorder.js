const router = require("express").Router();
const findById = require("./functions/findById");
const updateMany = require("./functions/updateMany");
const Todo = require("../../models/todo");
const serverError = require("../../serverError");

/* Egyetlen to-do átsorolása — a főoldali húzás ezt hívja.

   Miért külön végpont, és nem az /update? Mert a húzás CSAK a sorrendet
   változtatja. Az /update a teljes tartalmat várja (cím, listaelemek,
   kategória, szín), tehát a kliensnek vissza kellene küldenie mindazt, amit
   épp nem szerkesztett — ami versenyhelyzetet szülne: ha közben egy másik
   lapon módosítod a címet, az átsorolás visszaírná a régit.

   A sorszám-eltolás logikája ugyanaz, mint az /update-é: a beszúrás helyétől a
   régi helyig mindenki elmozdul eggyel, hogy ne keletkezzen lyuk vagy ütközés. */
module.exports = router.post("/", (request, response) => {
    const id = request.body.id;
    const order = request.body.order;

    findById(id, response, (todo) => {
        if (todo === null || todo.user !== request.userId)
            return response.status(403).json("Nincs jogosultságod.");

        const oldOrder = todo.order;
        if (order === oldOrder) return response.json("A sorrend változatlan.");

        const setOrder = () => Todo.findByIdAndUpdate(id, {order: order, updatedAt: new Date()},
            {runValidators: true})
            .then(() => response.json("Sorrend frissítve."))
            .catch((error) => serverError(response, error, "Todo.reorder"));

        // Felfelé mozgatás: a köztes elemek lejjebb csúsznak, hogy helyet adjanak.
        if (order < oldOrder) updateMany(
            {user: request.userId, order: {$gte: order, $lt: oldOrder}},
            {$inc: {order: 1}, $set: {updatedAt: new Date()}},
            response, setOrder);
        // Lefelé mozgatás: a köztes elemek feljebb csúsznak a felszabaduló helyre.
        else updateMany(
            {user: request.userId, order: {$lte: order, $gt: oldOrder}},
            {$inc: {order: -1}, $set: {updatedAt: new Date()}},
            response, setOrder);
    });
});
