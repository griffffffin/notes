/* A TOKEN SÜTIJE — a neve, a beállításai és a kiolvasása EGY helyen.

   MIÉRT KÖLTÖZIK SÜTIBE A TOKEN. Eddig a bejelentkezés válaszának TÖRZSE adta a
   JWT-t, a böngészőben pedig JavaScript tette el (frontend/src/contexts/auth.tsx)
   és JavaScript olvasta ki minden kéréshez. Ez önmagában szabályos minta, egyetlen
   szerkezeti bajjal: amit a JS ír és olvas, azt egy befecskendezett szkript is
   kiolvassa. Egyetlen XSS = ellopott munkamenet, és semmilyen mennyiségű óvatosság
   nem zárja ki, csak a szerkezet.

   A `httpOnly` süti erre a válasz: a böngésző tárolja és küldi, a lapon futó
   JavaScript viszont HOZZÁ SEM FÉR — `document.cookie`-ban meg sem jelenik. Az
   XSS ettől még kárt tud okozni (a nevünkben kérhet), de a tokent nem tudja
   elvinni egy másik gépre.

   AMI EZZEL BELÉP: a CSRF kérdése. A `Authorization` fejlécet a böngésző soha nem
   teszi hozzá magától, a sütit viszont IGEN — tehát egy idegen oldalról indított
   kérés eddig hitelesítetlen volt, ezután pedig hitelesített lenne. Ez ellen a
   `sameSite: "strict"` véd: a böngésző MÁSIK oldalról indult kéréshez ezt a sütit
   egyáltalán nem csatolja. A szigorúbb formát választjuk, mert nincs olyan
   folyamatunk, ami kívülről érkezne vissza (fizetés, OAuth-visszairányítás), tehát
   a "lax" engedménye ingyen kockázat volna.

   A `secure` A KÉRÉS PROTOKOLLJÁHOZ IGAZODIK, nem egy env-változóhoz. Ha egyszer
   HTTPS-en szolgálunk ki, a süti magától `Secure` lesz — nem kell egy kapcsolót
   sem átállítani, tehát nem is lehet elfelejteni. Fordítva pedig: ma, sima HTTP-n
   a `secure: true` azt jelentené, hogy a böngésző a sütit KI SEM ÍRJA, és a
   bejelentkezés némán működésképtelen volna. (A HTTPS-váltáskor a HTTP→HTTPS
   átirányítás ennek a párja: enélkül egy HTTP-n megnyitott lap nem-secure sütit
   kapna. L. a HTTPS-csomag tervét.)

   NINCS RAJTA LEJÁRAT, tehát munkamenet-süti: a böngésző bezárásakor eltűnik.
   Ugyanaz a döntés, ami eddig a kliens oldalán élt — a token amúgy is 15 perc
   alatt érvénytelen (token.js), a lemezen felejtett munkamenet viszont valódi
   kockázat egy közös gépen. */
const TOKEN_COOKIE = "token";

/* A beállítások egyetlen forrása. A kiadás és a törlés UGYANEZT kapja, mert a
   böngésző csak akkor törli a sütit, ha a `path` (és a többi jelző) egyezik — egy
   eltérő path-szal küldött törlés NÉMÁN nem csinál semmit: a régi süti a helyén
   marad, a felhasználó pedig "kijelentkezve" is bejelentkezett. */
const cookieOptions = (request) => ({
    httpOnly: true,
    sameSite: "strict",
    secure: request.secure,
    path: "/",
});

const setTokenCookie = (request, response, token) =>
    response.cookie(TOKEN_COOKIE, token, cookieOptions(request));

const clearTokenCookie = (request, response) =>
    response.clearCookie(TOKEN_COOKIE, cookieOptions(request));

/* A SÜTI KIOLVASÁSA. Az Express 5 nem parse-olja a Cookie fejlécet (a `res.cookie`
   írás-oldala beépített, az olvasás nem), és nem is veszünk fel rá külön
   könyvtárat: EGYETLEN sütit keresünk, aminek az alakját ráadásul utána a
   `jwt.verify` dönti el — egy teljes RFC 6265 parse itt nem védene meg semmitől.

   AMI VISZONT FONTOS, és amiért ez nem egy `includes("token=")`: a nevet PONTOSAN
   kell illeszteni. A `theme_token`, a `token_backup` vagy egy `x=token=y` értékű
   másik süti mind tartalmazza a "token=" szöveget, és egy laza illesztés ezek
   valamelyikének a tartalmát adná vissza tokenként — a szerver ilyenkor nem
   hibázna, csak 401-gyel elutasítana valakit, aki érvényesen be van jelentkezve.
   Ezért vágunk a `;` mentén, trimmelünk, és a NÉV egyezését nézzük.

   Az érték az ELSŐ `=` utáni teljes maradék: a base64url ábécé nem tartalmaz
   `=`-t a JWT-ben, de ha egyszer mégis (más token-formátum, padding), a darabolás
   nem csonkítaná meg némán. */
function readTokenCookie(request) {
    const header = request.headers.cookie;
    if (typeof header !== "string") return null;
    for (const part of header.split(";")) {
        const separator = part.indexOf("=");
        if (separator === -1) continue;
        if (part.slice(0, separator).trim() !== TOKEN_COOKIE) continue;
        const value = part.slice(separator + 1).trim();
        return value === "" ? null : value;
    }
    return null;
}

module.exports = {TOKEN_COOKIE, setTokenCookie, clearTokenCookie, readTokenCookie};
