const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const Users = mongoose.model("Users", new Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    /* A PISZKOZAT-TITKOSÍTÁS KULCSA — 32 véletlen bájt base64-ben. A miértje (mit
       véd, mit nem, és miért lustán születik) a draftKey.js élén.

       NEM `required`, és ez szándékos: a mező LUSTÁN keletkezik, az első
       kulcs-kérésnél (POST /drafts/key). Kötelezővé téve a már létező fiókok
       minden mentése elszállna — beleértve a bejelentkezéskori jelszó-
       áthashelést is (controllers/Users/login.js) —, vagyis egy tárolási
       részlet döntené el, be tud-e lépni valaki.

       A `select: false` SZÁNDÉKOSAN NINCS rajta. Csábító volna (a kulcs titok),
       de itt épp ellenkezőleg működne: a kulcsot a saját végpontja ADJA KI a
       tulajdonosának, tehát minden olvasáshoz külön `+draftKey`-t kellene kérni —
       egy elfelejtett `+` pedig nem hibázna, csak `undefined`-ot adna, amiből a
       kódunk azt hinné, "még nincs kulcs", és GENERÁLNA egy újat. Az pedig
       felülírná a régit, és minden addigi piszkozat olvashatatlanná válna, némán.
       A kifelé menő adatot ezért nem a séma szűri, hanem a válaszok whitelistje
       (l. controllers/Drafts/key.js). */
    draftKey: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now,
        required: true
    }
}));

/* SOHA ne exportáld — ezért kimondott `null`, nem hiányzó nyilatkozat. A napi
   export (scripts/exportSections.js) a modellek mappáját fésüli át, tehát ide is
   betévedne: a fájl a JELSZÓ-HASHEKET írná ki sima szöveges JSON-ba, amit a napi
   mentés-lehúzás egy másik gépre is átmásol. A hash nem jelszó, de offline
   törésnek kitett adat — a mentés-láncban semmi keresnivalója. A `draftKey` óta
   ez a tiltás még súlyosabb: az MÁR NEM hash, hanem maga a titok, amivel a
   felhasználó gépén fekvő piszkozatok visszafejthetők.

   A `null` egyben az is, hogy VÉGIGGONDOLTUK: a felderítő a nyilatkozat nélküli
   modellt hibának veszi, így egy jövőbeli, szintén nem-mentendő modell sem
   maradhat "véletlenül" kimondatlan. */
Users.exportName = null;

module.exports = Users;
