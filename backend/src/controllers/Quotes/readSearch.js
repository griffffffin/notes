const router = require("express").Router();
const Quotes = require("../../models/quotes");
const serverError = require("../../serverError");
const escapeRegex = require("./escapeRegex");
const {findOwnedList} = require("../../ownership");

/* A keresés SZÖVEG-módjának találatai: azok a saját idézetek, amelyekben a
   keresett kifejezés RÉSZLETKÉNT (substring) szerepel az idézet SZÖVEGÉBEN VAGY a
   SZERZŐBEN, kis-/nagybetű-érzéketlenül. A kifejezést escape-eljük (regex-injekció
   ellen), a szélső szóközöket levágjuk (a validateSearchTerm már nem-üresre
   ellenőrizte).

   Csupasz TÖMBÖT ad vissza (mint a readByAuthor), nem burkoló objektumot: így a
   lista + húzás gépezet (useSortableCards) közvetlenül fogyaszthatja, és a találat
   pontosan úgy rendezhető át, mint a szerző-szűrt nézet. A rendezés a globális
   sorszám (order) szerint megy — ez adja a húzással állítható, tartós sorrendet. */
module.exports = router.post("/", (request, response) => {
    const pattern = escapeRegex(request.body.term.trim());
    const regex = {$regex: pattern, $options: "i"};
    findOwnedList(Quotes, request.userId, {$or: [{quote: regex}, {author: regex}]})
        .then((quotes) => response.json(quotes))
        .catch((error) => serverError(response, error, "Quotes.readSearch"));
});
