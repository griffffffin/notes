const router = require("express").Router();
const Users = require("../../models/users");
const bcrypt = require("bcrypt");
const {signToken} = require("../../token");
const {setTokenCookie} = require("../../tokenCookie");
// A naplózás egyetlen kapuja — a hibaobjektum titkot vihetne a naplóba (log.js).
const {logInfo, logError} = require("../../log");

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
const {DUMMY_HASH, SALT_WORK_FACTOR} = require("../../password");

/* A JELSZÓ ÁTHASHELÉSE, ha a tárolt hash még a RÉGI költségtényezővel készült.

   Miért kell. A bcrypt a tényezőt beleírja a hashbe, tehát egy emelés (2026-08-18:
   10 → 11) a MEGLÉVŐ jelszavakat nem érinti: azok továbbra is a régi, olcsóbb
   tényezővel ellenőrződnek. Két baj származik ebből, és a második a súlyosabb:

     - a régi jelszó nem kapja meg a védelmet, amiért az emelés történt;
     - KEVERT tényezők mellett a bejelentkezés ideje felhasználónként eltér, az
       álca-hash pedig már az ÚJ tényezőt használja — vagyis a válaszidőből megint
       kiolvasható lenne, létezik-e a fiók (l. password.js).

   Ezért az emelés után az ELSŐ sikeres belépés újraírja a hasht. Csak akkor, ha a
   jelszó helyes volt: ilyenkor a nyílt szöveg a kezünkben van, és csak ilyenkor
   van jogunk hozzányúlni a fiókhoz.

   NEM VÁRJUK MEG a mentést a válasszal (`await` nélkül, saját hibaággal): a
   felhasználót nem hátráltathatja egy karbantartó művelet, és ha a mentés
   elbukik, a belépés akkor is sikeres — a következő belépéskor újra megpróbáljuk.
   A hiba a szerver naplójába megy, nem a válaszba.

   A `getRounds` ÉRVÉNYES bcrypt-hasht vár; ha az adatbázisban valaha más állna, a
   dobott kivétel egy egyébként sikeres belépést rontana el. Ezért van try/catch:
   a felismerhetetlen hasht nem hasheljük át, csak naplózzuk. */
function rehashIfOutdated(user, password) {
    let rounds;
    try {
        rounds = bcrypt.getRounds(user.password);
    } catch (error) {
        return logError("A tárolt jelszó-hash nem olvasható (költségtényező)", error);
    }
    if (rounds === SALT_WORK_FACTOR) return;

    bcrypt.hash(password, SALT_WORK_FACTOR)
        .then((hashedPassword) => Users.updateOne({_id: user._id}, {password: hashedPassword}))
        .then(() => logInfo(`A(z) ${user._id} jelszava átállt a ${SALT_WORK_FACTOR}-es költségtényezőre.`))
        .catch((error) => logError("Sikertelen jelszó-áthashelés", error));
}

module.exports = router.post("/", async (request, response) => {
    try {
        const user = await Users.findOne({name: request.body.name});
        const isMatch = await bcrypt.compare(request.body.password, user?.password ?? DUMMY_HASH);
        if (!user || !isMatch) return response.status(BAD_LOGIN_STATUS).json(BAD_LOGIN);
        rehashIfOutdated(user, request.body.password);
        /* A TOKEN A SÜTIBE MEGY, A TÖRZSBE A NÉV. A törzsben visszaadott token
           azt jelentette, hogy a JavaScript megkapja — épp azt szüntetjük meg
           (l. tokenCookie.js). A név viszont kell: a felület ebből tudja, hogy
           sikerült a belépés, és kit köszöntsön; ugyanaz az alak, amit a /me ad,
           tehát a kliensnek egyetlen szerződést kell ismernie. */
        setTokenCookie(request, response, signToken(user._id, user.tokenVersion));
        return response.json({name: user.name});
    } catch (error) {
        // A részletek a szerver naplójába valók, nem a válaszba.
        logError("Bejelentkezési hiba", error);
        return response.status(500).json("Sikertelen bejelentkezés.");
    }
});
