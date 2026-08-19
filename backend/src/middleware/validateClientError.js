/* A KLIENS HIBAJELENTÉSÉNEK ellenőrzése (/client-error).

   Ez a végpont a frontendtől kap egy FIX KULCSOT: melyik végpont válasza nem
   felelt meg a sémának a kliens séma-ellenőrzésén. A törzsben tehát nem
   szabad szabad szövegnek lennie — és ezt nem elég kérni, ki kell kényszeríteni.

   HÁROM OK, MIÉRT SZIGORÚ EZ A MEZŐ:

   1. NAPLÓ-HAMISÍTÁS. A kapott érték a szerver naplójába kerül. Egy sortörést
      tartalmazó szöveg ÚJ NAPLÓSORT tud írni — a támadó így tetszőleges bejegyzést
      költhet a naplóba ("a rendszergazda törölte a fiókot"), és a naplónk mint
      bizonyíték elértéktelenedik. Ez a "log injection", és a védekezés az, hogy a
      naplóba írt értéket ELŐBB szűkítjük, nem utólag escape-eljük.
   2. MÉRET. A végpont publikus (l. routes.js): jelentkezés nélkül is hívható.
      Korlát nélkül a naplót tele lehetne írni — a lemez megtelése pedig az egész
      gépet viszi.
   3. ALAK. Egy elgépelt vagy kitalált kulcsból nem tudnánk, mit jelentsen. Ha
      útvonalnak látszik, akkor legyen az.

   AMIT SZÁNDÉKOSAN NEM CSINÁLUNK: nem vetjük össze a frontend végpont-listájával.
   Az futásidőben a backendet a másik csomag forrásához kötné (a tesztben ez
   megengedett, éles kódban nem), és semmit nem adna hozzá: ami átment ezen a
   szűrőn, az így is, úgy is csak egy rövid, ártalmatlan címke a naplóban. */

// Egy útvonal-alakú kulcs: perjellel kezdődik, csak kisbetű, szám, perjel, kötőjel.
const ENDPOINT_KEY = /^\/[a-z0-9/-]{0,60}$/;

const validateClientError = (request, response, next) => {
    const endpoint = request.body?.endpoint;
    if (typeof endpoint !== "string" || !ENDPOINT_KEY.test(endpoint))
        return response.status(400).json("Érvénytelen hibajelentés.");
    next();
};

module.exports = validateClientError;
