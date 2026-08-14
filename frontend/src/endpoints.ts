/* A HÁLÓZATI FELÜLET: minden útvonal, amit a frontend a szervertől kér.

   Eddig ez a 25 útvonal 33 helyen, string-literálként élt a komponensekben, és
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
   literál típusukat, az `Endpoint` a huszonöt konkrét útvonal uniója lesz, és egy
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
       routerében is a gyökéren ülnek). A /login és a /user/create a két publikus
       végpont közül kettő (l. backend/src/authBoundary.test.js PUBLIC_ROUTES). */
    login: "/login",
    signup: "/user/create",
    refresh: "/refresh",

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

    /* Az idézet-szekció. Szimmetrikus a to-dóéval, plusz a keresés két végpontja
       és a szerző-javaslat.

       A `quoteById` az EGYETLEN, ami az auth-határ ELŐTT ül a backendben: a
       megosztott idézet-link kijelentkezve is megnyitható. A szerkesztő ezért NEM
       ezt hívja, hanem a hitelesített `quoteForEdit`-et — az adja a sorszámot is,
       tulajdonos-ellenőrzés mögött (l. backend/src/controllers/Quotes/readForEdit.js). */
    quotes: "/quotes",
    quotesByAuthor: "/quotes/author",
    quoteAuthors: "/quotes/authors",
    quoteById: "/quotes/id",
    quoteForEdit: "/quotes/edit",
    quoteLastOrder: "/quotes/last/order",
    quoteCreate: "/quotes/create",
    quoteUpdate: "/quotes/update",
    quoteDelete: "/quotes/delete",
    quoteReorder: "/quotes/reorder",
    quoteSearch: "/quotes/search",
    quoteSearchMode: "/quotes/search-mode",
} as const;

/* A huszonöt útvonal UNIÓJA mint típus. Ez teszi a `handleAxios` url-paraméterét
   ellenőrizhetővé: oda innentől nem lehet akármilyen szöveget adni, csak egy
   ténylegesen létező végpontot.

   A `keyof typeof ENDPOINTS` a kulcsok uniója ("login" | "signup" | …), a
   `(typeof ENDPOINTS)[…]` pedig az ezekhez tartozó ÉRTÉKEK uniója. Így a lista
   bővülésekor ez a típus magától követi — kézzel karbantartott második másolat
   nem keletkezik. */
export type Endpoint = (typeof ENDPOINTS)[keyof typeof ENDPOINTS];
