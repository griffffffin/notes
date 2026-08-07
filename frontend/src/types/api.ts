/* A BACKEND–FRONTEND SZERZŐDÉS: mit küld a szerver a dróton át.

   Ez a projekt egyetlen olyan határa, ahol a két oldal SEMMILYEN közös kódot nem
   oszt: két külön csomag, két külön telepítés, köztük JSON. Amit a frontend a
   válasz alakjáról hisz, azt ma kizárólag a memóriája tartja — egy elgépelt
   mezőnév (`qoute`) néma, üres kártyaként jelentkezik. Ez a fájl teszi a hitet
   ellenőrizhető állítássá.

   A típusok a Mongoose-sémákból (backend/src/models/*.js) származnak, DE nem a
   másolataik: a séma az ADATBÁZIS alakját írja le, ez a fájl a HÁLÓZATÉT. Ahol a
   JSON-ná alakítás átalakítja az értéket, ott a kettő tudatosan eltér — l. az
   IsoDate-et lentebb.

   AMIT EZ A FÁJL NEM CSINÁL: nem validál. A típus a fordítónak tett ígéret, nem
   futásidejű ellenőrzés — ha a szerver mást küld, itt semmi nem szól. A bemenetek
   tényleges ellenőrzése a backend validáló middleware-eié (validateTodo,
   validateQuote, validators), és ott is marad.

   NÖVEKEDÉSI SZABÁLY — ez a fájl a FOGYASZTÓIVAL EGYÜTT nő, nem előre.
   Eredetileg a teljes szerződést (Todo, Task, SearchMode, AuthToken…) egyszerre
   írtuk meg, mire a knip mind a 9 fogyasztó nélküli típust halott exportként
   jelentette, és a CI pirosra váltott. Igaza volt: egy típus, amit senki nem
   használ, ugyanolyan halott kód, mint egy hívatlan függvény — ráadásul a
   találgatásból írt típus el is tud csúszni a valóságtól, és senki nem veszi
   észre. Ezért itt csak az áll, aminek MA van olvasója; a többi akkor születik
   meg, amikor az őt használó modul átkerül TypeScriptre. */

/* Az azonosítók a Mongo ObjectId-jai, a JSON-ban 24 karakteres hexa STRINGKÉNT.
   Külön névvel, mert a kódban sok string van, és ez a néhány közülük olyan, amit
   sosem gyártunk magunk, csak továbbadunk. */
export type Id = string;

/* MINDEN időbélyeg STRING, nem Date. A Mongoose-sémában `Date`, de a
   JSON-ná alakítás ISO-alakú szöveggé írja, és az axios sem alakítja vissza — a
   frontend tehát szöveget kap. Ha itt Date-et írnánk, a típus HAZUDNA: a
   `createdAt.getTime()` a fordítónak rendben lenne, futásidőben elszállna.
   Ahol dátumként kell, ott `new Date(...)`.

   Egyelőre nem exportált: kifelé még senki nem kéri, befelé viszont a Quote
   mezői ezzel mondják ki, mi az igazság. Amint egy másik modul is kezelni kezdi
   az időbélyegeket, exportálttá válik. */
type IsoDate = string;

/* A bejelentkezés, a regisztráció és a token-megújítás VÁLASZA maga az aláírt
   JWT, csupasz stringként — nem {token: "…"} burkolóban. Saját néven, mert a
   puszta `string` semmit nem mondana arról, mit tartunk a kezünkben: ez az az
   érték, amitől a szerver tudja, ki vagy.

   (Ez a típus az F1-ben még kimaradt, mert akkor egyetlen olvasója sem volt; most
   az auth-context.ts és az auth.tsx kéri. Pontosan így nő ez a fájl.) */
export type AuthToken = string;

export type Quote = {
    _id: Id;
    /* A TULAJDONOS azonosítója, szövegként (nem ObjectId-ref — az okát a
       backend/src/models/quotes.js fejti ki: a jogosultság-ellenőrzés szöveget
       hasonlít a tokenből jövő szöveggel, és típuseltérésnél mindenki 403-at
       kapna a sajátjára). */
    user: Id;
    /* A mező neve `quote`, nem `text` — maga az idézet szövege. */
    quote: string;
    /* OPCIONÁLIS a sémában is: névtelen vagy ismeretlen szerzőjű idézet is
       menthető. A szerző tölti be a to-do "kategória" szerepét — erre szűr a
       /quotes/:author nézet, és erre épül a szerző-autocomplete. A `?` teszi
       láthatóvá, hogy a hiányát kezelni KELL (l. publicQuoteUrl.ts). */
    author?: string;
    order: number;
    /* Per-idézet betűméret SZÁZALÉKBAN, a body méretéhez képest. A sémában van
       alapértéke (155), tehát a válaszban mindig szerepel. */
    fontSize: number;
    createdAt: IsoDate;
    updatedAt: IsoDate;
};
