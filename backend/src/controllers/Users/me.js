const router = require("express").Router();

/* KI VAN BEJELENTKEZVE — a felület egyetlen módja megtudni.

   MIÉRT KELL EGYÁLTALÁN. Amíg a token JavaScriptből olvasható sütiben élt, a
   frontend egyszerűen megnézte: van süti → be vagyok lépve. A HttpOnly sütit
   viszont a lapon futó kód NEM LÁTJA (ez a lényege), tehát a bejelentkezettség
   ténye csak a szervertől tudható meg. Ez a végpont adja meg.

   A MÁSIK LEHETŐSÉG EGY KÜLÖN, NEM-ÉRZÉKENY "bejelentkezve" JELZŐ-SÜTI VOLT,
   amit a JS is lát. ELVETVE: két helyen tartaná ugyanazt az igazságot, és el
   tudna csúszni — egy lejárt vagy visszavont munkamenetnél a jelző még
   "bejelentkezve" volna, a felület belépettnek látszana, és minden kérés 401-et
   kapna. Pontosan az a néma hiba, ami ellen ez a projekt a legtöbbet teszi. Egy
   forrás legyen rá, és az legyen az, amelyik a valóságot ismeri.

   NINCS BENNE ELLENŐRZÉS, és ez nem hanyagság: ide csak az auth middleware-en át
   vezet út, az pedig már megnézte az aláírást, a lejáratot, a fiók létezését ÉS a
   munkamenet-verziót. Aki eljutott idáig, az bizonyítottan bejelentkezett — a
   kijelentkezett hívó nem ezt a választ kapja, hanem 401-et, és a felület abból
   tudja meg, hogy nincs munkamenete.

   A VÁLASZ CSAK A NÉV. A teljes felhasználó-dokumentum a jelszó-hasht és a
   piszkozat-kulcsot is tartalmazza; azok soha nem mehetnek ki a dróton. Ezért nem
   is kérdezzük le újra a fiókot: az auth már kiolvasta, és KIZÁRÓLAG a nevet adta
   tovább (middleware/auth.js) — amit nem kapunk kézhez, azt nem is lehet
   véletlenül kiküldeni.

   POST, mint minden más végpont itt. Szemantikailag ez lekérdezés (GET volna a
   tankönyvi alak), de az egész API POST-ra épül, és a kivétel ára nagyobb volna,
   mint a haszna: a `no-store` a helyén van (middleware/noStore.js), tehát a
   gyorsítótárazás — a GET fő kockázata — így sem fenyeget. */
module.exports = router.post("/", (request, response) =>
    response.json({name: request.userName}));
