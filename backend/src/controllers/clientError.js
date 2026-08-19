const router = require("express").Router();

/* A KLIENS SZERZŐDÉS-HIBÁJÁNAK FOGADÁSA — a szerver naplójába, nem a felhasználó
   konzoljába.

   MI A BAJ, AMIT MEGOLD. A frontend minden szerver-választ sémával ellenőriz
   (frontend/src/types/api.ts). Ha a válasz alakja elcsúszik — mert egy mezőt
   átneveztünk a backendben, és a frontend nem tud róla —, a séma elutasítja, és a
   felület hibaágra megy. Fejlesztéskor ez látszik a konzolon; ÉLESBEN viszont a
   naplózás szándékosan néma (frontend/src/log.ts), tehát a hiba nyomtalan marad:
   a felhasználó üres listát lát, mi meg nem tudunk róla. Ez a végpont ezt a rést
   zárja be: a kliens ideszól, és a Pi naplójába (journalctl -u notes) bekerül,
   MELYIK végpont szerződése bukott.

   MIÉRT NEM A BÖNGÉSZŐ KONZOLJÁRA. Mert oda a felhasználó lát, nem mi. Az éles
   `console.error` egyszerre lenne haszontalan (senki nem nézi) és kártékony (a
   szerver hibaüzenetei belső működést szivárogtatnak — ugyanaz az elv, amiért a
   serverError.js sem részletez).

   MIÉRT PUBLIKUS (auth ELŐTT). Mert a szerződés a KIJELENTKEZETT felületen is
   elromolhat: a megosztott idézet publikus nézete (/quotes/id) ugyanúgy sémán
   ellenőrzött választ kap. Egy hibajelentés, ami csak bejelentkezve megy át,
   éppen a legkevésbé megfigyelt utat hagyná ki.

   MIÉRT NEM KÜLD SEMMIT VISSZA (204). A kliensnek nincs mit kezdenie a válasszal
   — a jelentés "tűz és felejtsd el". A 204 (No Content) ezt mondja ki, és nem is
   ad támadási felületet a válasz tartalmán át.

   A BEMENET SZŰKÍTÉSE a middleware dolga (middleware/validateClientError.js), a
   MENNYISÉGÉ a korlátozóé (middleware/rateLimit.js) — mindkettő a routes.js-ben
   ül a végpont előtt. Ide már csak ellenőrzött, útvonal-alakú kulcs jut. */
module.exports = router.post("/", (request, response) => {
    console.error(`[${new Date().toISOString()}] Kliens-szerződés hiba: ${request.body.endpoint}`);
    return response.status(204).end();
});
