/* EGY FELHASZNÁLÓ SORSZÁM-MŰVELETEI EGYMÁS UTÁN — nem egyszerre.

   MIÉRT KELL. Minden sorszám-változás KÉT adatbázis-művelet: a szomszédok
   eltolása, majd magának az elemnek az írása. A kettő nem köthető atomi egységbe,
   mert TRANZAKCIÓ NINCS — mérve (2026-08-21): a FerretDB v2 a `commitTransaction`
   parancsot sem ismeri. Két párhuzamos kérés így egymásba fűzi a saját feleit, és
   a lista elromlik. MÉRVE, izolált adatbázisban, esetenként ép listáról indulva:

     két KÜLÖNBÖZŐ create párhuzamosan  → [1, 3, 3, 4, 5, 6, 7]   ütközés + hézag
     két ÁTHELYEZÉS párhuzamosan        → [2, 2, 3, 4, 5]         ütközés + hézag
     két TÖRLÉS párhuzamosan            → [1, 2, 3, 3]            ütközés
     soros műveletek (kontroll)         → [1 … 10]                ép

   Semmi nem hibázik közben: a válasz mindháromszor "sikerült". A kár néma, és a
   rendezés meg a húzás is ezekből a számokból dolgozik.

   HOGYAN. Ha atomivá nem tehetjük a párt, akkor ne legyen mivel átfednie: a
   felhasználó sorszám-műveletei EGYMÁS UTÁN futnak. Felhasználónként egy
   ígéret-lánc; az újonnan érkező művelet az előző VÉGÉHEZ fűződik.

   A KORLÁTJA KIMONDVA: ez EGYETLEN Node-folyamaton belül véd. Ma pontosan egy fut
   (a systemd egy `notes.service`-t indít), tehát teljes a védelem — de ha valaha
   több példány szolgálná ki ugyanazt az adatbázist, ez a zár nem tudna róluk. Az
   a nap nem jöhet el csendben: ez a komment a jelzés, hogy akkor adatbázis-szintű
   megoldás kell (egyedi index a {user, order} páron, vagy sorszám nélküli,
   tört-rangsoros rendezés).

   MIÉRT NEM SZŰK KERESZTMETSZET. A zár FELHASZNÁLÓNKÉNT külön: két különböző
   felhasználó műveletei továbbra is párhuzamosak. Egy felhasználónak pedig
   nincs is értelme egyszerre két sorrend-változtatást kérnie — a felület egy
   szálon dolgozik, a párhuzamosság épp a hibás eset (két fül, két eszköz). */

/* Felhasználónként a lánc VÉGE. Az érték egy soha el nem utasított ígéret: a
   bukott műveletre várók nem örökölhetik a hibáját. */
const tails = new Map();

const swallow = () => undefined;

/**
 * Lefuttatja a feladatot — de csak azután, hogy az adott felhasználó előző
 * sorszám-művelete befejeződött.
 *
 * @param userId  a tulajdonos (a tokenből, nem a kérés törzséből)
 * @param task    a művelet; a visszatérési ígérete a hívóé marad, hibástul
 * @returns a feladat saját ígérete — a hívó ugyanúgy kezeli a hibát, mint zár nélkül
 */
function withUserLock(userId, task) {
    /* A `previous` SOSEM utasítódik el — l. lentebb, hogyan épül a lánc vége.
       Ezért elég egyetlen ág: a sorban állás nem tud elbukni. (Egy `then(task,
       task)` alakú "biztos, ami biztos" itt HALOTT KÓD volna: a mutáció-próba
       kimutatta, hogy a második ág soha nem fut le.) */
    const previous = tails.get(userId) ?? Promise.resolve();
    const result = previous.then(task);

    /* ITT SZAKAD MEG A HIBA TERJEDÉSE, és ez a lánc lelke: a VÉGE elnyeli a
       feladat hibáját, tehát a rá következő művelet akkor is elindul, ha az előző
       elbukott. Enélkül egyetlen hibás mentés a felhasználó minden további
       sorszám-műveletét megbénítaná — a felület "csak nem reagálna".

       A HÍVÓ HIBÁJA ÉRINTETLEN: ő a `result`-ot kapja meg, nem a `tail`-t. */
    const tail = result.then(swallow, swallow);
    tails.set(userId, tail);
    /* A TÉRKÉP NEM NŐHET A VÉGTELENSÉGIG. Amikor ez a lánc-vég lefutott ÉS azóta
       senki nem fűzött hozzá, a bejegyzés okafogyott. Az egyezés-vizsgálat a
       lényeg: enélkül egy közben érkezett művelet láncát törölnénk ki, és két
       művelet megint átfedhetné egymást. */
    void tail.then(() => {
        if (tails.get(userId) === tail) tails.delete(userId);
    });
    return result;
}

/* EXPRESS-MIDDLEWARE alak. A zárat a VÁLASZIG tartja: a `finish` a kiküldött
   válaszra szól, a `close` a félbeszakadt kapcsolatra — enélkül egy megszakított
   kérés örökre bent tartaná a zárat.

   Miért middleware, és nem a controllerekbe írva? Mert így az útvonal-táblában
   látszik, hogy melyik végpont sorosított — ott, ahol a kérés többi kapuja is áll
   (hitelesítés, azonosító- és törzs-ellenőrzés). Nyolc controller belsejében
   ugyanez nyolc helyen, olvasás nélkül elfelejthető lenne. */
const serializePerUser = (request, response, next) => {
    void withUserLock(request.userId, () => new Promise((resolve) => {
        /* A FIGYELŐK A `next()` ELŐTT. Egy kezelő válaszolhat szinkron módon is
           (például egy 400-zal); ha a figyelőket utána kötnénk fel, az esemény már
           elszállt volna, és a zár soha nem oldódna fel. */
        response.on("finish", resolve);
        response.on("close", resolve);
        next();
    }));
};

/* CSAK A TESZTNEK: hány felhasználónak van épp futó lánca.

   A térkép növekedése másképp nem megfigyelhető — semmilyen viselkedés nem
   változik tőle, csak a memória fogy. Márpedig egy némán növekvő térkép pontosan
   az a fajta hiba, amit ez a projekt nem enged láthatatlanul maradni, ezért kap
   fogódzót a próba. */
const lockedUsers = () => tails.size;

module.exports = {withUserLock, serializePerUser, lockedUsers};
