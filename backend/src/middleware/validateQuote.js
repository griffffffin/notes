const {isText, isInteger, isValidOrder} = require("./validators");

/* Az idézet-kérések törzsének ellenőrzése, MIELŐTT bármi az adatbázisig jutna —
   ugyanazokból az okokból, mint a to-dónál (validateTodo.js): a findByIdAndUpdate
   nem futtat sémavalidátort, a séma csak a típust nézi (nem a hosszt/tartományt),
   és a típus-szigor NoSQL-injekció ellen is véd (egy string helyére küldött
   {"$ne": null} operátorként jutna a szűrőbe).

   ELTÉRÉS a to-do validátorától (validateTodo.js): a két modul SZÁNDÉKOSAN nem
   importál egymásból, és nem is vonható össze. Az idézet saját szabályai (mi
   kötelező, mekkora lehet) függetlenül változhassanak a to-doétól: az idézet
   hosszkorlátja nem befolyásolhatja a to-do címét. Ami minden szekcióban azonos — a típus-ellenőrzők, a sorszám
   felső korlátja, az id- és a sorszám-middleware —, az a közös validators.js-ből
   jön; korábban ezeket kézi szinkron tartotta együtt. */

/* Egy idézet lehet akár több tízezer karakteres (hosszú részlet, vers, teljes
   idézetgyűjtemény-bejegyzés) — bőséges felső korlát, ami DoS-védelemnek még
   marad (16 MB a Mongo-dokumentum kemény határa, ettől jóval alatta vagyunk).
   A korlát NEM bit-tárolású (ez csak egy hossz-összehasonlítás, a szöveg a DB-ben
   ugyanúgy tárolódik), ezért nincs oka 2-hatványnak lennie. */
const MAX_QUOTE = 100000;
const MAX_AUTHOR = 200;
/* A keresőkifejezés felső korlátja. Bőven elég bármely értelmes szó/szókapcsolat
   kereséséhez (a szerzőnév maga is legfeljebb MAX_AUTHOR), viszont megakadályozza,
   hogy egy abszurd hosszú kifejezésből aránytalanul nagy regex épüljön. */
const MAX_SEARCH = 500;
// A betűméret (százalék) korlátai — EGYEZZENEK a models/quotes.js séma min/max-jával.
const MIN_FONTSIZE = 100;
const MAX_FONTSIZE = 200;

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

    if (!isValidOrder(body.order)) errors.push("Érvénytelen sorszám.");

    /* A betűméret OPCIONÁLIS: hiánya (undefined) esetén a séma alapértéke (155)
       áll be. Ha adott, egész szám és a tartományban legyen — a típusszigor itt is
       NoSQL-injekció ellen véd (operátor-objektum ne juthasson a mentésbe). */
    if (body.fontSize !== undefined &&
        (!isInteger(body.fontSize) || body.fontSize < MIN_FONTSIZE || body.fontSize > MAX_FONTSIZE))
        errors.push("Érvénytelen betűméret.");

    return errors;
}

// Létrehozáshoz és módosításhoz: a törzs ellenőrzése.
const validateQuoteBody = (request, response, next) => {
    const errors = quoteErrors(request.body ?? {});
    if (errors.length) return response.status(400).json(errors.join(" "));
    next();
};
/* ÖNLEÍRÁS: „ez a middleware egy kérés-TÖRZSET validál" — l. a párját a
   validateTodo.js-ben (validateTodoBody.validatesBody) és a kaput a
   validationBoundary.test.js-ben. */
validateQuoteBody.validatesBody = true;

/* A szerző-szűrő (/quotes/:author) a body author mezőjét egyenesen a
   lekérdezésbe teszi — operátor ne juthasson bele. A szerző itt is lehet üres
   string (a "névtelen" idézetek szűrése), csak string legyen. */
const validateAuthorFilter = (request, response, next) => {
    if (!isText(request.body?.author)) return response.status(400).json("Érvénytelen szerző.");
    next();
};

/* A kereséshez (/quotes/search, /quotes/search-mode): a kifejezés escape-elve
   egyenesen egy regexbe, majd a lekérdezésbe kerül — operátor ne juthasson bele
   (string legyen), és üres/csak-szóköz kifejezésre ne is fussunk keresést. A
   típusszigor itt is NoSQL-injekció ellen véd. */
const validateSearchTerm = (request, response, next) => {
    const term = request.body?.term;
    if (!isText(term) || !term.trim()) return response.status(400).json("Érvénytelen keresőkifejezés.");
    if (term.length > MAX_SEARCH) return response.status(400).json(`A keresés legfeljebb ${MAX_SEARCH} karakter lehet.`);
    next();
};

/* A szerző-JAVASLAT prefixe (/quotes/authors): ugyanúgy escape-elve regexbe kerül,
   mint a keresőkifejezés, tehát ugyanúgy string legyen (NoSQL-injekció ellen), és
   ugyanúgy legyen felső korlátja — enélkül egy abszurd hosszú prefixből
   aránytalanul nagy regex épülne.

   Ez a validátor 2026-08-18-án született: addig ez volt az EGYETLEN bemenetet
   fogadó útvonal validáló middleware nélkül. Nem volt sebezhető (a controller a
   `typeof`-fal stringgé kényszeríti a prefixet, l. readAuthors.js), de a
   hosszkorlát hiányzott, és a testvér-végpontjától eltérő viselkedést semmi nem
   indokolta. A controller `typeof`-ja SZÁNDÉKOSAN marad a helyén: a védelem ne
   azon múljon, hogy a routes.js-ben a helyes sorrendben áll-e a middleware.

   ELTÉRÉS a validateSearchTerm-től (fentebb): ott az ÜRES kifejezés hiba, itt
   ÉRVÉNYES. Az ok a két végpont különböző jelentése — a keresés üres szövegre
   értelmetlen, az üres prefix viszont definiált: "a legutóbb használt szerző"
   (readAuthors.js). A hossz felső korlátja pedig a szerzőnév korlátja
   (MAX_AUTHOR), nem a keresésé: egy szerzőnév ELEJE nem lehet hosszabb, mint
   maga a leghosszabb megengedett szerzőnév — ami ennél hosszabb, az biztosan
   nem javaslatot keres. */
const validateAuthorPrefix = (request, response, next) => {
    const prefix = request.body?.prefix;
    if (!isText(prefix)) return response.status(400).json("Érvénytelen szerző-előtag.");
    if (prefix.length > MAX_AUTHOR)
        return response.status(400).json(`A szerző-előtag legfeljebb ${MAX_AUTHOR} karakter lehet.`);
    next();
};

/* Az id- és a sorszám-ellenőrzés NEM innen jön: azok minden szekcióban azonosak,
   ezért a közös validators.js-ben élnek, és a routes.js onnan is importálja őket. */
module.exports = {validateQuoteBody, validateAuthorFilter, validateSearchTerm, validateAuthorPrefix};
