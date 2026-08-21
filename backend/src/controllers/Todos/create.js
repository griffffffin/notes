const router = require("express").Router();
const Todos = require("../../models/todos");
const serverError = require("../../serverError");
const calculatePercentage = require("./functions/calculatePercentage");
const {shiftForInsert} = require("../../ordering");
const {createOnce} = require("../createOnce");

/* Új to-do a megadott sorszámra. A készültségi százalékot a szerver számolja a
   listaelemekből — a kliens nem küldheti, hogy ne hazudhasson.

   A LÉTREHOZÁS IDEMPOTENS: az azonosítót a kliens adja, és ugyanaz a kérés
   másodszor sem hoz létre újabb elemet. A miértjét és a lépések sorrendjét a
   közös createOnce modul írja le. */
module.exports = router.post("/", (request, response) => {
    const order = request.body.order;
    const title = request.body.title;
    createOnce({
        Model: Todos,
        userId: request.userId,
        order: order,
        document: {
            /* Az `_id` CSAK akkor kerül bele, ha a kliens küldött ilyet. Kimondott
               `_id: undefined` esetén a Mongoose alapértelmezése kétes; a kulcs
               elhagyásával viszont egyértelműen ő generál. */
            ...(request.body.id ? {_id: request.body.id} : {}),
            user: request.userId,
            title: title,
            tasks: request.body.tasks,
            taskOrder: request.body.taskOrder,
            category: request.body.category,
            color: request.body.color,
            order: order,
            percentage: calculatePercentage(request),
        },
        shift: shiftForInsert,
    })
        .then(() => response.json(title + " létrehozva."))
        .catch((error) => serverError(response, error, "Todos.create"));
});
