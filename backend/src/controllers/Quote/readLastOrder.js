const router = require("express").Router();
const Quote = require("../../models/quote");
const serverError = require("../../serverError");
const {lastOrder} = require("../../ordering");

/* A felhasználó legnagyobb idézet-sorszáma — a create ehhez +1-et adva teszi az
   új idézetet a lista VÉGÉRE, a szerkesztő sorszám-választója pedig ezt használja
   felső korlátnak. A számítás a közös ordering modulban él, ugyanaz, mint a
   to-dónál. */
module.exports = router.post("/", (request, response) =>
    lastOrder(Quote, request.userId)
        .then((order) => response.json(order))
        .catch((error) => serverError(response, error, "Quote.readLastOrder")));
