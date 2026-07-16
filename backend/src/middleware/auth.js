const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/user");

/* Minden védett végpont előtt fut: az Authorization: Bearer <token> fejlécből
   ellenőrzi az aláírt JWT-t, és a benne igazolt user-azonosítót teszi a
   request.userId-ba — a kliens által a body-ban küldött user-értéknek a
   védett végpontokon nincs többé szerepe.

   FONTOS: az érvényes aláírás CSAK azt bizonyítja, hogy a tokent mi állítottuk
   ki, és azóta nem hamisították meg. Azt NEM, hogy a benne szereplő fiók ma is
   létezik — a JWT magában hordozza az állítást, nem kérdez rá senkire. Ezért a
   törölt fiók tokenje a lejáratáig (7 nap) tovább élt: a szerver beengedte, sőt
   a nevében létre lehetett hozni és törölni is to-dót. A lenti létezés-
   ellenőrzés ezt zárja le. Ára: minden védett kérés egy adatbázis-olvasással
   jár — elsődleges kulcson, tehát ezen a méreten elhanyagolható. */
module.exports = async (request, response, next) => {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
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
        user = await User.findById(payload.id);
    } catch {
        /* Itt az adatbázis mondott nemet, nem a felhasználó. Ezt SZÁNDÉKOSAN
           nem 401-gyel jelezzük: a kliens a 401-re kijelentkeztet, és egy múló
           adatbázis-hiba nem dobhatja ki a felhasználót. */
        return response.status(503).json("Az adatbázis nem elérhető.");
    }
    if (!user) return response.status(401).json("A felhasználó nem létezik.");

    request.userId = payload.id;
    next();
};
