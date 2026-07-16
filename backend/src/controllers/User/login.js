const router = require("express").Router();
const User = require("../../models/user");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

/* A hibaüzenet SZÁNDÉKOSAN ugyanaz ismeretlen névre és rossz jelszóra.

   Korábban a kettő elkülönült ("Hibas felhasznalonev." / "Hibas jelszo."), ami
   fióklista-felderítést engedett: elég volt neveket próbálgatni, és a válaszból
   kiderült, melyik létezik. A frontend eddig is egyetlen közös üzenetet írt ki
   ("Hibás felhasználónév vagy jelszó."), tehát a megkülönböztetés csak a
   támadónak volt hasznos.

   Ami MÉG megmarad: a válaszidő. Ismeretlen névnél azonnal válaszolunk, létező
   névnél megvárjuk a bcrypt-ellenőrzést (~100 ms) — a különbségből ugyanez
   kikövetkeztethető. Ezt a bejelentkezés próbálkozás-korlátozásával együtt kell
   lezárni, mielőtt az app netre kerül. */
const BAD_LOGIN = "Error: Hibas felhasznalonev vagy jelszo.";

module.exports = router.post("/", ((request, response) =>
        User.findOne({"name": request.body.name})
            .then((user) =>
                (user === null) ? response.status(400).json(BAD_LOGIN) :
                    bcrypt.compare(request.body.password, user.password, (error, isMatch) =>
                        (error) ? response.status(400).json("Error: " + error) :
                            (isMatch) ?
                                response.json(jwt.sign({id: user._id}, process.env.JWT_SECRET,
                                    {expiresIn: "7d"})) :
                                response.status(400).json(BAD_LOGIN)))
            .catch((error) => response.status(400).json(error))
));
