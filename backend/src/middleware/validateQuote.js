const {isText, isValidOrder} = require("./validators");

/* Az idézet-kérések törzsének ellenőrzése, MIELŐTT bármi az adatbázisig jutna —
   ugyanazokból az okokból, mint a to-dónál (validateTodo.js): a findByIdAndUpdate
   nem futtat sémavalidátort, a séma csak a típust nézi (nem a hosszt/tartományt),
   és a típus-szigor NoSQL-injekció ellen is véd (egy string helyére küldött
   {"$ne": null} operátorként jutna a szűrőbe).

   VÉGPONTOK KÖZÖTTI TITKOSÍTÁS (E2EE) UTÁN a validátor DRASZTIKUSAN vékonyabb: a
   tartalmi mezők (idézet, szerző, betűméret, createdAt) egyetlen titkosított
   borítékba (`ciphertext`) kerültek, amit a szerver SOHA nem lát nyíltan (E2EE.md
   3–4.). Így a tartalom SZABÁLYAIT (kötelező-e a szöveg, milyen hosszú lehet a
   szerző, mekkora a betűméret) a szerver nem is TUDJA már ellenőrizni — azok a
   kliens dolgai, a titkosítás ELŐTT. Ami marad: a boríték ALAKJA (nem-üres szöveg,
   józan felső korláttal) és a nyílt sorszám. A korábbi szerző-szűrő, keresés- és
   szerző-előtag-validátorok ELTŰNTEK a szerver-oldali kereséssel/szűréssel együtt
   (F3 hozza vissza kliens-oldalon).

   ELTÉRÉS a to-do validátorától (validateTodo.js): a két modul SZÁNDÉKOSAN nem
   importál egymásból. Az idézet ma már egyetlen borítékot tárol; a to-do egyelőre
   nyílt mezőket (a to-do E2EE-átállása külön menet). Ami minden szekcióban azonos —
   a típus-ellenőrzők, a sorszám- és az id-middleware —, az a közös validators.js-ből
   jön. */

/* A TITKOSÍTOTT BORÍTÉK felső hosszkorlátja. A szerepe TISZTÁN DoS-védelem: a
   tartalom valódi hosszát (a nyílt idézet ~100 000 karakteres korlátját) a szerver
   már nem látja, csak a base64-elt ciphertextet. Ez a korlát bőven fedi bármely
   értelmes titkosított idézetet — még egy csupa 4 bájtos karakterből álló, maximális
   nyílt idézet borítéka is jóval alatta marad (~0,5 MB) —, viszont az abszurd nagy
   írásokat kizárja, messze a Mongo-dokumentum 16 MB-os kemény határa alatt. NEM
   bit-tárolású (ez csak egy hossz-összehasonlítás), ezért nincs oka 2-hatványnak lennie. */
const MAX_CIPHERTEXT = 1000000;

function quoteErrors(body) {
    const errors = [];

    /* A boríték nem-üres SZÖVEG. A típusszigor itt is NoSQL-injekció ellen véd (egy
       operátor-objektum ne juthasson a mentésbe), az üres-ellenőrzés pedig azt zárja,
       hogy tartalom nélküli sor keletkezzen. A `trim()` szándékosan NEM kell: a
       ciphertext base64/pont-tagolt formátum, ott nincs értelmes „csak szóköz" eset. */
    if (!isText(body.ciphertext) || body.ciphertext.length === 0)
        errors.push("A titkosított tartalom megadása kötelező.");
    else if (body.ciphertext.length > MAX_CIPHERTEXT)
        errors.push(`A titkosított tartalom legfeljebb ${MAX_CIPHERTEXT} karakter lehet.`);

    if (!isValidOrder(body.order)) errors.push("Érvénytelen sorszám.");

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

/* Az id- és a sorszám-ellenőrzés NEM innen jön: azok minden szekcióban azonosak,
   ezért a közös validators.js-ben élnek, és a routes.js onnan is importálja őket. */
module.exports = {validateQuoteBody};
