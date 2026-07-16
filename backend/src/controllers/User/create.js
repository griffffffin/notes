const router = require("express").Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../../models/user");
const serverError = require("../../serverError");

const SALT_WORK_FACTOR = 10;
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/;

/* A név megléte és típusa a validateCredentials middleware dolga; itt már csak
   a jelszó-szabály és a névütközés maradt — ezek VÁRT hibák, a felhasználónak
   szólnak, ezért konkrét üzenetet kapnak. A többi (bcrypt- vagy adatbázis-hiba)
   váratlan: a részletei a naplóba valók, nem a válaszba. */
module.exports = router.post("/", async (request, response) => {
    const name = request.body.name;
    const password = request.body.password;

    if (!PASSWORD_RULE.test(password))
        return response.status(400).json(
            "ValidationError:  A jelszo legalabb 8 karakter legyen. Kis-, nagybetukbol es szamokbol alljon.");

    try {
        const hashedPassword = await bcrypt.hash(password, SALT_WORK_FACTOR);
        const user = await new User({name: name, password: hashedPassword}).save();
        return response.json(jwt.sign({id: user._id}, process.env.JWT_SECRET, {expiresIn: "7d"}));
    } catch (error) {
        // 11000: a Mongo egyedi indexének ütközés-kódja — a név már foglalt.
        if (error.code === 11000)
            return response.status(400).json("MongoServerError: " + name + " felhasznalonev mar foglalt.");
        return serverError(response, error, "User.create");
    }
});
