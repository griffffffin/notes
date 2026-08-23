/* "EZT A VÁLASZT NE TÁROLD LE SEHOL." Egyetlen fejléc, de a magyarázata hosszabb
   a kódnál, mert a hiánya NEM okoz tünetet.

   MI ELLEN VÉD. A böngésző a válaszokat a LEMEZRE gyorsítótárazza — nem a
   memóriába, hanem fájlokba a profilkönyvtárban. Ami oda bekerül, az egy
   ellopott vagy elemzésre kerülő készülékből kiolvasható, jóval azután is, hogy
   a felhasználó kijelentkezett. A `Cache-Control: no-store` az egyetlen olyan
   utasítás, ami a TÁROLÁST tiltja (a `no-cache` csak újraérvényesítést kér —
   a válasz attól még a lemezen fekszik).

   MIÉRT KELL, HA A KÉRÉSEINK POST-OK. Az app minden API-hívása ma POST, a
   POST válaszait pedig a böngészők gyakorlatilag nem tárolják. Ez a fejléc
   tehát ma nem javít látható hibát — a jövőt köti meg. Az első GET-es végpont
   (letölthető export, megosztható link, bármi) azonnal gyorsítótárazhatóvá
   válna, és senki nem szólna: se teszt, se hibaüzenet, se felhasználói panasz.
   A kapu ezért itt van, nem végpontonként.

   AMIRE NEM SZABAD RÁTENNI: a statikus buildre (JS/CSS). Azoknak ÉPP
   gyorsítótárazódniuk kell, különben minden oldalbetöltés újratölti a teljes
   bundle-t. Ezért ül ez a middleware az `express.static` UTÁN az app.js-ben —
   a sorrendet ott egy őr-teszt rögzíti (noStore.test.js), mert egy elmozdult
   sor itt is némán rontana: vagy a titkokat tárolná le, vagy a sebességet
   dobná el.

   MIÉRT CSAK EZ AZ EGY ÉRTÉK. A `no-cache, must-revalidate, private` hármas
   szokásos kísérője, de a `no-store` mindegyiket magában foglalja: ha a válasz
   le sem tárolható, akkor nincs mit újraérvényesíteni és nincs mit megosztani.
   A halmozás csak azt sugallná, hogy valamelyik tag külön dolgozik. */
module.exports = (request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
};
