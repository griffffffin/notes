const router = require("express").Router();
const bcrypt = require("bcrypt");
const Users = require("../../models/users");
const serverError = require("../../serverError");
const {signToken} = require("../../token");
const {setTokenCookie} = require("../../tokenCookie");
// A költségtényező a login álca-hash-ével KÖZÖS forrásból jön (l. password.js).
const {SALT_WORK_FACTOR} = require("../../password");

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/;

/* A névütközés válasza 409 (Conflict), nem 400: a kérés önmagában rendben van,
   csak a szerver JELENLEGI állapotával ütközik. Nevesítve, mert a frontend EBBŐL
   a KÓDBÓL ismeri fel a névütközést (User/entryError.ts) — a mondatból nem
   szabad, azt bármikor átfogalmazhatjuk. A két oldal egyezését a
   frontendContract.test.js őrzi. */
const NAME_TAKEN_STATUS = 409;

/* A név megléte és típusa a validateCredentials middleware dolga; itt már csak
   a jelszó-szabály és a névütközés maradt — ezek VÁRT hibák, a felhasználónak
   szólnak, ezért konkrét üzenetet kapnak. A többi (bcrypt- vagy adatbázis-hiba)
   váratlan: a részletei a naplóba valók, nem a válaszba.

   A régi "ValidationError:" / "MongoServerError:" előtagok szándékosan tűntek
   el az üzenetekből: megnevezték a Mongoose hibaosztályát és az adatbázis
   fajtáját. A felhasználónak semmit nem mondtak, egy támadónak viszont ingyen
   elárulták, mi fut alattunk. */
module.exports = router.post("/", async (request, response) => {
    const name = request.body.name;
    const password = request.body.password;

    if (!PASSWORD_RULE.test(password))
        return response.status(400).json(
            "A jelszó legalább 8 karakter legyen. Kis-, nagybetűkből és számokból álljon.");

    try {
        const hashedPassword = await bcrypt.hash(password, SALT_WORK_FACTOR);
        const user = await new Users({name: name, password: hashedPassword}).save();
        /* A TOKEN A SÜTIBE MEGY, A TÖRZSBE A NÉV. A törzsben visszaadott token
           azt jelentette, hogy a JavaScript megkapja — épp azt szüntetjük meg
           (l. tokenCookie.js). A név viszont kell: a felület ebből tudja, hogy
           sikerült a belépés, és kit köszöntsön; ugyanaz az alak, amit a /me ad,
           tehát a kliensnek egyetlen szerződést kell ismernie. */
        setTokenCookie(request, response, signToken(user._id, user.tokenVersion));
        return response.json({name: user.name});
    } catch (error) {
        /* 11000: a Mongo egyedi indexének ütközés-kódja — a név már foglalt.
           A státusz indoklása a NAME_TAKEN_STATUS-nál, a fájl tetején. */
        if (error.code === 11000)
            return response.status(NAME_TAKEN_STATUS).json(name + " felhasználónév már foglalt.");
        return serverError(response, error, "Users.create");
    }
});
