const router = require("express").Router();
const Users = require("../../models/users");
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

/* Az álca-hash, a hashelés és az ellenőrzés a KÖZÖS password.js-ből jön. Miért
   ott: az álca-hashnek azonos algoritmussal és paraméterrel kell készülnie, mint a
   valódi jelszavaké, különben a bejelentkezés két ága mérhetően eltérő ideig fut, és
   a válaszidőből kiderül, létezik-e a fiók — hiába azonos a hibaüzenet. A kötés ezért
   szerkezeti, nem kommentre bízott (a részletes indoklás a password.js-ben).

   Az álca-hash az argon2 szinkron API-jának hiánya miatt egy Promise, amit
   belépésenként bevárunk (a modul betöltésekor melegen indul, tehát ez rendszerint
   egy már beolvadt érték).

   Mérés a Pi-n, 40-40 kérés (2026-07-16, bcrypt-11): ismeretlen név átlag 134 ms,
   létező név átlag 134 ms — az eloszlások fedték egymást. Az argon2id álca-hash
   (~244 ms) a bcrypt-11-hez (~245 ms) hangolva, tehát az egyezés a migráció alatt
   is áll (l. password.js paraméter-választás). */
const {dummyHashPromise, verifyPassword, needsRehash, hashPassword} = require("../../password");

/* A JELSZÓ ÁTHASHELÉSE, ha a tárolt hash nem a mai beállítással készült.

   Miért kell. A migráció alatt a régi jelszavak bcrypt-tel vannak tárolva; a mai
   algoritmus argon2id (l. password.js). Két baj él, amíg egy fiók bcrypt-hasht
   hordoz, és a második a súlyosabb:

     - a régi jelszó nem kapja meg az argon2id memória-keménységét;
     - KEVERT hashek mellett a bejelentkezés ideje felhasználónként eltér, az
       álca-hash pedig már argon2id — vagyis a válaszidőből megint kiolvasható
       lenne, létezik-e a fiók (l. password.js). Ezt az eltérést a bcrypt-11 és az
       argon2id azonos időre hangolása enyhíti, de a végleges gyógyír az áthashelés.

   Ezért az ELSŐ sikeres belépés átírja a hasht argon2id-re. Csak akkor, ha a jelszó
   helyes volt: ilyenkor a nyílt szöveg a kezünkben van, és csak ilyenkor van jogunk
   a fiókhoz nyúlni. Ugyanez a gépezet vitte korábban a bcrypt-költségtényező
   emelését is — most az ALGORITMUST váltja, nem a költséget.

   NEM VÁRJUK MEG a mentést a válasszal (`await` nélkül, saját hibaággal): a
   felhasználót nem hátráltathatja egy karbantartó művelet, és ha a mentés elbukik,
   a belépés akkor is sikeres — a következő belépéskor újra megpróbáljuk. A hiba a
   szerver naplójába megy, nem a válaszba.

   A needsRehash ide már csak SIKERES verifyPassword után jut, tehát a hash ép; a
   régi (bcrypt) hasht az előtagja alapján ismeri fel, argon2-t nem próbál rá
   értelmezni (l. password.js). */
function rehashIfNeeded(user, password) {
    if (!needsRehash(user.password)) return;

    hashPassword(password)
        .then((hashedPassword) => Users.updateOne({_id: user._id}, {password: hashedPassword}))
        .then(() => logInfo(`A(z) ${user._id} jelszava átállt argon2id-re.`))
        .catch((error) => logError("Sikertelen jelszó-áthashelés", error));
}

module.exports = router.post("/", async (request, response) => {
    try {
        const user = await Users.findOne({name: request.body.name});
        const storedHash = user?.password ?? await dummyHashPromise;
        /* A verifyPassword a ROSSZ jelszóra false-t ad; egy STRUKTURÁLISAN romlott
           tárolt hashre viszont dobhat (argon2-ág). Az ilyet NEM engedjük 500-zá
           dagadni: naplózzuk, és nem-egyezésként kezeljük — a felhasználó a szokásos,
           megkülönböztethetetlen 400-at kapja, nem tudja meg, hogy létező fiók
           hasht rontott el. (Őre: loginBadHash.test.js.) */
        let isMatch;
        try {
            isMatch = await verifyPassword(storedHash, request.body.password);
        } catch (error) {
            logError("A tárolt jelszó-hash nem ellenőrizhető", error);
            isMatch = false;
        }
        if (!user || !isMatch) return response.status(BAD_LOGIN_STATUS).json(BAD_LOGIN);
        rehashIfNeeded(user, request.body.password);
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
