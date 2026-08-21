/* A validáló middleware-ek KÖZÖS PRIMITÍVJEI — a típus-ellenőrzők és az a két
   szabály, ami minden szekcióban szó szerint ugyanaz.

   FONTOS a határvonal: ide csak az kerül, ami a szekció TARTALMÁTÓL független.
   Maguk a szabályok (mi kötelező, milyen hosszú lehet, milyen mezők vannak)
   SZÁNDÉKOSAN a szekciók saját moduljában maradnak (validateTodo.js,
   validateQuote.js), hogy egymástól függetlenül változhassanak: az idézet
   hosszkorlátja nem befolyásolhatja a to-do címét.

   Amit viszont eddig a kézi szinkron tartott össze — a MAX_ORDER és az azonos
   alakú id-/sorszám-ellenőrzés —, az most tényleg egy helyen van. A régi
   megoldásnál a validateQuote kommentje figyelmeztetett, hogy "a MAX_ORDER a
   to-dóéval EGYEZIK, ha ott változik, itt is állítandó" — pontosan az a fajta
   némán elromló kötés, amit egy új szekció felvételekor senki nem néz meg. */

/* A sorszám felső korlátja. Nem tárolási kényszer (a Number bőven bírná), hanem
   józansági határ: efölött a kérés biztosan nem a felületről jön. Ha egyszer
   emelni kell, itt EGY helyen kell. */
const MAX_ORDER = 100000;

const isText = (value) => typeof value === "string";
const isInteger = (value) => typeof value === "number" && Number.isInteger(value);
const isValidOrder = (value) => isInteger(value) && value >= 1 && value <= MAX_ORDER;

/* Az azonosító FORMÁJA: pontosan 24 hexa karakter — ennyi egy ObjectId (12 bájt).

   MIÉRT NEM `mongoose.isValidObjectId`. Mert az TÁGABB, mint amit mi elfogadni
   akarunk, és a különbség ma már számít. MÉRVE (2026-08-21, a Pi mongoose-ával):

     "507f1f77bcf86cd799439011" -> true    (valódi azonosító)
     "123456789012"             -> false
     12345                      -> TRUE    ← SZÁM, és átment volna

   Amíg az azonosító mindig a szerverről jött vissza, ez elméleti maradt. A
   létrehozás azonosítóját viszont a KLIENS adja (l. Todos/create.js), tehát ez
   már valódi bemeneti felület: ott a "bármi 12 bájtnyi" nem elég szűk. A szigorú
   alak egy helyen áll, és az összes id-s végpont ezt kapja — a lazább változat
   sehol nem marad bent.

   Enélkül a Mongoose CastError-t dobna a lekérdezésnél, amiből csúf 500 (vagy a
   régi kódban 400 "Error: CastError…") lett volna — érdemes előbb, olvasható
   üzenettel elkapni. */
const isObjectIdHex = (value) => typeof value === "string" && /^[0-9a-f]{24}$/i.test(value);

const validateObjectId = (request, response, next) => {
    if (!isObjectIdHex(request.body?.id)) return response.status(400).json("Érvénytelen azonosító.");
    next();
};

/* Az átsoroláshoz (/reorder) csak a sorszám kell, a teljes törzs nem — az id-t a
   validateObjectId nézi meg mellette. */
const validateOrderOnly = (request, response, next) => {
    if (!isValidOrder(request.body?.order)) return response.status(400).json("Érvénytelen sorszám.");
    next();
};

module.exports = {MAX_ORDER, isText, isInteger, isValidOrder, validateObjectId, validateOrderOnly};
