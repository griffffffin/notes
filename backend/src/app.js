const express = require("express");
const app = express();
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
require("dotenv").config();
const env = process.env;
const routes = require("./routes");
const serverError = require("./serverError");

/* Élesben a backend szolgálja ki a frontend buildjét is (dist) — fejlesztésnél
   a dist hiányozhat (akkor a Vite dev szerver a frontend), ezért feltételes. */
const dist = path.join(__dirname, "../../frontend/dist");
const hasDist = fs.existsSync(dist);

/* Biztonsági fejlécek. A böngészőnek szólnak: ne találgassa a fájltípust
   (nosniff), ne engedje idegen oldalba ágyazni a lapunkat (X-Frame-Options —
   ez a "clickjacking" ellen véd: a támadó láthatatlan keretben jelenítené meg
   az appot, és a saját gombjai fölé húzná).

   Két fejléc SZÁNDÉKOSAN kikapcsolva, mindkettő a HTTPS-fejezethez tartozik:

   - CSP (Content-Security-Policy): az index.html-ben inline szkript állítja a
     téma hátterét a villanás ellen, amit a szigorú CSP megtiltana. A
     bekapcsolása nonce/hash-alapú megoldást kíván a Vite-buildben.
   - COOP (Cross-Origin-Opener-Policy): a böngésző csak "megbízható" (HTTPS)
     origin-on veszi figyelembe; sima HTTP-n eldobja, és figyelmeztetést ír a
     konzolba. Ma tehát nem véd semmit, csak zajt csinál. */
app.use(helmet({contentSecurityPolicy: false, crossOriginOpenerPolicy: false}));

/* CORS: a böngésző szabálya, hogy egy oldal alapból csak a SAJÁT origin-jához
   (protokoll+host+port) fordulhat; a szerver a CORS-fejlécekkel engedhet
   kivételt. A buildelt frontendet ugyanez az Express adja, tehát az azonos
   origin — annak nem kell CORS. A Vite dev szerver viszont külön porton (5173)
   fut, és a frontend/.env szerint UGYANEZT a backendet hívja: onnan a kérés
   idegen origin-nak számít, tehát kell neki.

   A lista SZÁNDÉKOSAN env-ből jön, és NEM a NODE_ENV-hez kötött: a dev szerver
   az ÉLES backendet hívja, tehát egy "élesben nincs CORS" szabály épp a
   fejlesztést lövi le. (Pontosan ez történt: a bejelentkezés és a listázás
   némán elhalt az 5173-on.)

   A korábbi sima cors() BÁRMELY origin-t engedte. A névszerinti lista ennél
   szűkebb; netre menet a CORS_ORIGINS ürítésével minden idegen origin kizárható. */
const corsOrigins = (env.CORS_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);
if (corsOrigins.length) app.use(cors({origin: corsOrigins}));

app.use(express.json({limit: "1mb"}));   // a törzs mérete se legyen korlátlan
if (hasDist) app.use(express.static(dist));

mongoose.connect(env.DATABASE)
    .then(() => console.log("Az adatbázis-kapcsolat él."))
    .catch((error) => console.log("Error: " + error));

/* Életjel a monitorozásnak. SZÁNDÉKOSAN hitelesítés nélküli: épp akkor kell
   válaszolnia, amikor baj van, és egy figyelő eszköznek nincs tokenje.
   Cserébe semmi olyat nem árul el, amit egy kívülálló ne tudna kikövetkeztetni
   abból, hogy az app válaszol-e. A hiba RÉSZLETE korábban benne volt a
   válaszban (error.message) — az már a belső működésről beszélt, ezért csak a
   naplóba megy. */
app.get("/health", async (request, response) => {
    try {
        await mongoose.connection.db.admin().ping();
        response.json({status: "ok", database: "ok"});
    } catch (error) {
        console.error("Health: az adatbázis nem válaszol:", error);
        /* A `status` NEM maradhat "ok", ha az adatbázis nem válaszol (az
           átvizsgálás találata, 2026-08-18): a válasz eddig egyszerre mondta a
           503-at és azt, hogy minden rendben. A mi figyelőnk a HTTP-kódot nézi
           (deploy/health-check.sh, `%{http_code}`), tehát a hiba ma nem sülne el
           — de egy jövőbeli eszköz (vagy egy ember) a törzset olvasva pont az
           ellenkezőjét hinné a valóságnak. Az app maga válaszol, az adatbázisa
           viszont nem: ez a "degraded". */
        response.status(503).json({status: "degraded", database: "unreachable"});
    }
});

/* SPA-fallback: minden GET kérésre az index.html megy vissza (a valódi
   fájlokat feljebb az express.static már kiszolgálta) — az útvonalat
   (pl. /signup, később /movies/comedy) a kliensoldali router értelmezi.
   A route-ok ELŐTT kell állnia, mert az auth middleware minden metódust
   elkapna; az API-végpontok POST-ok, így a GET-fallback nem üti őket. */
if (hasDist) app.get("/*splat", (request, response) =>
    response.sendFile(path.join(dist, "index.html")));

app.use(routes);

/* Végső háló minden VÁRATLAN hibára: ha egy útvonalon kicsúszik valami (dobott
   kivétel vagy elutasított promise — az Express 5 mindkettőt ide irányítja),
   ez válaszol.

   Enélkül az Express beépített kezelője felelne, az pedig a TELJES stack
   trace-t visszaküldi a kliensnek, és csak a NODE_ENV=production némítja el.
   Vagyis a titoktartás egy környezeti változó meglétén múlna: ha a unit egyszer
   elveszti az Environment sorát, csendben elkezdene belső részleteket
   szivárogtatni, és semmi nem jelezné. Legyen inkább explicit.

   A négy paraméter kötelező (a next akkor is, ha nem hívjuk): az Express EBBŐL
   ismeri fel, hogy ez hibakezelő és nem sima middleware. */
// eslint-disable-next-line no-unused-vars
app.use((error, request, response, next) =>
    serverError(response, error, `${request.method} ${request.path}`));

app.listen(env.PORT, env.HOST, () => console.log("A szerver fut."));
