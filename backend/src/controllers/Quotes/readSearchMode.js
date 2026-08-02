const router = require("express").Router();
const Quotes = require("../../models/quotes");
const serverError = require("../../serverError");
const escapeRegex = require("./escapeRegex");

/* A keresés MÓD-döntése — a navbar ezt kérdezi meg a kereső beküldésekor, hogy
   eldöntse, HOVA navigáljon: szerző-szűrt nézetre (/quotes/:author) vagy a
   szöveg-találatra (/quotes/search/:term).

   SZÁNDÉKOSAN NEM tölti le a teljes találatot, csak két olcsó LÉT-kérdést tesz
   fel — a ~10 000 elemes skálán egy gyakori szóra ("a") a teljes halmaz
   materializálása pazarlás lenne pusztán az elágazáshoz:
     A = van-e a kifejezéssel PONTOSAN egyező szerző (horgonyzott ^…$ regex),
     S = előfordul-e a kifejezés RÉSZLETKÉNT bármely idézet SZÖVEGÉBEN.
   (Az `exists` az első találatnál megáll, nem gyűjti össze az összeset.)

   Szerző-mód AKKOR ÉS CSAK AKKOR, ha A ∧ ¬S (l. a döntéstáblát): ha a keresett
   szerző neve egy idézet szövegében is felbukkan, inkább a bővebb szöveg-mód
   érvényes a puszta szerző-szűrés helyett. A visszaadott `author` a TÁROLT
   írásmód (findOne a talált dokumentumból), nem a beírt kisbetűs alak — ez kerül
   az URL-be. */
module.exports = router.post("/", (request, response) => {
    const pattern = escapeRegex(request.body.term.trim());
    Promise.all([
        Quotes.findOne({user: request.userId, author: {$regex: "^" + pattern + "$", $options: "i"}}),
        Quotes.exists({user: request.userId, quote: {$regex: pattern, $options: "i"}}),
    ])
        .then(([authorMatch, inText]) => {
            if (authorMatch && !inText)
                return response.json({mode: "author", author: authorMatch.author});
            response.json({mode: "text"});
        })
        .catch((error) => serverError(response, error, "Quotes.readSearchMode"));
});
