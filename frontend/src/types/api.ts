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

/* A TOKEN SÉMÁJA INNEN ELKERÜLT. Amíg a JWT-t a kliens tette sütibe és olvasta
   ki onnan, a szervertől jövő szöveget ellenőrizni KELLETT — az a program
   határán érkező, nem megbízható érték volt. Ma a token HttpOnly sütiben utazik:
   a lapon futó kód nem látja, nem is kaphat helyette mást, tehát nincs mit
   ellenőrizni. Ami maradt a munkamenetből, azt a `sessionSchema` írja le. */

/* A MUNKAMENET, ahogy a szerver leírja (POST /login, /user/create, /me, /refresh).

   A token MÁR NEM SZEREPEL benne, és ez a lényeg: HttpOnly sütiben utazik, amit a
   lapon futó JavaScript nem is lát (backend/src/tokenCookie.js). A felület tehát
   nem a token birtoklásából tudja, hogy be van lépve, hanem abból, hogy ez a
   válasz megérkezett — a kijelentkezett hívó 401-et kap.

   A NÉV nem díszítés: ez az EGYETLEN adat, amit a munkamenetről tudunk, és a
   szerver szándékosan csak ennyit ad (a fiók-dokumentum jelszó-hasht és
   piszkozat-kulcsot is tartalmaz). */
/* AZ E2EE-BEIRATKOZÁS, ahogy a szerver visszaadja (POST /login, /me) — a végpontok
   közötti titkosítás feloldásához. NEM titok: a `wrappedMk` a jelszóból származtatott
   kulccsal becsomagolt mesterkulcs (kulcs nélkül értelmezhetetlen), a `kdfSalt` és a
   `kdf` a kliens KDF-jének sója és paraméterei, hogy a beírt jelszóból UGYANAZT a kulcsot
   számolja (l. masterKeySession.ts). A szerver ezt a szerkezeti mezőt CSAK beiratkozott
   fióknál küldi, ezért a sessionSchema-ban `optional` — régi (E2EE előtti) fióknál hiányzik.

   Az `algorithm` `literal("argon2id")`: ma ez az egyetlen támogatott KDF (a kliens
   masterKey.ts-e és a backend enrollment.js-e is erre szűkít). A memória/iteráció/
   párhuzamosság CSAK `number`, nem üzleti tartomány — a HATÁRT őrizzük (számot kapunk-e),
   a tartomány-korlát a backend enrollment-validátoráé. */
const enrollmentSchema = v.object({
    wrappedMk: v.pipe(v.string(), v.nonEmpty()),
    kdfSalt: v.pipe(v.string(), v.nonEmpty()),
    kdf: v.object({
        algorithm: v.literal("argon2id"),
        memorySize: v.number(),
        iterations: v.number(),
        parallelism: v.number(),
    }),
});
export type Enrollment = v.InferOutput<typeof enrollmentSchema>;

export const sessionSchema = v.object({
    name: v.pipe(v.string(), v.nonEmpty()),
    enrollment: v.optional(enrollmentSchema),
});
export type Session = v.InferOutput<typeof sessionSchema>;

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
});
export type Todo = v.InferOutput<typeof todoSchema>;

/* AZ IDÉZET HÁLÓZATI ALAKJA A VÉGPONTOK KÖZÖTTI TITKOSÍTÁS (E2EE) UTÁN. A tartalmi
   mezők (idézet szövege, szerző, betűméret, createdAt) MÁR NEM nyílt oszlopok: egyetlen
   titkosított borítékként (`ciphertext`) érkeznek, amit a kliens fejt a mesterkulccsal
   (l. e2ee/content.ts + quoteContent.ts). Nyílt marad, ami a szervernek kell: `_id`
   (kulcs), `order` (sorrend). A `ciphertext` NEM üres — üres boríték értelmezhetetlen.

   Nem exportált a séma, csak a lista/edit szűkítései és a belőle származó típus (a
   fájl növekedési szabálya: ami kifelé nem kell, az bent marad; a knip CI-kapuja
   számon kéri). */
const quoteSchema = v.object({
    _id: idSchema,
    /* A titkosított tartalmi boríték ("e2ee1"-formátum; l. e2ee/aead.ts). Nem üres:
       a szerver validátora is nem-üres szöveget követel (backend validateQuote.js). */
    ciphertext: v.pipe(v.string(), v.nonEmpty()),
    order: v.number(),
});
export type Quote = v.InferOutput<typeof quoteSchema>;

/* A /quotes/edit VÁLASZA — a szerkesztőnek betöltött idézet. WHITELIST: a szerver
   (backend/src/controllers/Quotes/readForEdit.js) SZÁNDÉKOSAN csak a borítékot és a
   sorszámot adja ki (a user-id és az időbélyegek soha), és az `order` is CSAK ezen a
   hitelesített, tulajdonos-ellenőrzött végponton jön.

   `v.pick` a quoteSchema-ból, nem külön leírás: a mezők ugyanazok az értékek, csak
   kevesebb — ha a séma egy mezőjének alakja változik, ez magától követi, nem csúszik el. */
export const quoteForEditSchema = v.pick(quoteSchema, ["ciphertext", "order"]);
export type QuoteForEdit = v.InferOutput<typeof quoteForEditSchema>;

/* A TITKOSÍTOTT TARTALMI BLOB alakja — a boríték VISSZAFEJTETT, JSON-ból értelmezett
   tartalma (a szerver ezt SOHA nem látja). Ezt titkosítja a szerkesztő mentéskor, és
   ezt fejti vissza a lista/szerkesztő olvasáskor (l. Quotes/quoteContent.ts). Bár a
   tartalmat MI titkosítjuk, a visszafejtett JSON régebbi verzióból is jöhet, ezért a
   határon itt is séma szűri (nem hit): a `quote` és a `fontSize` kötelező, a `author`
   opcionális (névtelen idézet), a `createdAt` ISO-szöveg (a kliens állítja létrehozáskor,
   és a szerkesztések során a régit hordozza tovább). */
export const quoteContentSchema = v.object({
    quote: v.string(),
    author: v.optional(v.string()),
    fontSize: v.number(),
    createdAt: v.string(),
});
export type QuoteContent = v.InferOutput<typeof quoteContentSchema>;

/* A LISTA-VÉGPONT válasza: csupasz tömb, nem burkoló objektum (l.
   backend/src/controllers/Quotes/read.js). Modul szintű konstansok, NEM a hívási
   helyen összerakott `v.array(quoteSchema)`: a lista-hook a sémát az effektjének
   függőségeként kapja, és egy rendernként újragyártott séma-objektum a betöltést
   végtelen ciklusba vinné — ugyanaz a kényszer, mint a `filter` memoizálása (l.
   CardList/useSectionList.ts). */
export const todoListSchema = v.array(todoSchema);
export const quoteListSchema = v.array(quoteSchema);

/* A /to-dos/categories válasza: nevek tömbje — a kategória-legördülő a TELJES,
   rendezett listát kapja. (Az idézeteknek volt hasonló /quotes/authors szerző-
   javaslata, de az az E2EE-átállással megszűnt: a titkosított tartalomra a szerver
   nem tud szűrni.) */
export const categoryListSchema = v.array(v.string());
