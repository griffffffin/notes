const router = require("express").Router();
const Quotes = require("../../models/quotes");
const serverError = require("../../serverError");
const escapeRegex = require("./escapeRegex");

/* Szerző-javaslatok a beírt prefixhez (autocomplete). A felhasználó szerzői, a
   prefixszel kezdve, a LEGUTÓBBI használat szerint rendezve. Mivel egy szerzőhöz
   több idézet tartozhat, csoportosítunk (distinct szerző), és a csoport
   legfrissebb createdAt-je adja, mikor használtad utoljára. A névtelen ("")
   szerző nem javaslat. Csak a LEGELSŐ (legutóbb használt) kell: a szerkesztő
   ghost-textje (authorInput.tsx) egyetlen javaslatot mutat, nincs legördülő —
   ezért $limit: 1, hogy fölöslegesen ne küldjünk többet a dróton.

   A prefixet stringgé kényszerítjük: egy operátor-objektum ({$ne}) így nem jut
   az escapeRegex .replace-ébe (és a szűrőbe) — üres prefix minden szerzőt megad. */
module.exports = router.post("/", (request, response) => {
    const prefix = typeof request.body.prefix === "string" ? request.body.prefix : "";
    Quotes.aggregate([
        {$match: {user: request.userId, author: {$regex: "^" + escapeRegex(prefix), $options: "i", $ne: ""}}},
        {$group: {_id: "$author", lastUsed: {$max: "$createdAt"}}},
        {$sort: {lastUsed: -1}},
        {$limit: 1},
    ])
        .then((rows) => response.json(rows.map((row) => row._id)))
        .catch((error) => serverError(response, error, "Quotes.readAuthors"));
});
