const router = require("express").Router();
const Quotes = require("../../models/quotes");
const serverError = require("../../serverError");
const {shiftForInsert} = require("../../ordering");
const {createOnce} = require("../createOnce");

/* Új idézet a megadott sorszámra. A TARTALOM (idézet, szerző, betűméret, createdAt)
   a kliens által titkosított `ciphertext` borítékban érkezik — a szerver csak
   tárolja, sosem értelmezi (E2EE, l. models/quotes.js).

   A LÉTREHOZÁS IDEMPOTENS, a to-dóéval azonos módon: az azonosítót a kliens
   adja, és ugyanaz a kérés másodszor sem hoz létre újabb elemet — a miértjét és
   a lépések sorrendjét a közös createOnce modul írja le. */
module.exports = router.post("/", (request, response) => {
    const order = request.body.order;
    createOnce({
        Model: Quotes,
        userId: request.userId,
        order: order,
        document: {
            /* Az `_id` CSAK akkor kerül bele, ha a kliens küldött ilyet. Kimondott
               `_id: undefined` esetén a Mongoose alapértelmezése kétes; a kulcs
               elhagyásával viszont egyértelműen ő generál. */
            ...(request.body.id ? {_id: request.body.id} : {}),
            user: request.userId,
            ciphertext: request.body.ciphertext,
            order: order,
        },
        shift: shiftForInsert,
    })
        .then(() => response.json("Idézet létrehozva."))
        .catch((error) => serverError(response, error, "Quotes.create"));
});
