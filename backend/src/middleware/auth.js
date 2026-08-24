const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Users = require("../models/users");
const {readTokenCookie} = require("../tokenCookie");

/* Minden védett végpont előtt fut: a HttpOnly SÜTIBŐL veszi az aláírt JWT-t,
   ellenőrzi, és a benne igazolt user-azonosítót teszi a request.userId-ba — a
   kliens által a body-ban küldött user-értéknek a védett végpontokon nincs
   többé szerepe.

   A TOKEN KORÁBBAN AZ `Authorization: Bearer` FEJLÉCBEN JÖTT, és a böngészőben
   JavaScript tette oda. Az a forma szerkezetileg kiszolgáltatta a tokent minden
   befecskendezett szkriptnek; a sütit a JS már nem is látja (l. tokenCookie.js).
   A fejléces utat NEM tartjuk meg tartalékként: két elfogadott bemenet közül a
   gyengébb határozná meg a biztonságot, és egy XSS pontosan azt választaná.

   FONTOS: az érvényes aláírás CSAK azt bizonyítja, hogy a tokent mi állítottuk
   ki, és azóta nem hamisították meg. Azt NEM, hogy a benne szereplő fiók ma is
   létezik — a JWT magában hordozza az állítást, nem kérdez rá senkire. Ezért a
   törölt fiók tokenje a lejáratáig (7 nap) tovább élt: a szerver beengedte, sőt
   a nevében létre lehetett hozni és törölni is to-dót. A lenti létezés-
   ellenőrzés ezt zárja le. Ára: minden védett kérés egy adatbázis-olvasással
   jár — elsődleges kulcson, tehát ezen a méreten elhanyagolható. */
module.exports = async (request, response, next) => {
    const token = readTokenCookie(request);
    if (!token) return response.status(401).json("Hiányzó token.");

    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return response.status(401).json("Érvénytelen token.");
    }

    // Formailag hibás azonosító: ilyet mi nem állítunk ki, nincs értelme
    // adatbázishoz fordulni vele (különben CastError-t kapnánk).
    if (!mongoose.isValidObjectId(payload.id)) return response.status(401).json("Érvénytelen token.");

    let user;
    try {
        user = await Users.findById(payload.id);
    } catch {
        /* Itt az adatbázis mondott nemet, nem a felhasználó. Ezt SZÁNDÉKOSAN
           nem 401-gyel jelezzük: a kliens a 401-re kijelentkeztet, és egy múló
           adatbázis-hiba nem dobhatja ki a felhasználót. */
        return response.status(503).json("Az adatbázis nem elérhető.");
    }
    if (!user) return response.status(401).json("A felhasználó nem létezik.");

    /* A MUNKAMENET-VISSZAVONÁS KAPUJA. A lejárat önmagában kevés volt: a /refresh
       minden érvényes tokenért frisset ad, tehát egy ellopott tokent korlátlanul
       meg lehetett újítani, és semmivel nem lehetett kirúgni. A tárolt szám
       növelése (controllers/Users/logout.js) ezt a láncot vágja el.

       MINDKÉT IRÁNYBA ZÁR, és ez a lényeg. A `typeof` vizsgálat nem formaság: a
       puszta `payload.ver !== user.tokenVersion` összehasonlítás akkor is IGAZAT
       adna, ha MINDKÉT oldal `undefined` — vagyis egy `ver` nélküli régi token
       egy `tokenVersion` nélküli felhasználóhoz átcsúszna, némán. Így viszont a
       tokenből jövő értéknek SZÁMNAK kell lennie, és egyeznie kell.

       Ez egyben azt is jelenti, hogy a bevezetés előtt kiadott tokenek (nincs
       bennük `ver`) érvénytelenek: az élesítés egyszer mindenkit kiléptet. Ez
       szándékos — egy visszavonhatatlan munkamenetet nem hagyunk életben azért,
       hogy a bevezetés kényelmesebb legyen. */
    if (typeof payload.ver !== "number" || payload.ver !== user.tokenVersion)
        return response.status(401).json("A munkamenet visszavonva.");

    request.userId = payload.id;
    /* A NÉV a /me válaszához kell (controllers/Users/me.js). Azért innen adjuk
       tovább, mert az auth már kiolvasta a teljes dokumentumot: külön lekérdezés
       nélkül megvan. A jelszó-hash és a piszkozat-kulcs SZÁNDÉKOSAN nem kerül a
       request-re — amit nem adunk tovább, azt nem is lehet véletlenül kiküldeni. */
    request.userName = user.name;
    /* A megújítás (controllers/Users/refresh.js) EBBŐL tudja, milyen verziót írjon
       a friss tokenbe. Azért adjuk tovább, mert az auth már úgyis kiolvasta a
       felhasználót: külön lekérdezés nélkül megvan. */
    request.tokenVersion = user.tokenVersion;
    next();
};
