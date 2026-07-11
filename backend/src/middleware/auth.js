const jwt = require("jsonwebtoken");

/* Minden védett végpont előtt fut: az Authorization: Bearer <token> fejlécből
   ellenőrzi az aláírt JWT-t, és a benne igazolt user-azonosítót teszi a
   request.userId-ba — a kliens által a body-ban küldött user-értéknek a
   védett végpontokon nincs többé szerepe. */
module.exports = (request, response, next) => {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return response.status(401).json("Hiányzó token.");
    jwt.verify(token, process.env.JWT_SECRET, (error, payload) => {
        if (error) return response.status(401).json("Érvénytelen token.");
        request.userId = payload.id;
        next();
    });
};
