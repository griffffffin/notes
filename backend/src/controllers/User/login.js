const router = require("express").Router();
const User = require("../../models/user");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

/* A hibaüzenet SZÁNDÉKOSAN ugyanaz ismeretlen névre és rossz jelszóra.
   Korábban a kettő elkülönült ("Hibas felhasznalonev." / "Hibas jelszo."), ami
   fióklista-felderítést engedett: elég volt neveket próbálgatni. A frontend
   eddig is egyetlen közös üzenetet írt ki, tehát a megkülönböztetés csak a
   támadónak volt hasznos. */
const BAD_LOGIN = "Error: Hibas felhasznalonev vagy jelszo.";

/* Álca-hash. Az azonos hibaüzenet önmagában kevés: a VÁLASZIDŐ is árulkodik.
   Ismeretlen névnél nem lenne mit ellenőrizni, tehát azonnal válaszolnánk;
   létező névnél megvárnánk a bcrypt ~100 ms-os számítását. A különbség mérhető,
   és ugyanúgy elárulja, hogy létezik-e a fiók. Ezért ismeretlen névnél is
   lefuttatunk egy összehasonlítást — ez ellen. Indításkor egyszer számoljuk ki.

   A bcrypt lassúsága itt SZÁNDÉKOS (nem hiba): a jelszó-visszafejtést teszi
   drágává. Ezért kell hozzá igazítani az ismeretlen ág idejét, nem fordítva. */
const DUMMY_HASH = bcrypt.hashSync("nincs-ilyen-jelszo", 10);

module.exports = router.post("/", async (request, response) => {
    try {
        const user = await User.findOne({name: request.body.name});
        const isMatch = await bcrypt.compare(request.body.password, user?.password ?? DUMMY_HASH);
        if (!user || !isMatch) return response.status(400).json(BAD_LOGIN);
        return response.json(jwt.sign({id: user._id}, process.env.JWT_SECRET, {expiresIn: "7d"}));
    } catch (error) {
        // A részletek a szerver naplójába valók, nem a válaszba.
        console.error("Bejelentkezési hiba:", error);
        return response.status(500).json("Error: A bejelentkezes most nem sikerult.");
    }
});
