const router = require("express").Router();
const User = require("../../models/user");
const bcrypt = require("bcrypt");
const {signToken} = require("../../token");

/* A hibaüzenet SZÁNDÉKOSAN ugyanaz ismeretlen névre és rossz jelszóra.
   Korábban a kettő elkülönült ("Hibas felhasznalonev." / "Hibas jelszo."), ami
   fióklista-felderítést engedett: elég volt neveket próbálgatni. A frontend
   eddig is egyetlen közös üzenetet írt ki, tehát a megkülönböztetés csak a
   támadónak volt hasznos. */
const BAD_LOGIN = "Hibás felhasználónév vagy jelszó.";

/* Az álca-hash a KÖZÖS password.js-ből jön, a jelszó-hashelés költségtényezőjével
   együtt. Miért ott: a kettőnek azonos tényezővel kell készülnie, különben a
   bejelentkezés két ága mérhetően eltérő ideig fut, és a válaszidőből kiderül,
   létezik-e a fiók — hiába azonos a hibaüzenet. A kötés ezért szerkezeti, nem
   kommentre bízott (a részletes indoklás a password.js-ben).

   Mérés a Pi-n, 40-40 kérés (2026-07-16): ismeretlen név átlag 134 ms
   (min 130 / max 139), létező név átlag 134 ms (min 130 / max 146) — az
   eloszlások fedik egymást, nincs kinyerhető jel. */
const {DUMMY_HASH} = require("../../password");

module.exports = router.post("/", async (request, response) => {
    try {
        const user = await User.findOne({name: request.body.name});
        const isMatch = await bcrypt.compare(request.body.password, user?.password ?? DUMMY_HASH);
        if (!user || !isMatch) return response.status(400).json(BAD_LOGIN);
        return response.json(signToken(user._id));
    } catch (error) {
        // A részletek a szerver naplójába valók, nem a válaszba.
        console.error("Bejelentkezési hiba:", error);
        return response.status(500).json("Sikertelen bejelentkezés.");
    }
});
