/* A SORSZÁMOZOTT LISTA egyetlen szabálya, szekciótól függetlenül.

   Minden szekció elemei (to-do, idézet, később film, jegyzet…) hézag- és
   ütközésmentes sorszámokat viselnek felhasználónként: 1, 2, 3, … Ezt a
   rendezettséget minden beszúrás, törlés és áthelyezés megbontaná, ha a
   szomszédokat nem tolnánk el vele együtt. A három művelet MINDIG ugyanaz — a
   szekciók korábban külön-külön írták le, összesen tizenkét helyen.

   A modell PARAMÉTER (nem import): így ugyanez a modul szolgálja ki a Todos-t, a
   Quotes-ot és minden jövőbeli szekciót, feltéve, hogy van {user, order} mezőjük
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
   új elem pontosan annak a helyére kerül, aki eddig ott állt.

   AZ ÚJ ELEMET KI KELL HAGYNI (`insertedId`), mert a beszúrás MEGELŐZI a tolást.
   A sorrend nem szeszély: az új dokumentum azonosítóját a kliens adja, és az
   egyedi `_id`-index az EGYETLEN atomi kapunk arra, hogy egy megismételt kérés
   ne hozzon létre másodpéldányt (l. controllers/createOnce.js). Ha előbb tolnánk, a
   megismételt kérés akkor is eltolna mindenkit, amikor a beszúrása már
   fölösleges. Cserébe a tolás szűrőjének ki kell zárnia magát az új elemet —
   az is `>= order`-en áll, tehát különben magát tolná el, és hézag maradna a
   helyén. */
const shiftForInsert = (Model, userId, order, insertedId) =>
    Model.updateMany({user: userId, order: {$gte: order}, _id: {$ne: insertedId}}, touch(1));

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

/* A VISSZAVÉTELEK — mert az eltolás és a rá következő írás NEM atomi.

   Minden sorszám-változás két lépés: told el a szomszédokat, majd írd az elemet.
   Tranzakció nincs (mérve: a FerretDB v2 a `commitTransaction`-t sem ismeri),
   tehát ha a MÁSODIK lépés elbukik, az első ottmarad — és a lista sérülten
   marad, hibaüzenet nélkül. A párhuzamosságot a userLock.js zárja ki; ez a
   másik, tőle FÜGGETLEN hibaosztály: az egyetlen kérésen belüli félbemaradás.

   AZ ALGEBRA, kimondva (a round-trip próbát l. az ordering.test.js-ben):

   - a TÖRLÉS eltolása (`$gt: order`, −1) után a mozdított elemek `>= order`-en
     állnak, a törlendő pedig MÉG mindig az `order`-en. A visszavétel tehát
     pontosan a BESZÚRÁS eltolása, az elemet kihagyva — ezért nem új függvény,
     hanem a `shiftForInsert` a maga kizárásával;
   - a MOZGATÁS visszavételéhez a mozdított sávot kell visszavinni — ÉS A
     MOZGATOTT ELEMET KIHAGYNI. Ez utóbbi nem apróság: a félbemaradt mozgatásnál
     az elem MÉG a régi helyén áll, és beleesik a visszatoló sávba. (Az első
     változatom épp ezt hagyta ki, és a lenti oda-vissza próba buktatta le: az
     1..5 lista 5 → 2 mozgatásából `[1,2,3,4,4]` lett.)

     A sávok: a `[to, from)` +1 után a mozdítottak a `(to, from]`-ban állnak
     (−1 viszi vissza), a `(from, to]` −1 után pedig a `[from, to)`-ban (+1).

   MIÉRT ITT, ÉS NEM A CONTROLLEREKBEN. Mert a visszavétel az eltolás
   TULAJDONSÁGA: aki az egyiket módosítja, annak a másikat is át kell vezetnie.
   Hat controllerbe szétírva ez hat, egymástól független elgépelési lehetőség
   volna — és mindegyik NÉMÁN rontaná el a listát, épp abban a pillanatban,
   amikor már amúgy is baj van. */
const undoShiftForDelete = (Model, userId, order, itemId) =>
    shiftForInsert(Model, userId, order, itemId);

/* A sáv-határok itt MÁSODSZOR is le vannak írva, és ez tudatos: a fordított hívás
   (`shiftForMove(to, from)`) NEM adja meg őket helyesen, mert nem tud a kihagyandó
   elemről. Hogy a két leírás ne csúszhasson el, az ordering.test.js MINDEN
   (honnan, hova) párt végigpróbál oda-vissza.

   MELYIK SÁV-VÉG SZÁMÍT, ÉS MELYIK NEM (mutáció-próbával mérve): a `$lte fromOrder`
   és a `$gte fromOrder` VISELKEDÉST HORDOZ — kizárva őket az oda-vissza próba
   azonnal bukik, mert azon a helyen áll egy elmozdított elem. A `toOrder` felőli
   vég viszont EKVIVALENS: az eltolás után az a hely ÜRES, tehát a `$gt`/`$gte`
   ott nem különböztethető meg. A szigorúbb alak marad, mert a szándékot mondja
   ki — de ne higgyük róla, hogy a teszt őrzi. */
const undoShiftForMove = (Model, userId, fromOrder, toOrder, itemId) => {
    if (toOrder === fromOrder) return Promise.resolve(null);
    const owner = {user: userId, _id: {$ne: itemId}};
    if (toOrder < fromOrder)
        return Model.updateMany({...owner, order: {$gt: toOrder, $lte: fromOrder}}, touch(-1));
    return Model.updateMany({...owner, order: {$gte: fromOrder, $lt: toOrder}}, touch(1));
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

module.exports = {shiftForInsert, shiftForDelete, shiftForMove,
    undoShiftForDelete, undoShiftForMove, lastOrder};
