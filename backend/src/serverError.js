/* Váratlan szerverhiba kezelése: a RÉSZLETEK a naplóba, a kliensnek csak egy
   általános üzenet.

   Eddig a nyers hibaobjektum ment vissza ("Error: " + error), ami elárulta a
   belső működést: séma-mezőneveket, az ORM nevét és verziófüggő üzeneteit —
   pont azt a térképet, amiből egy támadó tájékozódik. A felhasználónak ezek
   amúgy sem mondanak semmit, a fejlesztőnek pedig a naplóban a helyük, ahol
   ráadásul a teljes stack is megvan.

   FONTOS: a VÁRT, felhasználónak szóló hibák (üres cím, foglalt név, hibás
   jelszó) NEM ide tartoznak — azokat a hívó maga fogalmazza meg, mert a
   felhasználó azokból tud javítani. Ez a függvény csak arra való, amire nincs
   értelmes válasz.

   A NAPLÓZÁS MAGA A logError.js-ben van, és ez nem stílus-kérdés: a korábbi alak a
   hibaOBJEKTUMOT adta át a `console.error`-nak, amiből a Node minden
   mezőt kiírt — mérve odáig, hogy egy driver-hiba mélyén ülő jelszó-hash és
   `draftKey` is a naplóba került volna. Az indoklás és a két védelmi réteg
   (whitelist + redaktor) ott, egy helyen van. */
const {logError} = require("./logError");

module.exports = function serverError(response, error, context) {
    logError(context, error);
    return response.status(500).json("Sikertelen művelet.");
};
