const router = require("express").Router();
const Quote = require("../../models/quote");
const serverError = require("../../serverError");
const {findOwnedList} = require("../../ownership");

/* A saját idézetek egy adott szerzőre szűrve — a szerző a to-do "kategória"
   szerepében (/quotes/:author). Az üres szerző a "névtelen" idézeteket adja
   vissza. A szűrő-értéket a validateAuthorFilter engedte át stringként, tehát
   operátor nem juthat a lekérdezésbe. */
module.exports = router.post("/", (request, response) =>
    findOwnedList(Quote, request.userId, {author: request.body.author})
        .then((quotes) => response.json(quotes))
        .catch((error) => serverError(response, error, "Quote.readByAuthor")));
