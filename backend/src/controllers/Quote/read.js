const router = require("express").Router();
const Quote = require("../../models/quote");
const serverError = require("../../serverError");

// A bejelentkezett felhasználó saját idézetei, sorszám szerint rendezve. A user
// a tokenből jön (request.userId), sosem a kérés törzséből.
module.exports = router.post("/", (request, response) =>
    Quote.find({user: request.userId}).sort("order")
        .then((quotes) => response.json(quotes))
        .catch((error) => serverError(response, error, "Quote.read")));
