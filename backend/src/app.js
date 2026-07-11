const express = require("express");
const app = express();
const cors = require("cors");
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

app.use(cors());
app.use(express.json());
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
