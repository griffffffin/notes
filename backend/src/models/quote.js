const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/* Az idézetek külön collectionben élnek, nem a to-dók közé keverve (a projekt
   adatmodell-elve: kategóriánként külön tábla). A séma a to-do VÉKONYABB mása:
   nincs szín, százalék, listaelem — egy idézetnek szövege és (opcionálisan)
   szerzője van. */
const quoteSchema = new Schema({
    /* A tulajdonos azonosítója SZÖVEGKÉNT, nem ObjectId-ref-ként — ugyanabból az
       okból, mint a to-dónál: a tulajdonos-ellenőrzés a tokenből jövő szöveggel
       hasonlítja össze, és ObjectId-vé alakítva a típuseltérés MINDIG hamis
       egyezést adna, azaz mindenki 403-at kapna a sajátjára. (Részletesen a
       todo.js-ben.) */
    user: {
        type: String,
        required: true
    },
    // Maga az idézet szövege. Kötelező — szöveg nélkül az idézet értelmetlen.
    quote: {
        type: String,
        required: true
    },
    /* A szerző a to-do "kategória" szerepében: erre szűrünk (/quotes/:author), és
       ezt egészíti ki majd az autocomplete. OPCIONÁLIS: névtelen vagy ismeretlen
       szerzőjű idézet is menthető. */
    author: {
        type: String
    },
    order: {
        type: Number,
        required: true,
        // Mint a to-dónál: a sorszám 1-től indul, második védvonal a middleware mögött.
        min: 1
    },
    createdAt: {
        type: Date,
        default: Date.now,
        required: true
    },
    /* A to-dóval szemben itt az updatedAt is kötelező (a szigorúbb séma tudatos):
       a napi export ez alapján dönti el, volt-e módosítás — sose maradhat üresen. */
    updatedAt: {
        type: Date,
        default: Date.now,
        required: true
    }
});

/* Indexek — mint a to-dónál. A {user, order} a lista rendezését ÉS a sorszám-
   eltolást szolgálja ki (updateMany user + order tartományra); a {user, author}
   a szerző-szűrést és a szerző-autocomplete-et (distinct author, legfrissebb
   createdAt). A tervezett elemszámnál (akár ~10 000) enélkül minden oldal-
   betöltés a teljes collection átfésülése lenne. */
quoteSchema.index({user: 1, order: 1});
quoteSchema.index({user: 1, author: 1});

module.exports = mongoose.model("Quote", quoteSchema);
