const router = require("express").Router();
const Users = require("../../models/users");
const serverError = require("../../serverError");

/* KIJELENTKEZÉS = MINDEN KIADOTT TOKEN VISSZAVONÁSA.

   Eddig a kijelentkezés tisztán kliens-oldali volt: a böngésző eldobta a sütit,
   és ennyi. A token maga TOVÁBB ÉLT a lejáratáig, sőt a /refresh minden érvényes
   tokenért frisset adott — vagyis egy lemásolt token birtokosát semmi nem
   zavarta meg abban, hogy a munkamenetet a végtelenségig meghosszabbítsa. A
   "kijelentkeztem" tehát a felhasználó számára azt jelentette, hogy eltűnt a
   felület; a szerver felől nem jelentett semmit.

   A tárolt szám növelése ezt a láncot vágja el: az auth middleware minden
   kérésnél összeveti a token `ver` mezőjével (middleware/auth.js), tehát a
   növelés pillanatában MINDEN korábban kiadott token halott.

   EZ GLOBÁLIS, ÉS EZ SZÁNDÉKOS: a telefonon nyitva hagyott munkamenet is
   megszűnik, nem csak az, amelyikből kiléptünk. A választás tudatos — a
   kijelentkezés attól ér valamit, hogy az elveszett vagy lemásolt munkamenetet
   is elvágja, márpedig épp azt nem tudjuk megnevezni, amiről nem tudunk.

   AZ $inc ATOMI, és ez nem stílus-kérdés. Az "olvasd ki, adj hozzá egyet, írd
   vissza" alak két párhuzamos kijelentkezésnél ugyanazt az értéket olvasná ki
   kétszer, és a második írás a másikat felülírná — a végeredmény eggyel kevesebb
   növelés volna, ami itt azt jelenti, hogy egy munkamenet ÉLETBEN MARAD. Nincs
   hibaüzenet, nincs tünet; csak marad egy token, aminek meg kellett volna halnia.
   Az $inc-et a szerver végzi el egy lépésben, tehát ez nem fordulhat elő.
   (Hogy a FerretDB az $inc-et a mezőt még nem tartalmazó, RÉGI dokumentumokon is
   helyesen hajtja végre — létrehozza és 1-re állítja —, mérve van: l.
   models/users.js.)

   A FELHASZNÁLÓ A TOKENBŐL JÖN, nem a kérés törzséből. Enélkül a végpont
   tetszőleges fiók összes munkamenetét megszüntethetné: kijelentkeztetésre
   használható fegyver lenne bárki kezében, hitelesítés nélkül. */
module.exports = router.post("/", async (request, response) => {
    try {
        await Users.updateOne({_id: request.userId}, {$inc: {tokenVersion: 1}});
        return response.json("Kijelentkezve.");
    } catch (error) {
        /* A HIBÁT NEM NYELJÜK EL. Csábító volna 200-zal válaszolni ("a kliens
           úgyis eldobja a sütit"), de az azt állítaná, hogy a munkameneteket
           visszavontuk, holott nem. A kliens ebből a kódból tudja, hogy a
           kijelentkezés csak helyben sikerült — a döntést, hogy mit tesz ezután,
           ott hozzuk meg (frontend/src/contexts/auth.tsx), nem itt. */
        return serverError(response, error, "Users.logout");
    }
});
