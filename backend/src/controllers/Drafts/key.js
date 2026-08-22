const router = require("express").Router();
const {getOrCreateDraftKey} = require("../../draftKey");
const serverError = require("../../serverError");

/* A BEJELENTKEZETT FELHASZNÁLÓ PISZKOZAT-KULCSA. A miértje (mit véd, mit nem, és
   miért a fiók mellett él) a draftKey.js élén; itt csak a végpont dolga áll.

   AUTH MÖGÖTT, és a felhasználót a TOKENBŐL vesszük: a kulcs a piszkozat
   titkosításának egyetlen titka, tehát kiadni csak a tulajdonosának szabad. A
   kérés törzsét ez a végpont NEM nézi — nincs mit paraméterezni rajta, és amit
   nem olvasunk, azon nem is lehet becsapni.

   A VÁLASZ CSAK A KULCS. A `getOrCreateDraftKey` a teljes felhasználó-
   dokumentumot is a kezében tartja (jelszó-hash, név, létrehozás ideje) — abból
   semmi nem mehet ki a dróton. Ez ugyanaz a whitelist-elv, mint a többi
   olvasó végponton (l. Quotes/readForEdit.js). */
module.exports = router.post("/", (request, response) =>
    getOrCreateDraftKey(request.userId)
        .then((key) => response.json(key))
        .catch((error) => serverError(response, error, "Drafts.key")));
