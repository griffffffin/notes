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
   törésnek kitett adat — a mentés-láncban semmi keresnivalója.

   A `null` egyben az is, hogy VÉGIGGONDOLTUK: a felderítő a nyilatkozat nélküli
   modellt hibának veszi, így egy jövőbeli, szintén nem-mentendő modell sem
   maradhat "véletlenül" kimondatlan. */
Users.exportName = null;

module.exports = Users;
