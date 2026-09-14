/* A TULAJDON-SZABÁLY: egy elemhez csak a tulajdonosa nyúlhat.

   A tulajdonos a tokenből jön (request.userId, l. middleware/auth.js), SOSEM a
   kérés törzséből — a régi app épp ezen bukott el: a kliens mondta meg, ki ő.

   Miért egy helyen? Mert ez a projekt EGYETLEN legfontosabb biztonsági
   szabálya, és eddig nyolc végponton, nyolcszor volt leírva. Egy elfelejtett
   ellenőrzés (vagy egy elgépelt `!==`) idegen adatot adna ki — az ilyen hibának
   nem szabad több lehetséges helyet hagyni, mint amennyit egy szem átfut.

   A modell PARAMÉTER, hogy minden szekció ugyanezt használja. */

/* Betölti az elemet, HA a kérőé — egyébként null. A "nincs ilyen elem" és a
   "van, de nem a tiéd" eset SZÁNDÉKOSAN ugyanaz a válasz: egy idegen még azt se
   tudja meg, létezik-e az azonosító. Ez a különbségtétel-mentesség az, ami az
   azonosító-próbálgatással való felderítést értelmetlenné teszi.

   A user mező SZÖVEGKÉNT tárolódik (l. models/todos.js indoklása), a
   request.userId is szöveg — ezért egyszerű !== hasonlítható. */
const findOwned = (Model, id, userId) =>
    Model.findById(id).then((document) => (document && document.user === userId) ? document : null);

/* A kérő SAJÁT elemei, sorszám szerint rendezve — minden lista-végpont ezen át
   kérdez (teljes lista, kategória-, szín-, szerző-szűrés, keresés).

   Miért helper egy egysoros lekérdezéshez? Mert a `user: userId` szűrő ELHAGYÁSA
   ugyanolyan néma és ugyanolyan súlyos hiba, mint a findOwned kihagyása: a
   végpont nem hibázna, csak kiadná MINDENKI adatait. Ha a szűrő egyetlen helyen
   van, nincs hova elfelejteni. A hívó `filter`-e csak SZŰKÍTHET — a saját
   tulajdont felülírni nem tudja, mert a user kulcsot utána tesszük rá.

   A rendezés MINDIG a sorszám: ez a lista tartós, húzással állított sorrendje, és
   minden nézetben ugyanaz kell legyen. A {user: 1, order: 1} index pontosan ezt a
   kérdést szolgálja ki (l. models/todos.js). */
const findOwnedList = (Model, userId, filter = {}) =>
    Model.find({...filter, user: userId}).sort("order");

/* A findOwnedList TESTVÉREI — ugyanaz a biztonsági tulajdonság MÁS lekérdezés-
   alakokra, amiket a lista-helper nem szolgál ki (létezés, darabszám, egyetlen
   találat, aggregáció). Mindegyik a `user` kulcsot UTOLJÁRA teszi rá a szűrőre,
   tehát a hívó `filter`-e csak SZŰKÍTHET — a saját tulajdont felülírni vagy
   elhagyni nem tudja. Így a `{user: userId}` injektálás EGY helyen él, és a
   kihagyása nem egy külön végponton, hanem itt lenne javítható (l. a fenti
   findOwnedList indoklását: a user-szűrő elhagyása MINDENKI adatát kiadná).

   Miért nem csak "írd oda a {user}-t a hívásban": mert épp azt a néma hibát
   akarjuk kizárni, hogy valaki egy jövőbeli keresés-/aggregáció-végponton
   elfelejti. A readerScope.test.js forrás-szken őrzi, hogy a controllerek a kérőre
   szűrnek; ezek a helperek azt STRUKTURÁLISSÁ teszik (nem lehet elfelejteni). */
const existsOwned = (Model, userId, filter = {}) => Model.exists({...filter, user: userId});
const countOwned = (Model, userId, filter = {}) => Model.countDocuments({...filter, user: userId});
const findOneOwned = (Model, userId, filter = {}) => Model.findOne({...filter, user: userId});

/* Aggregációhoz a $match-stage-et adjuk vissza (a pipeline többi lépését a hívó
   fűzi hozzá) — a `user` itt is UTOLJÁRA kerül a szűrőbe. Az aggregate nem
   csomagolható egyetlen helperbe (tetszőleges pipeline), de a KÉRŐRE SZŰKÍTÉST,
   ami a szivárgás vektora, ez egy helyre teszi. */
const ownedMatch = (userId, filter = {}) => ({$match: {...filter, user: userId}});

/* Az egységes elutasító válasz. 403 (nem 404): a kérő hitelesített, csak ehhez
   az elemhez nincs joga — a nem létező elem is ezt kapja (l. fent). */
const forbidden = (response) => response.status(403).json("Nincs jogosultságod.");

module.exports = {findOwned, findOwnedList, existsOwned, countOwned, findOneOwned, ownedMatch, forbidden};
