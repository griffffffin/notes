const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/* Az idézetek külön collectionben élnek, nem a to-dók közé keverve (a projekt
   adatmodell-elve: szekciónként külön tábla). A séma a to-do VÉKONYABB mása:
   nincs szín, százalék, listaelem — egy idézetnek szövege és (opcionálisan)
   szerzője van. */
const quoteSchema = new Schema({
    /* A tulajdonos azonosítója SZÖVEGKÉNT, nem ObjectId-ref-ként — ugyanabból az
       okból, mint a to-dónál: a tulajdonos-ellenőrzés a tokenből jövő szöveggel
       hasonlítja össze, és ObjectId-vé alakítva a típuseltérés MINDIG hamis
       egyezést adna, azaz mindenki 403-at kapna a sajátjára. (Részletesen a
       todos.js-ben.) */
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
    /* Per-idézet betűméret SZÁZALÉKBAN (a body font-méretéhez képest): a szerkesztő
       "Betűméret" steppere állítja, és minden nézet — lista, publikus, szerkesztő —
       ezzel a mérettel rajzolja az idézetet. Alap 155% (a Szerző-mező mérete), így a
       mező nélküli régi idézetek is a szerzővel egyező, olvasható méretben jelennek
       meg. A tartományt a middleware (validateQuote) is őrzi; itt a séma védvonala. */
    fontSize: {
        type: Number,
        default: 155,
        min: 100,
        max: 200
    },
    createdAt: {
        type: Date,
        default: Date.now,
        required: true
    },
    /* KÖTELEZŐ, mint a to-dónál (models/todos.js): a napi export ebből dönti el,
       volt-e aznap módosítás — üresen maradó updatedAt egy egész napot kihagyatna
       a mentésből, némán. */
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

const Quotes = mongoose.model("Quotes", quoteSchema);

// Nyilatkozat a napi exportnak — a fájlnév-előtag jelentése a todos.js-ben.
Quotes.exportName = "quotes";

module.exports = Quotes;
