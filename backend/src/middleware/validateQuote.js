const mongoose = require("mongoose");

/* Az idézet-kérések törzsének ellenőrzése, MIELŐTT bármi az adatbázisig jutna —
   ugyanazokból az okokból, mint a to-dónál (validateTodo.js): a findByIdAndUpdate
   nem futtat sémavalidátort, a séma csak a típust nézi (nem a hosszt/tartományt),
   és a típus-szigor NoSQL-injekció ellen is véd (egy string helyére küldött
   {"$ne": null} operátorként jutna a szűrőbe).

   A modul SZÁNDÉKOSAN önálló (nem importál a validateTodo-ból): a két kategória
   validációja külön él, hogy egymástól függetlenül változhasson. A MAX_ORDER a
   to-dóéval EGYEZIK — ha ott változik, itt is állítandó. */

/* Egy idézet lehet akár több tízezer karakteres (hosszú részlet, vers, teljes
   idézetgyűjtemény-bejegyzés) — bőséges felső korlát, ami DoS-védelemnek még
   marad (16 MB a Mongo-dokumentum kemény határa, ettől jóval alatta vagyunk).
   A korlát NEM bit-tárolású (ez csak egy hossz-összehasonlítás, a szöveg a DB-ben
   ugyanúgy tárolódik), ezért nincs oka 2-hatványnak lennie. */
const MAX_QUOTE = 100000;
const MAX_AUTHOR = 200;
const MAX_ORDER = 100000;

const isText = (value) => typeof value === "string";
const isInteger = (value) => typeof value === "number" && Number.isInteger(value);

function quoteErrors(body) {
    const errors = [];

    if (!isText(body.quote) || !body.quote.trim()) errors.push("Az idézet megadása kötelező.");
    else if (body.quote.length > MAX_QUOTE) errors.push(`Az idézet legfeljebb ${MAX_QUOTE} karakter lehet.`);

    /* A szerző OPCIONÁLIS: a hiánya (undefined/null) vagy az üres string rendben
       van. De ha adott, string legyen és korlátos — máskülönben egy operátor-
       objektum ({"$ne": null}) is lejuthatna a szerző-szűrésbe. */
    if (body.author !== undefined && body.author !== null && body.author !== "") {
        if (!isText(body.author)) errors.push("A szerző formátuma hibás.");
        else if (body.author.length > MAX_AUTHOR) errors.push(`A szerző legfeljebb ${MAX_AUTHOR} karakter lehet.`);
    }

    if (!isInteger(body.order) || body.order < 1 || body.order > MAX_ORDER) errors.push("Érvénytelen sorszám.");

    return errors;
}

// Létrehozáshoz és módosításhoz: a törzs ellenőrzése.
const validateQuoteBody = (request, response, next) => {
    const errors = quoteErrors(request.body ?? {});
    if (errors.length) return response.status(400).json(errors.join(" "));
    next();
};

// Módosításhoz, törléshez, egy elem olvasásához: az id formája (különben a
// Mongoose CastError-t dobna, amiből csúf 400 lenne).
const validateQuoteId = (request, response, next) => {
    if (!mongoose.isValidObjectId(request.body?.id)) return response.status(400).json("Érvénytelen azonosító.");
    next();
};

// Az átsoroláshoz (/reorder) csak a sorszám kell; az id-t a validateQuoteId nézi.
const validateOrderOnly = (request, response, next) => {
    const order = request.body?.order;
    if (!isInteger(order) || order < 1 || order > MAX_ORDER)
        return response.status(400).json("Érvénytelen sorszám.");
    next();
};

/* A szerző-szűrő (/quotes/:author) a body author mezőjét egyenesen a
   lekérdezésbe teszi — operátor ne juthasson bele. A szerző itt is lehet üres
   string (a "névtelen" idézetek szűrése), csak string legyen. */
const validateAuthorFilter = (request, response, next) => {
    if (!isText(request.body?.author)) return response.status(400).json("Érvénytelen szerző.");
    next();
};

module.exports = {
    validateQuoteBody, validateQuoteId, validateOrderOnly, validateAuthorFilter, quoteErrors,
};
