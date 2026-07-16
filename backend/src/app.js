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
    .then(() => console.log("Adatbázis-kapcsolat él."))
    .catch((error) => console.log("Error: " + error));

app.get("/health", async (request, response) => {
    try {
        await mongoose.connection.db.admin().ping();
        response.json({status: "ok", database: "ok"});
    } catch (error) {
        response.status(503).json({status: "ok", database: "unreachable", error: error.message});
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

app.listen(env.PORT, env.HOST, () => console.log("A szerver fut."));
