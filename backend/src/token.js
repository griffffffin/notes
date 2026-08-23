const jwt = require("jsonwebtoken");

/* A token élettartama SZÁNDÉKOSAN rövid — ez a tétlenségi kijelentkezés lelke.

   Ha csak a böngészőben járna egy időzítő, a FELÜLET nézne kijelentkezettnek,
   de a lemásolt süti a szerveren tovább élne a régi lejáratáig (7 nap volt).
   Így viszont maga a token válik használhatatlanná: negyed óra tétlenség után a
   szerver sem fogadja el többé.

   Munka közben nem dob ki: amíg használod az appot, a kliens csendben megújítja
   (POST /refresh, legfeljebb 5 percenként). A megújítást AKTIVITÁS váltja ki,
   nem az óra — így a token lejárata mindig a legutóbbi tevékenységedhez
   igazodik, és tétlen munkamenetet soha nem hosszabbít meg.

   A 15 perc a kliens tétlenségi határával egyezik (contexts/auth.tsx):
   a kettőt EGYÜTT kell módosítani. */
const TOKEN_TTL = "15m";

/* A `ver` a MUNKAMENET-VISSZAVONÁS jele: a felhasználó `tokenVersion` mezőjének
   pillanatnyi értéke (models/users.js). Az auth middleware minden kérésnél
   összeveti a tárolttal, tehát a kijelentkezéskori növelés egyszerre öli meg az
   összes addig kiadott tokent — azt is, ami egy másik eszközön fekszik.

   A KIÁLLÍTÁS HANGOSAN ELHASAL, ha a verzió hiányzik, és ez nem szigorúskodás.
   Enélkül egy elfelejtett második paraméter `ver: undefined`-ot írna a tokenbe;
   azt az auth elutasítaná, tehát a felhasználó sikeresen BELÉPNE, majd az első
   kérésnél kirepülne, minden magyarázat nélkül. A hiba oda tartozik, ahol
   elkövették — a kiállításhoz —, nem a következő kérésre. */
const signToken = (id, tokenVersion) => {
    if (typeof tokenVersion !== "number")
        throw new TypeError(
            "A token kiállításához a tokenVersion kötelező (l. models/users.js).");
    return jwt.sign({id, ver: tokenVersion}, process.env.JWT_SECRET, {expiresIn: TOKEN_TTL});
};

module.exports = {signToken};
