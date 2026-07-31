/* A SORSZÁMOZOTT LISTA egyetlen szabálya, szekciótól függetlenül.

   Minden szekció elemei (to-do, idézet, később film, jegyzet…) hézag- és
   ütközésmentes sorszámokat viselnek felhasználónként: 1, 2, 3, … Ezt a
   rendezettséget minden beszúrás, törlés és áthelyezés megbontaná, ha a
   szomszédokat nem tolnánk el vele együtt. A három művelet MINDIG ugyanaz — a
   szekciók korábban külön-külön írták le, összesen tizenkét helyen.

   A modell PARAMÉTER (nem import): így ugyanez a modul szolgálja ki a Todo-t, a
   Quote-ot és minden jövőbeli szekciót, feltéve, hogy van {user, order} mezőjük
   — és van rájuk {user: 1, order: 1} index, amire ezek a szűrők épülnek.

   Az updatedAt-et MINDEN eltolt dokumentumon frissítjük. Ez szándékos: a napi
   export ez alapján dönti el, változott-e valami az előző napon, egy eltolt
   sorszám pedig valódi változás — enélkül egy csak-átrendezéses nap kimaradna a
   mentésből.

   A függvények a Mongoose updateMany PROMISE-át adják vissza; a hibát a hívó
   kezeli (a saját serverError-kontextusával, hogy a naplóban látszódjon, melyik
   végpont melyik lépésén hasalt el a kérés). */

const touch = (increment) => ({$inc: {order: increment}, $set: {updatedAt: new Date()}});

/* BESZÚRÁS a megadott sorszámra: a helyen álló ÉS a fölötte lévők (>=) eggyel
   lejjebb csúsznak, hogy felszabaduljon a hely. A $gte (nem $gt) a lényeg: az
   új elem pontosan annak a helyére kerül, aki eddig ott állt. */
const shiftForInsert = (Model, userId, order) =>
    Model.updateMany({user: userId, order: {$gte: order}}, touch(1));

/* TÖRLÉS után: a törölt FÖLÖTT állók (>) eggyel feljebb csúsznak a felszabadult
   helyre. Itt $gt (nem $gte), mert a törölt saját sorszáma szűnik meg — azt
   nem kell, és nem is szabad senkinek elmozdítania. */
const shiftForDelete = (Model, userId, order) =>
    Model.updateMany({user: userId, order: {$gt: order}}, touch(-1));

/* ÁTHELYEZÉS: az elem a fromOrder helyről a toOrder helyre megy, a köztes
   elemek egy lépéssel csúsznak a felszabaduló hely felé.

   Felfelé (toOrder < fromOrder): a [toOrder, fromOrder) intervallum lejjebb.
   Lefelé (toOrder > fromOrder): a (fromOrder, toOrder] intervallum feljebb.

   A két intervallum ZÁRT VÉGE szándékosan ellentétes ($gte…$lt, illetve
   $lte…$gt): mindkét esetben a CÉLHELYEN álló elem is mozdul (neki adja át a
   helyét a mozgatott), a KIINDULÓ hely viszont nem — az amúgy is felszabadul.

   Azonos sorszámra "mozgatva" nincs teendő: üres, de teljesült promise-t adunk,
   hogy a hívó lánca egységes maradjon. A hívók ezt az esetet ma amúgy is előbb
   kiszűrik (más választ adnak rá), ez csak a modul saját védőhálója. */
const shiftForMove = (Model, userId, fromOrder, toOrder) => {
    if (toOrder === fromOrder) return Promise.resolve(null);
    if (toOrder < fromOrder)
        return Model.updateMany({user: userId, order: {$gte: toOrder, $lt: fromOrder}}, touch(1));
    return Model.updateMany({user: userId, order: {$lte: toOrder, $gt: fromOrder}}, touch(-1));
};

/* A felhasználó LEGNAGYOBB sorszáma az adott szekcióban — a szerkesztő
   sorszám-választójának felső korlátja (create-nél N, update-nél N-1, l. a
   frontend Order komponensét). Üres listánál 0, tehát az első elem az 1-est kapja.

   A {user, order} indexre támaszkodva a legnagyobbat kérjük le (sort + limit 1),
   nem a teljes listát letöltve és végigjárva: a tervezett ~10 000 elemes skálán az
   utóbbi minden szerkesztő-megnyitáskor átfésülné a collectiont. (A to-do végpont
   korábban épp így működött — a közös helper ezt is a hatékony útra állította.) */
const lastOrder = (Model, userId) =>
    Model.find({user: userId}).sort("-order").limit(1)
        .then((documents) => documents.length ? documents[0].order : 0);

module.exports = {shiftForInsert, shiftForDelete, shiftForMove, lastOrder};
