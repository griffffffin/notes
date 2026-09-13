const router = require("express").Router();
const Users = require("../../models/users");
const serverError = require("../../serverError");
const {signToken} = require("../../token");
const {setTokenCookie} = require("../../tokenCookie");
// A hashelés a login álca-hash-ével KÖZÖS forrásból jön (argon2id, l. password.js).
const {hashPassword} = require("../../password");
const {isCommonPassword} = require("../../commonPasswords");

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/;

/* A GYENGE JELSZÓ státusza 422 (Unprocessable Entity), NEM 400 — és ez tudatos.

   A frontend a regisztrációs 400-at fixen a „Helytelen jelszó formátum." üzenetre
   képezi (entryError.ts, BAD_PASSWORD_STATUS). Egy gyakori vagy a névvel egyező
   jelszó viszont FORMAILAG teljesen rendben van — csak nem elég erős. Ha ezt is
   400-cal utasítanánk el, a felhasználó azt olvasná, hogy „rossz a formátum",
   holott a formátum jó, és hiába próbálná átalakítani. Ezért külön kód (422) és
   külön üzenet; a frontend erre a kódra a „common" hibaesetet írja ki
   (entryError.ts), és a két oldal egyezését a frontendContract.test.js őrzi. */
const WEAK_PASSWORD_STATUS = 422;
const WEAK_PASSWORD_MESSAGE =
    "Ez a jelszó túl gyakori vagy megegyezik a felhasználónévvel — válassz másikat.";

/* A névütközés válasza 409 (Conflict), nem 400: a kérés önmagában rendben van,
   csak a szerver JELENLEGI állapotával ütközik. Nevesítve, mert a frontend EBBŐL
   a KÓDBÓL ismeri fel a névütközést (User/entryError.ts) — a mondatból nem
   szabad, azt bármikor átfogalmazhatjuk. A két oldal egyezését a
   frontendContract.test.js őrzi. */
const NAME_TAKEN_STATUS = 409;

/* MIÉRT ÁRULJUK EL, HOGY A NÉV FOGLALT — tudatos döntés, 2026-08-24.

   AZ ASZIMMETRIA, amit észre kell venni: a BEJELENTKEZÉSNÉL gondosan elkerüljük a
   fiók-felsorolást (közös hibaüzenet ismeretlen névre és rossz jelszóra, álca-hash
   a nem létező felhasználóhoz, és mért, egyforma válaszidő — l. login.js). ITT
   viszont a válasz kimondja, hogy a név foglalt, vagyis a regisztráció ELÁRULJA,
   létezik-e egy fiók. Aki csak a login.js-t olvassa, joggal hiszi, hogy ez
   elfelejtett átvezetés — nem az.

   MIÉRT MARADHAT ÍGY. A név egyediségét a felhasználónak MEG KELL tudnia, különben
   nem tud másikat választani: ez nem kényelmi kérdés, hanem a regisztráció
   működésének feltétele. A szokásos kitérő (»elküldtük a megerősítő levelet«, és a
   foglaltság csak abból derül ki) e-mail-címet és levélküldést feltételez — nincs
   ilyenünk, és szándékosan nem is kérünk e-mailt.

   AZ ÁRA MÉRVE ALACSONY: a végpont IP-nként ÓRÁNKÉNT 5 kérést enged (routes.js),
   tehát egy címről napi 120 név próbálható végig. Egy valódi fiók-felsoroláshoz ez
   használhatatlanul lassú — és a szűk keret ott nem a felsorolás miatt van, hanem
   a fiók-özön ellen; a felsorolás ellen ingyen kapjuk.

   ⚠ MITŐL ROMLANA EL: ha a `/user/create` korlátja valaha lazul (vagy lekerül), ez
   a döntés a döntés MAGYARÁZATÁVAL együtt érvényét veszti. A kettő tehát össze van
   kötve — és a kötést már NEM csak ez a komment tartja: a
   userCreateRateLimitBinding.test.js kiolvassa a routes.js tényleges keretét, és
   hangosan megbukik, ha az enumerációs költségvetés (név/óra) a küszöb fölé nő. */

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

    /* A FORMA rendben — most az ERŐSSÉG. Két olcsó, hálózat nélküli ellenőrzés,
       még a bcrypt (a drága művelet) ELŐTT:
         - a jelszó ne EGYEZZEN a felhasználónévvel (kis-/nagybetűtől függetlenül) —
           ez a legkézenfekvőbb tipp, és a fiók-korlát után az első, amit próbálnak;
         - a jelszó ne legyen rajta a gyakori-jelszó-listán (commonPasswords.js). */
    if (password.toLowerCase() === name.toLowerCase() || isCommonPassword(password))
        return response.status(WEAK_PASSWORD_STATUS).json(WEAK_PASSWORD_MESSAGE);

    try {
        const hashedPassword = await hashPassword(password);
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
