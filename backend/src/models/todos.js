const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const {publicJsonTransform} = require("../publicJson");

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
   tervezett ~10 000 elemes szekcióknál viszont minden oldalbetöltés az egész
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

/* A HÁLÓZATRA SZÁNT MEZŐK whitelistje (l. publicJson.js). A `user`, a `__v` és az
   időbélyegek SZÁNDÉKOSAN kimaradnak: a frontend nem használja őket, és nem is
   tartoznak a kliensre. A lista- és a szerkesztő-betöltő (readById.js) végpont
   innen kapja a szűkítést; a párja a frontend todoSchema-ja (types/api.ts). */
todoSchema.set("toJSON", publicJsonTransform(
    ["_id", "title", "tasks", "taskOrder", "category", "color", "percentage", "order"]));

const Todos = mongoose.model("Todos", todoSchema);

/* NYILATKOZAT a napi exportnak (scripts/exportSections.js): ezt a szekciót
   menteni kell, és a fájljai ezzel az előtaggal készülnek (to-dos-2026-08-02.json).
   Minden modellnek DÖNTENIE kell magáról — a nyilatkozat nélküli modelltől az
   export hibára fut, mert a felejtés különben néma adatvesztés lenne.

   Az előtag a szekció EMBERI, URL-beli alakja ("to-dos", mint a /to-dos útvonal),
   nem a Mongo-collectioné (az `todos`, kötőjel nélkül — a Mongoose adja). A kettő
   SZÁNDÉKOSAN tér el: a fájlnevet ember olvassa egy visszaállításnál. Az előtag
   egyben a retenció csoportosítója, ezért megváltoztatásakor a MÁR MEGLÉVŐ
   fájlokat is át kell nevezni — különben a régi nevűek kiesnek a retencióból, és
   örökre ott maradnának. */
Todos.exportName = "to-dos";

/* FIÓKONKÉNTI ELEM-KVÓTA (l. middleware/enforceItemQuota.js): egy fiók ennyi
   to-dónál többet nem hozhat létre. Ez ABSZOLÚT felső korlát — a rate limit a
   SEBESSÉGET fogja, ez a VÉGÖSSZEGET (lassú, kitartó tárhely-feltöltés ellen).

   MIÉRT SZEKCIÓNKÉNT DEKLARÁLT, NEM EGYSÉGES: a szekciók természete eltér (a
   Notes tíz évek alatt is nőhet, egy zene-szekció töredék marad), ezért mindegyik
   a SAJÁTJÁT mondja meg — az egységes szám itt hiba volna. A nyilatkozat nélküli
   szekció-modell HIBA (gate: itemQuota.test.js), pont mint az exportName-nél: új
   szekció nem maradhat ki némán.

   A SZÁM nagyvonalú: ~500k elem ~50 évnyi nagyon aktív használat fölött van, a
   maximum is csak ~1–2 GB (a lemezhez képest semmi). Sose érinti a valódi
   használatot; egy ellopott token abúzusát viszont megfogja. KÉSŐBB EMELHETŐ: ezt
   a konstanst átírni + redeploy elég, migráció nincs (az emelés csak több elemet
   enged be, meglévőt nem sért). */
Todos.itemQuota = 500000;

module.exports = Todos;
