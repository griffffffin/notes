/* A KÉRÉS A MI OLDALUNKRÓL INDULT-E — CSRF-védelem, MÁSODIK rétegben.

   MI VÁLTOZOTT, ÉS MIÉRT KELL EZ. Amíg a token az `Authorization` fejlécben ment,
   a CSRF ingyen meg volt oldva: azt a fejlécet a böngésző SOHA nem teszi hozzá
   magától, tehát egy idegen oldalról indított kérés hitelesítetlen volt. A HttpOnly
   sütit viszont a böngésző MAGÁTÓL küldi — vagyis egy támadó oldalon elhelyezett
   űrlap vagy szkript a felhasználó nevében írhatna, ha semmi nem állítaná meg.

   AZ ELSŐ RÉTEG A `SameSite=Strict` (l. tokenCookie.js): a böngésző más oldalról
   indult kéréshez ezt a sütit nem csatolja. Ez ma erős védelem — de a böngésző
   dolga, nem a miénk. Egy régi vagy egzotikus kliens, egy jövőbeli szabvány-
   értelmezés, vagy egy azonos "site"-on futó másik alkalmazás (a site fogalma
   eTLD+1 alapú, tehát az aldomainek egy site-nak számítanak) mind olyan rés, amit
   mi nem látunk és nem is tudunk mérni.

   EZ ITT A MÁSODIK RÉTEG, és a SZERVER kezében van: megnézzük, honnan indult a
   kérés. Két, egymást kiegészítő jel áll rendelkezésre, és MINDKETTŐT a böngésző
   írja — JavaScriptből egyik sem hamisítható (mindkettő "forbidden header name",
   amit a fetch/XHR nem enged felülírni):

     - `Sec-Fetch-Site`: a böngésző mondja meg, hogy a kérés azonos oldalról
       (`same-origin`), azonos site-ról (`same-site`), idegen oldalról
       (`cross-site`) vagy közvetlen felhasználói műveletből (`none`, pl. beírt
       cím, könyvjelző) indult.
     - `Origin`: a kérést indító oldal origin-je.

   LEGALÁBB EGY JEL KÖTELEZŐ. Az első változat átengedte a fejléc nélküli kérést
   ("a CSRF böngésző-alapú, a böngésző pedig mindig küld Origin-t"), de az
   engedmény fölösleges volt: ennek az API-nak EGYETLEN kliense van, a saját
   frontendünk, és az böngészőből fut. Egy fejléc nélküli kérés tehát vagy egy
   parancssori eszköz (annak nincs mit "átverni": aki közvetlenül hív, az a sütit
   is kézzel adja meg), vagy valami, amiről nem tudunk — és amiről nem tudunk, azt
   nem engedjük be a legszigorúbb ágon.

   MÉRVE (2026-08-24, headless Chromium, azonos originről indított fetch POST): a
   böngésző `Origin: http://…` ÉS `Sec-Fetch-Site: same-origin` fejlécet is küld —
   AZONOS origin esetén is, nem csak cross-site kérésnél. Ez a mérés az, ami miatt
   a szigorítás vállalható: enélkül a megkövetelés az egész appot használhatatlanná
   tehette volna, némán.

   A SZABÁLY TEHÁT: ami bizonyítottan idegen → elutasítjuk; ami bizonyítottan a
   miénk → átengedjük; ami NEM DÖNTHETŐ EL → elutasítjuk.

   CSAK AZ ÁLLAPOTVÁLTOZTATÓ METÓDUSOKRA. A GET/HEAD/OPTIONS nálunk nem ír (a
   /health és a statikus fájlok), és a preflight OPTIONS-t megfogva a CORS
   szűnne meg működni.

   A LOGIN IS VÉDETT, nem csak a bejelentkezett végpontok. A "login CSRF" valódi
   támadás: a támadó a SAJÁT fiókjába jelentkeztet be valakit, aki utána
   észrevétlenül az ő fiókjába ír. Ezért ül ez a middleware mindenek előtt. */

/* A KÉRÉS SAJÁT ORIGIN-JE. A protokollt a kérésből vesszük (HTTPS mögött ez lesz
   "https"), a hostot a Host fejlécből — ugyanaz a pár, amit a böngésző is
   összerak, amikor eldönti, azonos origin-ről van-e szó. */
const ownOrigin = (request) => `${request.protocol}://${request.get("host")}`;

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/* A fejlécet a böngésző írja, de a VIZSGÁLAT a mienk: kimondjuk, mely értékek
   számítanak elfogadhatónak. A `same-site` SZÁNDÉKOSAN nincs köztük — nálunk
   nincs aldomain, tehát ami "azonos site, de nem azonos origin", az nálunk csak
   valami váratlan lehet. */
const ACCEPTED_FETCH_SITES = new Set(["same-origin", "none"]);

module.exports = (allowedOrigins = []) => (request, response, next) => {
    if (!UNSAFE_METHODS.has(request.method)) return next();

    const fetchSite = request.get("sec-fetch-site");
    const origin = request.get("origin");
    const refuse = () => response.status(403).json("A kérés nem erről az oldalról indult.");

    // Jel nélkül nem tudjuk eldönteni, honnan jött — tehát nem engedjük.
    if (!fetchSite && !origin) return refuse();

    if (fetchSite && !ACCEPTED_FETCH_SITES.has(fetchSite)) return refuse();
    if (origin && origin !== ownOrigin(request) && !allowedOrigins.includes(origin))
        return refuse();

    return next();
};
