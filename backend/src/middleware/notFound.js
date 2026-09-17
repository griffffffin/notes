/* "NINCS ILYEN VÉGPONT." — az illeszkedés nélküli kérések egységes lezárása.

   MI ELLEN VÉD. Ha egy kérés egyetlen route-ra sem illeszkedik, alapból az Express
   BEÉPÍTETT finalhandlere válaszol: `Cannot POST /akarmi`. Ez két dolgot felfed,
   amit nem szántunk. Egyrészt UJJLENYOMAT: a válasz formátumából látszik, hogy
   Express fut alattunk (verzió-, ismert-CVE-tájékozódás a támadónak). Másrészt
   VISSZATÜKRÖZI a kért utat a válasz törzsébe. Egyik sem segít a jogos kliensnek —
   pontosan az a fajta "önként átadott" információ, amit a minimális felfedés elve
   tilt (CLAUDE.md, "NE SEGÍTS A TÁMADÓNAK"). A hiányzó szándékos válasz helyére a
   keret sajátja lép; ez a kapu foglalja el azt a helyet.

   MIT AD HELYETTE. Ugyanazt a szűkszavú, státusz-illő JSON-t, mint a többi
   hibánk (serverError.js): se keret-név, se a kért út, se belső részlet. A
   METÓDUSTÓL FÜGGETLEN — GET/POST/PUT/DELETE mind ugyanezt kapja —, és a kért
   utat SZÁNDÉKOSAN nem idézi vissza (a visszatükrözés a szivárgás, amit épp
   kiváltunk). A `no-store` már rajta van (a middleware feljebb, minden dinamikus
   válaszra — l. app.js), tehát ezt itt nem duplikáljuk.

   HOL A LÁNCBAN. Minden route UTÁN, de a hibakezelő (4 paraméteres) ELŐTT — a
   sorrendet az app.js hordozza, és forrásból is őrizzük (notFound.test.js).
   GET-en élesben a fentebbi SPA-fallback nyeli el az ismeretlen utat (index.html),
   tehát ide a nem-GET — és fejlesztésben (dist nélkül) minden — illeszkedés
   nélküli kérés jut.

   Két paraméter, nem négy: ez SIMA middleware (a lánc végén mindig válaszol), nem
   hibakezelő. Az Express a paraméterszámból dönti el a kettőt — a 4-paraméteres
   alak hibakezelővé tenné, és az illeszkedés nélküli (hiba NÉLKÜLI) kérést nem
   kapná el. */
module.exports = (request, response) =>
    response.status(404).json("Nincs ilyen végpont.");
