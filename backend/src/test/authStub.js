/* EGY HELY, AHOL A TESZTEK TOKENT ÉS FELHASZNÁLÓT KÉRNEK.

   Kilenc tesztfájl gyártott eddig saját tokent (`jwt.sign({id}, …)`) és saját
   felhasználó-mockot (`{_id: id, name: "teszt"}`), egymásról nem tudva. Amíg a
   token alakja nem változott, ez csak zaj volt; amint változik, kilenc helyen
   kell ugyanazt átvezetni, és a kimaradó helyek egyenként bukó teszteket
   hagynak maguk után — olyan bukásokat, amiknek semmi közük ahhoz, amit az a
   teszt vizsgálni akart.

   A TOKENT A PRODUKCIÓS KIÁLLÍTÓ ADJA (token.js), nem egy másolat róla. Ez a
   lényeg: a projekt szabálya, hogy a mock a valóságot tükrözze, ne egy külön
   elképzelést róla. Ha a token payloadja bővül, a tesztek magától követik — nem
   kell rájuk gondolni, és nem is lehet elfelejteni őket.

   AMI SZÁNDÉKOSAN NEM KERÜL IDE: a hibás tokenek. A hamis aláírású, a lejárt és
   a formailag rossz azonosítójú tokent az auth tesztje továbbra is kézzel
   állítja elő (middleware/auth.test.js), mert azok NEM a mi kiállítónkból
   származhatnak — épp az a kérdésük, mit kezd a szerver azzal, amit nem ő adott
   ki. Egy "adj nekem hibás tokent" segéd elmosná ezt a különbséget. */
const {signToken} = require("../token");
const {TOKEN_COOKIE} = require("../tokenCookie");

/* A felhasználó, ahogy az auth middleware LÁTJA az adatbázisból. Csak azok a
   mezők vannak benne, amiket az auth tényleg olvas — a `name` a hibakeresést
   segíti, a `tokenVersion` pedig az, amit összevet a tokenével.

   Az alapértelmezett 0 nem véletlen szám: pontosan ezt adja a Mongoose egy
   olyan, még a mező bevezetése előtt született dokumentumra is, amiben a mező
   fizikailag nincs benne (mérve, élő adatbázison — l. models/users.js). */
const userStub = (id, tokenVersion = 0) => ({_id: String(id), name: "teszt", tokenVersion});

/* A kész COOKIE fejléc-érték. Korábban `Authorization: Bearer …` volt; a token
   azóta HttpOnly sütiben utazik (l. tokenCookie.js), és a tesztek is azon az úton
   hitelesítenek, amin a böngésző — nem egy másikon, ami már nem is létezik.

   Épp ezért ér valamit, hogy egy helyen van: ez a váltás kilenc tesztfájlt
   érintett volna, és minden kimaradó hely olyan bukást hagy maga után, aminek
   semmi köze ahhoz, amit az a teszt vizsgál. */
const sessionCookieFor = (id, tokenVersion = 0) =>
    TOKEN_COOKIE + "=" + signToken(String(id), tokenVersion);

module.exports = {userStub, sessionCookieFor};
