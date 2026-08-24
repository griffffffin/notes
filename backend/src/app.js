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
const csp = require("./csp");
const noStore = require("./middleware/noStore");
const sameOrigin = require("./middleware/sameOrigin");

/* Élesben a backend szolgálja ki a frontend buildjét is (dist) — fejlesztésnél
   a dist hiányozhat (akkor a Vite dev szerver a frontend), ezért feltételes. */
const dist = path.join(__dirname, "../../frontend/dist");
const hasDist = fs.existsSync(dist);

/* Biztonsági fejlécek. A böngészőnek szólnak: ne találgassa a fájltípust
   (nosniff), ne engedje idegen oldalba ágyazni a lapunkat (X-Frame-Options —
   ez a "clickjacking" ellen véd: a támadó láthatatlan keretben jelenítené meg
   az appot, és a saját gombjai fölé húzná).

   A CSP-t (Content-Security-Policy) a helmet helyett a SAJÁT modulunk állítja
   (csp.js), mert a házirendbe bele kell számolni az index.html inline
   boot-szkriptjének hashét — azt pedig a ténylegesen kiszolgált fájlból olvassuk
   ki, nem kézzel másoljuk. Az indoklás és a döntések ott, egy helyen vannak.

   A COOP (Cross-Origin-Opener-Policy) SZÁNDÉKOSAN kikapcsolva marad, ez a
   HTTPS-fejezethez tartozik: a böngésző csak "megbízható" (HTTPS) origin-on veszi
   figyelembe; sima HTTP-n eldobja, és figyelmeztetést ír a konzolba. Ma tehát nem
   véd semmit, csak zajt csinál. */
app.use(helmet({contentSecurityPolicy: false, crossOriginOpenerPolicy: false}));
app.use(csp.header(path.join(dist, "index.html")));

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
/* A `credentials: true` A SÜTI MIATT KELL. A böngésző cross-origin kérésnél csak
   akkor csatolja a sütit — és csak akkor engedi a választ elolvasni —, ha a
   szerver ezt kimondja. Enélkül a fejlesztői felállás (Vite az 5173-on, API a
   3001-en) némán hitelesítetlen volna: minden kérés 401, holott a böngészőben ott
   a süti. Élesben nincs jelentősége (azonos origin), de a CORS maga is csak
   fejlesztéskor kapcsol be — l. a fenti indoklást.

   A SÜTI HATÓKÖRE ETTŐL FÜGGETLENÜL RENDBEN VAN: a sütiknél a PORT nem számít,
   tehát az 5173 és a 3001 ugyanaz a "site", és a SameSite=Strict sem akadály. */
if (corsOrigins.length) app.use(cors({origin: corsOrigins, credentials: true}));

/* CSRF: A KÉRÉS A MI OLDALUNKRÓL INDULT-E. A süti-alapú hitelesítés óta a
   böngésző magától küldi a munkamenetet, tehát egy idegen oldalról indított kérés
   hitelesített volna — ezt zárja le, MÁSODIK rétegként a süti SameSite=Strict
   jelzője mellett (az indoklás: middleware/sameOrigin.js).

   A SORRENDJE LÉNYEGES, két irányban is. A CORS UTÁN áll, hogy a preflight
   válaszát ne fogja meg; és minden ÚTVONAL ELŐTT — beleértve a publikus /login-t
   is, mert a "login CSRF" (a támadó a saját fiókjába jelentkeztet be valakit)
   valódi támadás. A törzs feldolgozása (express.json) elé kerül: amit
   elutasítunk, azt fel se dolgozzuk.

   Ugyanazt az engedélyezett-lista értéket kapja, amit a CORS: fejlesztéskor a
   Vite dev szervere (5173) egy MÁSIK origin, és annak át kell jutnia. */
app.use(sameOrigin(corsOrigins));

app.use(express.json({limit: "1mb"}));   // a törzs mérete se legyen korlátlan
if (hasDist) app.use(express.static(dist));

/* INNENTŐL MINDEN VÁLASZ DINAMIKUS — és egyiket sem szabad letárolni. A sor
   HELYE hordozza a jelentést: a statikus build (hash-elt JS/CSS) fölötte marad,
   tehát az továbbra is gyorsítótárazódik; minden alatta következő — az életjel,
   az SPA-fallback és a teljes API — megkapja a `no-store`-t. Az indoklás és a
   sorrendet őrző teszt: middleware/noStore.js, middleware/noStore.test.js. */
app.use(noStore);

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
