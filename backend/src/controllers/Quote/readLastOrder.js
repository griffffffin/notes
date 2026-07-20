const router = require("express").Router();
const Quote = require("../../models/quote");
const serverError = require("../../serverError");

/* A felhasználó legnagyobb idézet-sorszáma — a create ehhez +1-et adva teszi az
   új idézetet a lista VÉGÉRE (az idézetnél nincs "adott helyre beszúrás", a
   sorrendet utólag a húzás állítja).

   A to-do readLastOrder az EGÉSZ listát letölti és végigjárja; itt ehelyett a
   {user, order} indexre támaszkodva a legnagyobbat kérjük le (sort + limit 1) —
   a tervezett ~10 000 elemes skálán ez nem fésüli át a teljes collectiont. Üres
   listánál 0, tehát az első idézet sorszáma 1 lesz. */
module.exports = router.post("/", (request, response) =>
    Quote.find({user: request.userId}).sort("-order").limit(1)
        .then((last) => response.json(last.length ? last[0].order : 0))
        .catch((error) => serverError(response, error, "Quote.readLastOrder")));
