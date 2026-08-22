/* A BACKEND–FRONTEND SZERZŐDÉS: mit küld a szerver a dróton át — ÉS az
   ellenőrzés, ami ezt futásidőben számon is kéri.

   Ez a projekt egyetlen olyan határa, ahol a két oldal SEMMILYEN közös kódot nem
   oszt: két külön csomag, két külön telepítés, köztük JSON. Amit a frontend a
   válasz alakjáról hisz, azt korábban kizárólag a memóriája tartotta — egy
   elgépelt mezőnév (`qoute`) néma, üres kártyaként jelentkezett. Ez a fájl teszi
   a hitet ellenőrizhető állítássá.

   A típusok a Mongoose-sémákból (backend/src/models/*.js) származnak, DE nem a
   másolataik: a séma az ADATBÁZIS alakját írja le, ez a fájl a HÁLÓZATÉT. Ahol a
   JSON-ná alakítás átalakítja az értéket, ott a kettő tudatosan eltér — l. az
   IsoDate-et lentebb.

   MI VÁLTOZOTT (2026-08-15): eddig itt csak TÍPUSOK álltak, és a hívó a
   `handleAxios<Quote[]>(…)` típusparaméterrel MONDTA MEG, mit vár. Az a
   típusparaméter viszont ugyanaz a fajta üres állítás, mint az `as` (l.
   CLAUDE.md): senki nem vetette össze a szerver JSON-jával — a lánc végén álló
   `axios.post<T>` sem teszi. Ha a backend átnevez egy mezőt, a régi kód
   továbbra is `Quote[]`-nek hiszi a választ, és `undefined` jelenik meg a
   képernyőn, hibaüzenet nélkül. Mostantól minden típus egy SÉMÁBÓL származik,
   és a válaszokat a hívók futásidőben átengedik a sémán (`v.parse`) — ami nem
   illeszkedik, az a hibaágra kerül, mint egy hálózati hiba.

   MIÉRT VALIBOT ÉS NEM ZOD. A hét alakunkkal, esbuilddel bundle-ölve,
   minifikálva, gzippelve, a Pi-n mérve (2026-08-14):

     kézi típusőrök   428 B gzip   (+0,2% a 193 kB-os bundle-höz)
     valibot 1.4.2    2,3 kB gzip  (+1,2%)      ← ez
     zod/mini 4.4.3   6,1 kB gzip  (+3,2%)
     zod 4.4.3        64,9 kB gzip (+33,5%)

   A klasszikus zod azért ekkora, mert a láncolható metódusok minden
   séma-példányon ott ülnek, és a tree-shaking nem tud rajtuk fogást találni; a
   valibot és a zod/mini különálló függvényeket exportál, ezért fogyaszt. A
   valibot a zod/mini fölött azért nyert, mert HASZNÁLHATÓ hibaüzenetet ad
   (`Expected "quote" but received undefined` a mini `Invalid input`-ja helyett)
   — és nálunk pont ez a szöveg megy a logRequestError-be, ez az egyetlen nyom a
   csomaghatár elcsúszásáról. A kézi típusőrök olcsóbbak, de hét alakhoz ~200 sor
   kézzel írt, kézzel karbantartott ellenőrzés kellett volna, amiből a séma
   (és belőle a típus) nem is származna.

   EGY FORRÁS, KÉT KIMENET. A típusokat NEM kézzel írjuk a séma mellé, hanem a
   `v.InferOutput` származtatja belőle. Két külön leírás előbb-utóbb elcsúszna
   egymástól, és az elcsúszást semmi nem venné észre — pont az a hibaosztály,
   ami ellen az egész fájl van (l. CLAUDE.md, "kézzel szinkronizált másolat").

   AMI NEM VÁLTOZOTT: a BEMENETEK ellenőrzése továbbra is a backend validáló
   middleware-eié (validateTodo, validateQuote, validators). Ez a fájl a
   VÁLASZOKAT nézi — a kettő két külön határ.

   NÖVEKEDÉSI SZABÁLY — ez a fájl a FOGYASZTÓIVAL EGYÜTT nő, nem előre.
   Eredetileg a teljes szerződést (Todo, Task, SearchMode, AuthToken…) egyszerre
   írtuk meg, mire a knip mind a 9 fogyasztó nélküli típust halott exportként
   jelentette, és a CI pirosra váltott. Igaza volt: egy típus, amit senki nem
   használ, ugyanolyan halott kód, mint egy hívatlan függvény — ráadásul a
   találgatásból írt típus el is tud csúszni a valóságtól, és senki nem veszi
   észre. Ezért itt csak az áll, aminek MA van olvasója. */

import * as v from "valibot";
/* A to-do színe nem szabad szöveg, hanem a paletta egy neve — a hálózati alak
   itt szűkebb, mint a Mongoose-séma `String`-je, és ezt a todoColors.test.ts
   kapuja tartja igazként (a backend COLORS-listája ugyanaz a hat név). A
   névlistát ÉRTÉKKÉNT importáljuk (nem `import type`-pal), mert most már nem
   csak a típus kell belőle, hanem maga az ellenőrzés is (l. picklist lentebb). */
import {TODO_COLOR_NAMES} from "../todoColors";

/* "BÁRMILYEN SÉMA, AMI T-T AD" — ez a típus utaztatja a sémákat oda, ahol a
   fogadó nem tudja, milyen alakot ellenőriz (l. CardList/useSortableCards.ts: a
   hook to-dót és idézetet is listáz, a kártya típusát a hívó adja).

   A bemeneti oldal SZÁNDÉKOSAN `unknown`: a sémát olyan értékre eresztjük rá,
   amiről semmit nem tudunk — ez a lényege. A kimeneti oldal a `T`, tehát a
   `v.parse` visszatérési értéke már a kész, ellenőrzött alak. */
export type Validator<T> = v.GenericSchema<unknown, T>;

/* Az azonosítók a Mongo ObjectId-jai, a JSON-ban 24 karakteres hexa STRINGKÉNT.
   Külön névvel, mert a kódban sok string van, és ez a néhány közülük olyan, amit
   sosem gyártunk magunk, csak továbbadunk.

   Miért nem ellenőrizzük a hexa-alakot (`v.regex(/^[0-9a-f]{24}$/)`)? Mert az
   már nem a SZERZŐDÉSRŐL szólna, hanem a Mongo belső azonosító-formátumáról: ha
   az adatbázis egyszer más alakú kulcsot ad (vagy egy teszt-fixtúra "a"-t ír),
   attól a válasz még nem hibás. A séma azt kéri számon, amire a kód épít — mi
   az azonosítót csak továbbadjuk. */
const idSchema = v.string();
export type Id = v.InferOutput<typeof idSchema>;

/* MINDEN időbélyeg STRING, nem Date. A Mongoose-sémában `Date`, de a
   JSON-ná alakítás ISO-alakú szöveggé írja, és az axios sem alakítja vissza — a
   frontend tehát szöveget kap. Ha itt Date-et írnánk, a típus HAZUDNA: a
   `createdAt.getTime()` a fordítónak rendben lenne, futásidőben elszállna.
   Ahol dátumként kell, ott `new Date(...)`. */
const isoDateSchema = v.string();

/* A bejelentkezés, a regisztráció és a token-megújítás VÁLASZA maga az aláírt
   JWT, csupasz stringként — nem {token: "…"} burkolóban. Saját néven, mert a
   puszta `string` semmit nem mondana arról, mit tartunk a kezünkben: ez az az
   érték, amitől a szerver tudja, ki vagy.

   MIT JELENT ITT AZ „ÉRVÉNYES"? A tokent a szerver írja ALÁ, és csak ő tudja
   ellenőrizni — az aláíráshoz szükséges titok soha nem hagyja el a szervert,
   tehát a frontend a HITELESSÉGET nem tudja (és nem is szabad, hogy) eldöntse.
   Amit viszont meg tud nézni: hogy az érték egyáltalán TOKEN-e. Ez a séma erre a
   kérdésre válaszol, és pontosan eddig megy el.

   Miért éri meg mégis? Mert a süti a felhasználó gépén él (contexts/auth.tsx):
   átírható kézzel, megörökölhető egy régi verziótól, vagy — a react-cookie
   JSON-értelmezése miatt — objektummá alakulhat. Ellenőrzés nélkül a felület
   BEJELENTKEZETTNEK látszana bármilyen szöveggel, és csak az első kérés 401-e
   döntené el a dolgot. Ezzel a szűkítéssel a bejelentkezett képernyő már csak
   olyan értékre jár, ami tényleg a szervertől származhat.

   A HÁROM LÉPCSŐ: szöveg → nem üres → valódi JWT-alak (három pont-elválasztott,
   base64url rész, aminek a KÖZÉPSŐ tagja a szerver állításaira dekódolódik).
   Utóbbi nem formalitás: egy "abc.def.ghi" ugyan három részes, de nem hordoz
   állításokat — a dekódolás dönti el, nem a pontok száma. */

/* A szerver állításai a tokenben (backend/src/token.js: `jwt.sign({id}, …,
   {expiresIn})`) — az `iat` és az `exp` magától kerül bele, másodpercben. NEM
   olvassuk ki őket sehol: a tulajdonos azonosítóját is a szerver veszi a
   tokenből minden kérésnél, a lejáratot pedig ő érvényesíti. Itt csak annak
   BIZONYÍTÉKAI, hogy amit a kezünkben tartunk, az egy kiadott token. */
const tokenClaimsSchema = v.object({id: v.string(), iat: v.number(), exp: v.number()});

/* A LEJÁRATOT SZÁNDÉKOSAN NEM VIZSGÁLJUK, pedig kézenfekvő volna: a böngésző
   órája nem megbízható forrás, és egy elállított óra ITT nem kis kényelmetlenség
   lenne, hanem ÖNMAGÁT BEZÁRÓ HUROK — a frissen kapott token is "lejártnak"
   látszana, tehát a bejelentkezés a sikeres válasz ellenére sem vinne be sehova.
   A valódi lejárattal szemben nem is védtelen az app: az első kérés 401-et kap,
   és a handleAxios erre kijelentkeztet — egyetlen kérésen belül, a szerver
   órája szerint, aki ezt egyedül tudhatja. */
function hasTokenClaims(token: string): boolean {
    const parts = token.split(".");
    const payload = parts[1];
    /* A darabszám mellett a HASZNÁLT részt is kimondjuk. A `parts.length !== 3`
       igaz feltétel volt, de abból a fordító nem tudta, hogy a `parts[1]`
       létezik — és jogosan: az indexelés eredménye elvileg `undefined` is lehet.
       Így egyetlen ellenőrzés dönt arról, amivel utána dolgozunk: a középső,
       állításokat tartó részről. */
    if (parts.length !== 3 || payload === undefined) return false;
    try {
        /* base64url → base64: a JWT a "+" és a "/" helyett "-"-t és "_"-t használ
           (hogy URL-be is írható legyen). A kitöltő "=" jeleket elhagyja, de az
           atob ezt megengedi — csak a 4-gyel osztva 1 maradékot adó hosszt
           utasítja el, ami amúgy sem érvényes base64. */
        const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
        return v.is(tokenClaimsSchema, JSON.parse(json));
    } catch {
        // Nem base64, vagy nem JSON — akkor sem token, ha három részes.
        return false;
    }
}

export const authTokenSchema = v.pipe(v.string(), v.nonEmpty(),
    v.check(hasTokenClaims, "A token nem a szervertől származó JWT."));
export type AuthToken = v.InferOutput<typeof authTokenSchema>;

/* A PISZKOZAT-TITKOSÍTÁS KULCSA (POST /drafts/key) — 32 véletlen bájt base64-ben.

   A séma itt SZÁNDÉKOSAN csak annyit mond, hogy nem üres SZÖVEG, a HOSSZT nem
   nézi. Nem lazaság: a bájthossz vizsgálata a `draftCrypto.setDraftKey`-ben van,
   ott, ahol a kulcsot bájtokká alakítjuk — egy érték alakját egyszer érdemes
   számon kérni, azon a helyen, ahol az alak tényleg számít. Ha ide is odaírnánk,
   a base64-dekódolás két helyen élne, és a kettő elcsúszhatna.

   Amit viszont ITT kell megfogni: ha a végpont egyszer burkolót adna
   (`{key: "…"}`) vagy elgépelnék az útvonalat, az nem szöveg — ez a séma
   elutasítja, a hívó pedig SZERZŐDÉS-HIBÁT jelent (contractFault.ts), tehát a
   Pi naplójából megtudjuk. Kulcs nélkül nincs piszkozat, de az legalább nem
   NÉMÁN következik be. */
export const draftKeySchema = v.pipe(v.string(), v.nonEmpty());

/* A LEGNAGYOBB SORSZÁM a szekcióban (/to-dos/last/order, /quotes/last/order) —
   a szerkesztő sorszám-választójának felső korlátja. Csupasz szám a válasz
   törzsében, nem burkoló objektum.

   Csak `number`, nem `v.integer()` + `v.minValue(0)`: a séma dolga a HATÁR
   őrzése (számot kapunk-e egyáltalán, nem `{order: 3}`-at vagy null-t), nem az
   üzleti szabály újramondása. Utóbbit a backend ordering modulja tartja, és ha
   egyszer megsérülne, egy szigorúbb séma itt csak elrejtené a hibát egy üres
   szerkesztő mögé. */
export const lastOrderSchema = v.number();

/* Egy listaelem a to-do kártyán. */
const taskSchema = v.object({
    /* A tárolási KULCS szövegként — a `tasks` objektum ugyanezzel a számmal
       indexel, csak ott számként. A kettősség öröklött (a régi kód parseInt-elt
       oda-vissza); a húzható lista ezért normalizál `toString()`-gel, mielőtt a
       dnd-kit-nek adja (l. Todos/DragAndDrop/task.tsx). */
    id: v.string(),
    content: v.string(),
    done: v.boolean(),
});
export type Task = v.InferOutput<typeof taskSchema>;

/* A listaelemek NEM tömbben állnak, hanem kulcsozott objektumban: a sorrendet
   külön a `taskOrder` tömb tartja. Így az átrendezés csak a sorrend-tömböt írja
   át, a tartalmakhoz nem nyúl — és egy elem törlése sem tolja el a többi
   azonosítóját.

   A KULCS TÍPUSA STRING, nem szám — és ez a séma-átállás egyik tanulsága. A
   kézzel írt típus eddig `Record<number, Task>`-ot mondott, mert a kód számokkal
   indexel; a dróton viszont JSON jön, abban pedig NINCS szám-kulcs, minden
   objektum-kulcs szöveg (mérve a Pi élő adatán: `{"0": {…}}`). A TypeScript a
   szám-indexelést a szöveges indexre magától megengedi, tehát a hívó oldalon
   semmi nem változik — csak most már az áll itt, ami tényleg érkezik. */
/* EXPORTÁLVA, mert a to-do szerkesztőjének PISZKOZAT-sémája is ezt használja
   (components/Todos/save.tsx): a helyben tárolt piszkozat ugyanolyan alakú
   alsor-térképet tartalmaz, mint a szerver válasza — két kézzel írt leírás
   biztosan elcsúszna egymástól. */
export const tasksSchema = v.record(v.string(), taskSchema);
export type Tasks = v.InferOutput<typeof tasksSchema>;

export const todoSchema = v.object({
    _id: idSchema,
    /* A TULAJDONOS azonosítója szövegként — az okát a backend/src/models/todos.js
       fejti ki (a jogosultság-ellenőrzés szöveget hasonlít a tokenből jövő
       szöveggel). Ugyanaz a döntés, mint az idézeteknél. */
    user: idSchema,
    title: v.string(),
    /* MINDKETTŐ opcionális: a Mongoose-séma nem teszi kötelezővé őket, és egy
       listaelemek nélküli to-do teljesen érvényes (csak cím és kategória). Az
       `optional` teszi láthatóvá, hogy a hiányukat kezelni KELL — a kártya ezért
       ellenőrzi a taskOrder meglétét, mielőtt végigmenne rajta. */
    tasks: v.optional(tasksSchema),
    taskOrder: v.optional(v.array(v.number())),
    /* A to-do saját osztályozása a szekción belül (a szekció-szintű `section`-től
       külön — l. CLAUDE.md szótár). Szabad szöveg, a felhasználó találja ki. */
    category: v.string(),
    /* NEM `v.string()`: a backend validáló middleware-e (validateTodo.js COLORS)
       csak a hat paletta-nevet engedi be, és hogy a két lista tényleg egyezik,
       azt a todoColors.test.ts kapuja őrzi. A `picklist` a hat névre szűkít —
       ugyanaz a lista, amiből a színválasztó gombjai készülnek, tehát egy új szín
       felvétele itt magától érvényre jut. */
    color: v.picklist(TODO_COLOR_NAMES),
    /* A kipipált listaelemek aránya, 0–100. A szerver számolja és tárolja, a
       kártya csak kiírja. */
    percentage: v.number(),
    order: v.number(),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
});
export type Todo = v.InferOutput<typeof todoSchema>;

/* Nem exportált, MERT nincs olyan hívási hely, ami egyetlen teljes idézetet
   kérne: a lista a quoteListSchema-t, a szerkesztő és a publikus nézet a belőle
   szűkített whitelistet használja. A fájl növekedési szabálya erre is áll — ami
   kifelé nem kell, az bent marad (a knip CI-kapuja pedig számon kéri). */
const quoteSchema = v.object({
    _id: idSchema,
    /* A TULAJDONOS azonosítója, szövegként (nem ObjectId-ref — az okát a
       backend/src/models/quotes.js fejti ki: a jogosultság-ellenőrzés szöveget
       hasonlít a tokenből jövő szöveggel, és típuseltérésnél mindenki 403-at
       kapna a sajátjára). */
    user: idSchema,
    /* A mező neve `quote`, nem `text` — maga az idézet szövege. */
    quote: v.string(),
    /* OPCIONÁLIS a Mongoose-sémában is: névtelen vagy ismeretlen szerzőjű idézet
       is menthető. A szerző tölti be a to-do "kategória" szerepét — erre szűr a
       /quotes/:author nézet, és erre épül a szerző-autocomplete. */
    author: v.optional(v.string()),
    order: v.number(),
    /* Per-idézet betűméret SZÁZALÉKBAN, a body méretéhez képest. NEM opcionális,
       pedig a régi (a mező bevezetése előtt mentett) dokumentumokban nincs benne:
       a Mongoose az alapértéket (155) a DB-ből BETÖLTÉSKOR is ráteszi, tehát a
       válaszban mindig ott van. Mérve a Pi élő adatán (2026-08-15): 55 idézetből
       17-ben nincs fontSize a lemezen, hidratálva mind az 55-ben van. (A napi
       export .lean()-nel megy, az a NYERS alakot menti — ott hiányzik.) */
    fontSize: v.number(),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
});
export type Quote = v.InferOutput<typeof quoteSchema>;

/* A /quotes/edit VÁLASZA — a szerkesztőnek betöltött idézet. WHITELIST: a szerver
   (backend/src/controllers/Quotes/readForEdit.js) SZÁNDÉKOSAN csak ezt a négy mezőt
   adja ki (a user-id és az időbélyegek soha nem mennek ki), és az `order` is CSAK
   ezen a hitelesített, tulajdonos-ellenőrzött végponton jön — a publikus /quotes/id
   már nem adja (l. readById.js).

   `v.pick` a quoteSchema-ból, nem külön leírás: a mezők ugyanazok az értékek,
   csak kevesebb — ha a Quote egy mezőjének alakja változik (pl. az author
   kötelezővé válik), ez magától követi, nem csúszik el. Ugyanaz a gondolat, mint
   a korábbi `Pick<Quote, …>` a típusok szintjén, csak most az ELLENŐRZÉS is
   együtt öröklődik. */
export const quoteForEditSchema = v.pick(quoteSchema, ["quote", "author", "order", "fontSize"]);
export type QuoteForEdit = v.InferOutput<typeof quoteForEditSchema>;

/* A PUBLIKUS /quotes/id VÁLASZA — egy megosztott idézet, bejelentkezés nélkül.
   MÉG SZŰKEBB whitelist: a sorszám (order) sem megy ki, mert a listabeli pozíció
   egy névtelen látogatóra nem tartozik (l. readById.js).

   EZ A TÍPUS ÚJ, és a séma-átállás TALÁLTA MEG: a publikus nézet (Quotes/public.tsx)
   eddig `handleAxios<Quote>`-tal kérte az idézetet, vagyis a teljes dokumentumot
   ígérte magának — `_id`-vel, `user`-rel, `order`-rel, időbélyegekkel, amiket ez a
   végpont SOHA nem küld. A típus tehát HAZUDOTT, és pontosan azért nem derült ki,
   mert senki nem vetette össze a válasszal: a komponens véletlenül csak olyan
   mezőket olvasott, amiket a szerver tényleg küld. A futásidejű ellenőrzés
   bevezetésekor ez azonnal kiütközött (a teljes Quote-sémán a valódi válasz
   megbukott volna) — ezért a saját, igaz alakja. */
export const publicQuoteSchema = v.pick(quoteSchema, ["quote", "author", "fontSize"]);
export type PublicQuote = v.InferOutput<typeof publicQuoteSchema>;

/* A LISTA-VÉGPONTOK válasza: csupasz tömb, nem burkoló objektum (l.
   backend/src/controllers/Quotes/readSearch.js). Modul szintű konstansok, NEM a
   hívási helyen összerakott `v.array(quoteSchema)`: a lista-hook a sémát az
   effektjének függőségeként kapja, és egy rendernként újragyártott séma-objektum
   a betöltést végtelen ciklusba vinné — ugyanaz a kényszer, mint a `filter`
   memoizálása (l. CardList/useSectionList.ts). */
export const todoListSchema = v.array(todoSchema);
export const quoteListSchema = v.array(quoteSchema);

/* A /to-dos/categories és a /quotes/authors válasza: nevek tömbje. Két külön
   névvel, mert két külön szerződés — a kategória-legördülő a TELJES, rendezett
   listát kapja, a szerző-javaslat viszont legfeljebb egy elemet (prefix-szűrt,
   $limit 1). Ma mindkettő ugyanaz az alak; ha az egyik egyszer bővül (pl. a
   szerzőkhöz darabszám is jön), az itt egyetlen sor, nem az összes hívási hely
   újraolvasása. */
export const categoryListSchema = v.array(v.string());
export const authorListSchema = v.array(v.string());

/* A /quotes/search-mode VÁLASZA: a szerver dönti el, hogy a beírt kifejezés
   SZERZŐ-e (ekkor a szerző-szűrt nézetre megyünk) vagy szöveg (ekkor a találati
   listára) — l. backend/src/controllers/Quotes/readSearchMode.js.

   DISZKRIMINÁLT UNIÓ: nem egy `{mode, author?}` objektum, hanem KÉT alak, amit a
   `mode` mező különböztet meg. Ez a különbség nem elméleti: a szerző CSAK az
   "author" ágon létezik, és a fordító pontosan ezt kényszeríti ki — a
   `data.author` sor csak a `data.mode === "author"` vizsgálat UTÁN fordul le. Egy
   közös, opcionális mezős alaknál az `encodeURIComponent(undefined)` némán az
   "undefined" szót tenné az URL-be.

   A `v.variant` a valibot diszkriminált-unió sémája: a `mode` mező alapján
   választja ki, MELYIK alakra ellenőrizzen, és a hibaüzenete is arról az ágról
   szól — egy `v.union` csak annyit mondana, hogy egyik alak sem illeszkedett. */
export const searchModeSchema = v.variant("mode", [
    v.object({mode: v.literal("author"), author: v.string()}),
    v.object({mode: v.literal("text")}),
]);
