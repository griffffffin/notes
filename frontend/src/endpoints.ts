/* A HÁLÓZATI FELÜLET: minden útvonal, amit a frontend a szervertől kér.

   Eddig ezek az útvonalak (akkor 25, az E2EE-átállás után 22) sok helyen,
   string-literálként éltek a komponensekben, és
   SEMMI nem kötötte őket a backend routeréhez (backend/src/routes.js). Egy
   elgépelés nem hibázik hangosan: a szerver 404-et ad, a hibaág legfeljebb
   naplóz, a képernyőn pedig üres lista vagy örökké pörgő betöltő marad. Pontosan
   az a fajta néma romlás, ami ellen ez a projekt a legtöbbet teszi.

   MIT OLD MEG EZ A FÁJL, ÉS MIT NEM. Önmagában csak összegyűjti őket — attól még
   lehetne bennük elgépelés, csak egy helyen. A VALÓDI kaput a backend
   szerződés-tesztje adja (backend/src/endpointContract.test.js): az végigmegy az
   itteni értékeken, és mindegyiket megszólítja a felépített routeren. Ami 404-et
   ad, az nem létezik — a teszt megbukik, névvel. Ez a fájl tehát nem a védelem,
   hanem az, ami a védelmet LEHETŐVÉ teszi: egy listát végig lehet járni, 33
   szétszórt literált nem.

   AZ `as const` NEM FORMASÁG. Nélküle minden érték `string` típusú volna, és az
   alábbi `Endpoint` típus is csak `string`-et jelentene — vagyis a `handleAxios`
   továbbra is tetszőleges szöveget elfogadna. Vele az értékek megőrzik a saját
   literál típusukat, az `Endpoint` a konkrét útvonalak uniója lesz, és egy
   kézzel odaírt "/to-dos/kategoriak" FORDÍTÁSI HIBA, nem futásidejű 404.

   KÉNYSZER: EZ A FÁJL NEM IMPORTÁLHAT SEMMIT, és csak "letörölhető"
   típus-szintaxist tartalmazhat (nincs `enum`, nincs `namespace`). Az ok nem
   stílus: a backend tesztje ADATKÉNT tölti be ezt a modult (a Node 22 magától
   kiveszi a típusokat a .ts fájlból, ez a "type stripping"), és így nem kell a
   forrásszövegből regexszel kikaparnia a listát — ahogy a frontendContract.test.js
   kénytelen. Egy böngésző-függő import (vagy egy nem törölhető nyelvi elem) ezt a
   betöltést azonnal elrontaná.

   NAVIGÁCIÓS ÚTVONAL NEM VALÓ IDE. A `/quotes` cím, amit a böngésző URL-sávjában
   látsz, és a `/quotes` végpont, amitől a listát kérjük, ma véletlenül egyforma —
   de a kettő két külön dolog, két külön szerződéssel (az egyiket a react-router
   route-fája tartja, a másikat a backend routere). Ezért a `navigate()`, a
   `<Link to>` és az `emptyRedirect` értékei SZÁNDÉKOSAN nem innen jönnek; azok
   külön modult kapnak. */

export const ENDPOINTS = {
    /* Hitelesítés — szekciótól független, ezért nincs névtér-előtagjuk (a backend
       routerében is a gyökéren ülnek). A /login és a /user/create a szándékosan
       PUBLIKUS végpontok közé tartozik (a teljes lista az indokokkal:
       backend/src/authBoundary.test.js PUBLIC_ROUTES). */
    login: "/login",
    signup: "/user/create",
    refresh: "/refresh",
    /* Kijelentkezés. A szerver ELDOBJA a fiók összes eddig kiadott tokenjét (a
       munkamenet-verziója nő) — a lejáratra várni kevés volt, mert a /refresh
       minden érvényes tokenért frisset ad. NEM publikus: a visszavonandó fiókot a
       szerver a TOKENBŐL veszi, tehát az auth-határ mögött ül. */
    logout: "/logout",
    /* KI VAN BEJELENTKEZVE. A HttpOnly süti óta ez az EGYETLEN módja megtudni: a
       tokent a JavaScript nem látja, tehát a bejelentkezettség ténye csak a
       szervertől kérdezhető meg. A kijelentkezett hívó 401-et kap. */
    me: "/me",

    /* A kliens szerződés-hibáinak jelentése (l. contractFault.ts). Publikus
       végpont, mint a /login és a /user/create: a szerződés a kijelentkezett
       felületen (publikus idézet-nézet) is elromolhat. Nem szekcióhoz tartozik,
       ezért nincs névtér-előtagja. */
    clientError: "/client-error",

    /* A PISZKOZAT-TITKOSÍTÁS kulcsa (l. draftCrypto.ts). Szekciótól független,
       mint a hitelesítési végpontok — a piszkozat minden szerkesztőt szolgál —,
       de a hármukkal ellentétben ez NEM publikus: a kulcsot csak a tulajdonosa
       kaphatja meg, ezért a backendben az auth-határ mögött ül. */
    draftKey: "/drafts/key",

    /* A to-do szekció. A `todos` maga a lista (a névtér gyökere), a többi a
       szűrt nézetek, a szerkesztő lekérdezései és az írás-műveletek. */
    todos: "/to-dos",
    todoCategories: "/to-dos/categories",
    todosByCategory: "/to-dos/category",
    todosByColor: "/to-dos/color",
    todoById: "/to-dos/id",
    todoLastOrder: "/to-dos/last/order",
    todoCreate: "/to-dos/create",
    todoUpdate: "/to-dos/update",
    todoDelete: "/to-dos/delete",
    todoReorder: "/to-dos/reorder",

    /* Az idézet-szekció. Szimmetrikus a to-dóéval, csak vékonyabb.

       VÉGPONTOK KÖZÖTTI TITKOSÍTÁS (E2EE) UTÁN a szerver a tartalmat csak titkosított
       borítékként (ciphertext) tárolja és adja vissza — a `quoteForEdit` és a lista
       (`quotes`) a borítékot adja, a kliens fejti a mesterkulccsal. A szerver-oldali
       szerző-szűrés, szerző-javaslat és keresés (`/quotes/author`, `/quotes/authors`,
       `/quotes/search`, `/quotes/search-mode`) MEGSZŰNT (F3 hozza vissza kliens-oldalon),
       a publikus megosztás (`/quotes/id`) pedig a KÜLÖN megosztás-menetbe került (Shared
       tábla + fragment-kulcs). Így minden idézet-végpont az auth-határ MÖGÖTT ül. */
    quotes: "/quotes",
    quoteForEdit: "/quotes/edit",
    quoteLastOrder: "/quotes/last/order",
    quoteCreate: "/quotes/create",
    quoteUpdate: "/quotes/update",
    quoteDelete: "/quotes/delete",
    quoteReorder: "/quotes/reorder",
} as const;

/* AZ ÖSSZES útvonal UNIÓJA mint típus. Ez teszi a `handleAxios` url-paraméterét
   ellenőrizhetővé: oda innentől nem lehet akármilyen szöveget adni, csak egy
   ténylegesen létező végpontot.

   A `keyof typeof ENDPOINTS` a kulcsok uniója ("login" | "signup" | …), a
   `(typeof ENDPOINTS)[…]` pedig az ezekhez tartozó ÉRTÉKEK uniója. Így a lista
   bővülésekor ez a típus magától követi — kézzel karbantartott második másolat
   nem keletkezik. */
export type Endpoint = (typeof ENDPOINTS)[keyof typeof ENDPOINTS];
