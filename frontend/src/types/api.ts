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

/* A to-do színe nem szabad szöveg, hanem a paletta egy neve — a hálózati alak
   itt szűkebb, mint a séma `String`-je, és ezt a todoColors.test.js kapuja
   tartja igazként (a backend COLORS-listája ugyanaz a hat név). */
import type {TodoColor} from "../todoColors";

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

/* A /quotes/search-mode VÁLASZA: a szerver dönti el, hogy a beírt kifejezés
   SZERZŐ-e (ekkor a szerző-szűrt nézetre megyünk) vagy szöveg (ekkor a találati
   listára) — l. backend/src/controllers/Quotes/readSearchMode.js.

   DISZKRIMINÁLT UNIÓ: nem egy `{mode, author?}` objektum, hanem KÉT alak, amit a
   `mode` mező különböztet meg. Ez a különbség nem elméleti: a szerző CSAK az
   "author" ágon létezik, és a fordító pontosan ezt kényszeríti ki — a
   `data.author` sor csak a `data.mode === "author"` vizsgálat UTÁN fordul le. Egy
   közös, opcionális mezős alaknál az `encodeURIComponent(undefined)` némán az
   "undefined" szót tenné az URL-be. */
export type SearchMode =
    | {mode: "author"; author: string}
    | {mode: "text"};

/* Egy listaelem a to-do kártyán. Nem exportált: kifelé ma senki nem kér külön
   task-ot, a `Todo` mezői viszont ezzel mondják ki az alakjukat. (Ugyanaz a
   szabály, mint az IsoDate-nél.) */
type Task = {
    /* A tárolási KULCS szövegként — a `tasks` objektum ugyanezzel a számmal
       indexel, csak ott számként. A kettősség öröklött (a régi kód parseInt-elt
       oda-vissza); a húzható lista ezért normalizál `toString()`-gel, mielőtt a
       dnd-kit-nek adja (l. Todos/DragAndDrop/task.jsx). */
    id: string;
    content: string;
    done: boolean;
};

/* A listaelemek NEM tömbben állnak, hanem szám-kulcsú objektumban: a sorrendet
   külön a `taskOrder` tömb tartja. Így az átrendezés csak a sorrend-tömböt írja
   át, a tartalmakhoz nem nyúl — és egy elem törlése sem tolja el a többi
   azonosítóját. */
type Tasks = Record<number, Task>;

export type Todo = {
    _id: Id;
    /* A TULAJDONOS azonosítója szövegként — az okát a backend/src/models/todos.js
       fejti ki (a jogosultság-ellenőrzés szöveget hasonlít a tokenből jövő
       szöveggel). Ugyanaz a döntés, mint az idézeteknél. */
    user: Id;
    title: string;
    /* MINDKETTŐ opcionális: a séma nem teszi kötelezővé őket, és egy listaelemek
       nélküli to-do teljesen érvényes (csak cím és kategória). A `?` teszi
       láthatóvá, hogy a hiányukat kezelni KELL — a kártya ezért ellenőrzi a
       taskOrder meglétét, mielőtt végigmenne rajta. */
    tasks?: Tasks;
    taskOrder?: number[];
    /* A to-do saját osztályozása a szekción belül (a szekció-szintű `section`-től
       külön — l. CLAUDE.md szótár). Szabad szöveg, a felhasználó találja ki. */
    category: string;
    /* NEM `string`: a backend validáló middleware-e (validateTodo.js COLORS) csak
       a hat paletta-nevet engedi be, és hogy a két lista tényleg egyezik, azt a
       todoColors.test.js kapuja őrzi. Enélkül a szűkítés csak reményteli hit
       volna a szerverről; így ellenőrzött állítás. */
    color: TodoColor;
    /* A kipipált listaelemek aránya, 0–100. A szerver számolja és tárolja, a
       kártya csak kiírja. */
    percentage: number;
    order: number;
    createdAt: IsoDate;
    updatedAt: IsoDate;
};
