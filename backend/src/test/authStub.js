/* EGY HELY, AHOL A TESZTEK TOKENT ÉS FELHASZNÁLÓT KÉRNEK.

   Kilenc tesztfájl gyártott eddig saját tokent (`jwt.sign({id}, …)`) és saját
   felhasználó-mockot (`{_id: id, name: "teszt"}`), egymásról nem tudva. Amíg a
   token alakja nem változik, ez csak zaj; amint változik, kilenc helyen kell
   ugyanazt átvezetni, és a kimaradó helyek egyenként bukó teszteket hagynak maguk
   után — olyan bukásokat, amiknek semmi közük ahhoz, amit az a teszt vizsgál.

   A TOKENT A PRODUKCIÓS KIÁLLÍTÓ ADJA (token.js), nem egy másolat róla. Ez a
   lényeg: a mock a valóságot tükrözze, ne egy külön elképzelést róla. Ha a token
   payloadja bővül, a tesztek magától követik — nem kell rájuk gondolni, és nem is
   lehet elfelejteni őket.

   AMI SZÁNDÉKOSAN NEM KERÜL IDE: a hibás tokenek. A hamis aláírású, a lejárt és a
   formailag rossz azonosítójú tokent az auth tesztje továbbra is kézzel állítja
   elő (middleware/auth.test.js), mert azok NEM a mi kiállítónkból származhatnak —
   épp az a kérdésük, mit kezd a szerver azzal, amit nem ő adott ki. Egy "adj
   nekem hibás tokent" segéd elmosná ezt a különbséget. */
const {signToken} = require("../token");

/* A felhasználó, ahogy az auth middleware LÁTJA az adatbázisból: csak azok a
   mezők, amiket az őr tényleg olvas. A `name` a hibakeresést segíti. */
const userStub = (id) => ({_id: String(id), name: "teszt"});

/* A kész Authorization fejléc-érték. A "Bearer " előtag itt van, mert minden hívó
   ugyanazt írta oda, és a hiánya nem elgépelésnek látszik, hanem hiányzó tokennek:
   401, ugyanaz a tünet, mint húsz másik hibánál. */
const bearerFor = (id) => "Bearer " + signToken(String(id));

module.exports = {userStub, bearerFor};
