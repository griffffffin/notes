const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const todoSchema = new Schema({
    /* A tulajdonos azonosítója SZÖVEGKÉNT, nem ObjectId-ref-ként. Ez tudatos:

       (1) A Mongo-világban NINCS idegen kulcs. A Mongoose `ref`-je csak a
           populate() kényelmi funkciójához kell — semmit nem kényszerít ki, és
           nem takarít törléskor. Ref-fel tehát ugyanúgy maradhatnának árva
           elemek: az integritást nem az adatbázis adná, hanem a kódunk.
       (2) A tulajdonos-ellenőrzés (todo.user !== request.userId) szöveget
           hasonlít a tokenből jövő szöveggel. ObjectId-vé alakítva ez a
           összehasonlítás típuseltérés miatt MINDIG igazat adna — vagyis
           mindenki 403-at kapna a saját listájára. Biztonsági szempontból
           kritikus sor, nem éri meg átalakítani cserébe a populate()-ért, amit
           nem használunk.

       Árva elemek így csak akkor keletkezhetnének, ha lenne fiók-törlés — az
       app nem tud ilyet. Ha egyszer lesz, a to-dókat ugyanabban a műveletben
       kell törölni. */
    user: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    tasks: {
        type: Object,
    },
    taskOrder: {
        type: [Number]
    },
    category: {
        type: String,
        required: true
    },
    color: {
        type: String,
        required: true
    },
    percentage: {
        type: Number,
        required: true
    },
    order: {
        type: Number,
        required: true,
        /* Második védvonal a validáló middleware mögött (validateTodo.js): a
           sorszám 1-től indul, 0 vagy negatív sosem érvényes. A middleware ma is
           ellenőrzi, de ha egy szkript vagy jövőbeli végpont megkerülné, a modell
           itt akkor is elutasítja. */
        min: 1
    },
    createdAt: {
        type: Date,
        default: Date.now,
        required: true
    },
    /* KÖTELEZŐ, nem csak alapértelmezett: a napi export ebből dönti el, volt-e
       aznap módosítás (backend/scripts/daily-export.js). Ha egyetlen dokumentumon
       is üresen maradhatna, egy nap CSENDBEN kimaradna a mentésből — a szkript
       nem hibázna, csak nem írna fájlt. Ugyanez a szabály minden szekcióban:
       ahol a felhasználó adata van, ott napi export van, ahhoz pedig hiteles
       updatedAt kell. */
    updatedAt: {
        type: Date,
        default: Date.now,
        required: true
    }
});

/* Indexek. Index nélkül az adatbázisnak MINDEN dokumentumot végig kell néznie,
   hogy eldöntse, melyik illeszkedik — ez pár tucat elemnél észrevehetetlen, a
   tervezett ~10 000 elemes kategóriáknál viszont minden oldalbetöltés az egész
   collection átfésülése. Az index olyan, mint a könyv tárgymutatója: rendezett
   másolat a kulcsokról, amiben az adatbázis egyenesen a találatokhoz ugrik.

   Az összetett index MEZŐSORRENDJE számít: balról jobbra használható. A
   {user, order} tehát kiszolgálja a "user szerint szűrj, order szerint rendezz"
   kérdést egyetlen lépésben — ez a főoldal listája ÉS a sorszám-eltolás
   (updateMany user + order tartományra).

   Ára: minden íráskor az indexeket is karban kell tartani, és helyet
   foglalnak. Ezen a méreten ez elhanyagolható a nyereséghez képest. */
todoSchema.index({user: 1, order: 1});
todoSchema.index({user: 1, category: 1, order: 1});

module.exports = mongoose.model("Todo", todoSchema);
