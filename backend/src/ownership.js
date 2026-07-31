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

   A user mező SZÖVEGKÉNT tárolódik (l. models/todo.js indoklása), a
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
   kérdést szolgálja ki (l. models/todo.js). */
const findOwnedList = (Model, userId, filter = {}) =>
    Model.find({...filter, user: userId}).sort("order");

/* Az egységes elutasító válasz. 403 (nem 404): a kérő hitelesített, csak ehhez
   az elemhez nincs joga — a nem létező elem is ezt kapja (l. fent). */
const forbidden = (response) => response.status(403).json("Nincs jogosultságod.");

module.exports = {findOwned, findOwnedList, forbidden};
