const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const {publicJsonTransform} = require("../publicJson");

/* Az idézetek külön collectionben élnek, nem a to-dók közé keverve (a projekt
   adatmodell-elve: szekciónként külön tábla).

   VÉGPONTOK KÖZÖTTI TITKOSÍTÁS (E2EE). A tartalmi mezők — az idézet szövege, a
   szerző, a betűméret és a létrehozás ideje — MÁR NEM nyílt oszlopok: a kliens egy
   AES-256-GCM borítékba (frontend/src/e2ee/content.ts) sorosítja őket, és az a
   `ciphertext` mező érkezik. A szerver a nyílt szöveget SOHA nem látja (E2EE.md 3–4.
   szakasz). Nyílt marad, ami a szervernek funkcionálisan kell: a tulajdonos (`user`),
   a sorrend (`order`), és az időbélyegek (a napi export delta-döntése). A `createdAt`
   a BLOBBA költözött (a kliens állítja), tehát itt nincs többé oszlopa. */
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
    /* A TITKOSÍTOTT TARTALMI BORÍTÉK — az idézet szövege, a szerző, a betűméret és a
       createdAt egyetlen AES-256-GCM borítékba sorosítva (formátum: "e2ee1", az IV
       benne; l. frontend/src/e2ee/aead.ts). A szerver ezt a szöveget csak TÁROLJA és
       VISSZAADJA, sosem értelmezi. Kötelező: tartalom nélkül az idézet értelmetlen.
       A boríték a HELYÉHEZ van kötve (AAD = section|_id), tehát a szerver két
       elem borítékát nem cserélheti ki (swap-támadás) — a GCM-decrypt a kliensen dob. */
    ciphertext: {
        type: String,
        required: true
    },
    order: {
        type: Number,
        required: true,
        // Mint a to-dónál: a sorszám 1-től indul, második védvonal a middleware mögött.
        min: 1
    },
    /* KÖTELEZŐ, mint a to-dónál (models/todos.js): a napi export ebből dönti el,
       volt-e aznap módosítás — üresen maradó updatedAt egy egész napot kihagyatna
       a mentésből, némán. NYÍLT marad (a delta-szinkron ezen áll, l. E2EE.md 4.). A
       `createdAt` ezzel szemben a titkosított blobba került (csak megjelenítés kell
       hozzá, elrejtése ingyen). */
    updatedAt: {
        type: Date,
        default: Date.now,
        required: true
    }
});

/* Index — a {user, order} a lista rendezését ÉS a sorszám-eltolást szolgálja ki
   (updateMany user + order tartományra). A korábbi {user, author} index MEGSZŰNT: a
   szerző a titkosított blobba került, szerver-oldali szerző-szűrés/-autocomplete
   nincs többé (F3 hozza vissza kliens-oldalon). A tervezett elemszámnál (akár
   ~10 000) az order-index nélkül minden oldalbetöltés a teljes collection
   átfésülése lenne. */
quoteSchema.index({user: 1, order: 1});

/* A HÁLÓZATRA SZÁNT MEZŐK whitelistje (l. publicJson.js). A `user`, a `__v` és az
   `updatedAt` SZÁNDÉKOSAN kimaradnak: a frontend nem használja őket, és nem is
   tartoznak a kliensre. A lista- és a szerkesztő-végpont innen kapja a szűkítést; a
   párja a frontend quoteSchema-ja (types/api.ts). A titkosított `ciphertext` viszont
   KIMEGY — azt fejti vissza a kliens a mesterkulccsal. */
quoteSchema.set("toJSON", publicJsonTransform(["_id", "ciphertext", "order"]));

const Quotes = mongoose.model("Quotes", quoteSchema);

// Nyilatkozat a napi exportnak — a fájlnév-előtag jelentése a todos.js-ben.
Quotes.exportName = "quotes";

// Fiókonkénti elem-kvóta — az indoklás és a nagyságrend a todos.js-ben. Az
// idézetek accumuláló szöveges tartalom, ezért a to-dóéval azonos, nagyvonalú
// keret; ha egy szekció töredék marad (pl. zene), az kisebbet deklarál.
Quotes.itemQuota = 500000;

module.exports = Quotes;
