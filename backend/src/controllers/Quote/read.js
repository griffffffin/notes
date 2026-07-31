const router = require("express").Router();
const Quote = require("../../models/quote");
const serverError = require("../../serverError");
const {findOwnedList} = require("../../ownership");

// A bejelentkezett felhasználó saját idézetei, sorszám szerint rendezve. A user
// a tokenből jön (request.userId), sosem a kérés törzséből.
module.exports = router.post("/", (request, response) =>
    findOwnedList(Quote, request.userId)
        .then((quotes) => response.json(quotes))
        .catch((error) => serverError(response, error, "Quote.read")));
