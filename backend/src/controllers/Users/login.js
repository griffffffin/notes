const router = require("express").Router();
const Users = require("../../models/users");
const bcrypt = require("bcrypt");
const {signToken} = require("../../token");

/* A hibaüzenet SZÁNDÉKOSAN ugyanaz ismeretlen névre és rossz jelszóra.
   Korábban a kettő elkülönült ("Hibas felhasznalonev." / "Hibas jelszo."), ami
   fióklista-felderítést engedett: elég volt neveket próbálgatni. A frontend
   eddig is egyetlen közös üzenetet írt ki, tehát a megkülönböztetés csak a
   támadónak volt hasznos. */
const BAD_LOGIN = "Hibás felhasználónév vagy jelszó.";

/* A sikertelen belépés státusza 400, NEM a szemantikailag pontosabb 401.

   Nem hanyagság: a 401-nek a rendszerben MÁSIK jelentése van. A kliens
   handleAxios-a minden 401-es válaszra kiléptet (frontend/src/contexts/auth.tsx:
   `responseStatus(error) === 401 → removeCookie`), mert a 401 nála azt jelenti,
   hogy a MEGLÉVŐ token járt le. Ha a belépés kudarca is 401 volna, a rossz
   jelszó átfutna a globális kiléptető ágon — ma ártalmatlanul (a belépő oldalon
   nincs süti), de a két jelentés összemosódna, és a következő módosítás már
   valódi hibát okozhatna.

   Ezért a 400 itt SZERZŐDÉS, nem véletlen: a frontend erre a kódra írja ki a
   "hibás név vagy jelszó" üzenetet (frontend/src/components/User/entryError.ts),
   és a kettő egyezését a frontendContract.test.js őrzi. Ha valaki "kijavítja"
   401-re, a teszt hangosan megbukik — nem a felhasználó fedezi fel. */
const BAD_LOGIN_STATUS = 400;

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
        const user = await Users.findOne({name: request.body.name});
        const isMatch = await bcrypt.compare(request.body.password, user?.password ?? DUMMY_HASH);
        if (!user || !isMatch) return response.status(BAD_LOGIN_STATUS).json(BAD_LOGIN);
        return response.json(signToken(user._id));
    } catch (error) {
        // A részletek a szerver naplójába valók, nem a válaszba.
        console.error("Bejelentkezési hiba:", error);
        return response.status(500).json("Sikertelen bejelentkezés.");
    }
});
