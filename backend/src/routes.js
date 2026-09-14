const router = require("express").Router();
const auth = require("./middleware/auth");
/* Az azonosító és a sorszám ellenőrzése minden szekcióban ugyanaz — egy közös
   middleware szolgálja ki mindet (korábban szekciónként külön, azonos kóddal). A
   szekció-specifikus szabályok maradnak a saját moduljukban. */
const {validateObjectId, validateOrderOnly} = require("./middleware/validators");
const {serializePerUser} = require("./userLock");
const {validateTodoBody, validateCategoryFilter, validateColorFilter} = require("./middleware/validateTodo");
const {validateQuoteBody, validateAuthorFilter, validateSearchTerm,
    validateAuthorPrefix} = require("./middleware/validateQuote");
const validateCredentials = require("./middleware/validateCredentials");
const validateClientError = require("./middleware/validateClientError");
const rateLimit = require("./middleware/rateLimit");

const usersCreate = require("./controllers/Users/create");
const usersLogin = require("./controllers/Users/login");
const usersRefresh = require("./controllers/Users/refresh");
const usersLogout = require("./controllers/Users/logout");
const usersMe = require("./controllers/Users/me");
const clientError = require("./controllers/clientError");
const draftsKey = require("./controllers/Drafts/key");

const todosCreate = require("./controllers/Todos/create");

const todosRead = require("./controllers/Todos/read");
const readLastOrder = require("./controllers/Todos/readLastOrder");
const todosReadCategory = require("./controllers/Todos/readCategory");
const todosReadById = require("./controllers/Todos/readById");
const todosReadByCategory = require("./controllers/Todos/readByCategory");
const todosReadByColor = require("./controllers/Todos/readByColor");

const todosUpdate = require("./controllers/Todos/update");
const todosDelete = require("./controllers/Todos/delete");
const todosReorder = require("./controllers/Todos/reorder");

const quotesCreate = require("./controllers/Quotes/create");
const quotesReadLastOrder = require("./controllers/Quotes/readLastOrder");
const quotesReadAuthors = require("./controllers/Quotes/readAuthors");
const quotesReadSearchMode = require("./controllers/Quotes/readSearchMode");
const quotesReadSearch = require("./controllers/Quotes/readSearch");
const quotesRead = require("./controllers/Quotes/read");
const quotesReadByAuthor = require("./controllers/Quotes/readByAuthor");
const quotesReadById = require("./controllers/Quotes/readById");
const quotesReadForEdit = require("./controllers/Quotes/readForEdit");
const quotesUpdate = require("./controllers/Quotes/update");
const quotesDelete = require("./controllers/Quotes/delete");
const quotesReorder = require("./controllers/Quotes/reorder");


/* A HITELESÍTÉSI VÉGPONTOK KORLÁTOZÁSA. Mindkettő publikus ÉS drága: egy bcrypt
   hívás ~245 ms CPU-t eszik (password.js), ráadásul a libuv NÉGY szálas
   threadpooljából — négy párhuzamos kérés tehát az egész kiszolgálást megfogja.
   Korlát nélkül ez egyszerre jelszó-szótár próbálgatására ÉS a gép leterhelésére
   is nyitva állna.

   A LOGIN kerete a bőségesebb, mert a jogos használat is ide esik: elgépelt
   jelszó, több eszköz, fejlesztés közbeni ki-be lépegetés. Húsz próbálkozás
   negyed óránként egy embernek sok, egy szótárnak viszont semmi (napi ~1900
   próba — egy értelmes jelszóhoz évmilliók kellenének).

   A REGISZTRÁCIÓ kerete szűkebb: fiókot valóban ritkán hoz létre az ember, itt
   a jogos igény napi néhány. Ez egyben azt is korlátozza, hogy valaki fiókok
   ezreivel töltse meg az adatbázist.

   A sikeres és a sikertelen próbálkozás EGYFORMÁN számít. Ez tudatos: a
   megkülönböztetés csak azt jelentené, hogy a helyes jelszavú kérés ingyen van —
   márpedig a terhelést az is okozza. */
router.use("/user/create",
    rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 5,
        message: "Túl sok regisztrációs kísérlet.",
    }),
    validateCredentials, usersCreate);
/* A BEJELENTKEZÉS KÉT KORLÁT KÖZÖTT áll, és a kettő két különböző támadást zár.

   1) IP-alapú (az első réteg): egy címről ne lehessen sokat próbálni.
   2) FIÓK-alapú (a harmadik réteg, a validáció után): egy adott fiókNÉVRE ne
      lehessen sokat próbálni, AKÁRHÁNY IP-ről. Enélkül egy botnet ezer címről,
      címenként 20 kérést leadva ~20 000 jelszót próbálhatna EGYETLEN fiókra, és
      az IP-korlát ezt nem fogná meg (minden IP a saját vödrében marad).

   ⚠ A FIÓK-KORLÁT DoS-FEGYVER: egy idegen a más nevére küldött kérésekkel ki
   tudja zárni a valódi felhasználót a saját fiókjából. Ezért SZÁNDÉKOSAN
   nagyvonalú a keret (15 perc / 50), jóval tágabb az IP 20-ánál: elég szűk, hogy
   egy szótár-támadás ne férjen bele, de elég tág, hogy pár elgépelés + némi zaj
   ne zárjon ki egy valós embert. A szám nem bűvös érték, hanem kimondott
   kompromisszum a törés és a kizárás kockázata között.

   A fiók-réteg a `validateCredentials` UTÁN áll: onnan a `name` garantáltan
   trimmelt, nem üres string, tehát a kulcsfüggvény nem kell hogy típus-védelmet
   duplikáljon. Kisbetűsítünk és trimmelünk, hogy „Alice" és „alice" ne külön
   vödörbe essen (és így ne lehessen a korlátot a kis-/nagybetűvel megkerülni).

   NEM SZIVÁROGTAT FELSOROLÁST: a 429 a BEKÜLDÖTT névre szól, függetlenül attól,
   létezik-e a fiók — és a bcrypt ELŐTT üt, tehát a login egyenlő-válaszidő
   védelmét (login.js álca-hash) sem befolyásolja. */
router.use("/login",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 20,
        message: "Túl sok bejelentkezési kísérlet.",
    }),
    validateCredentials,
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 50,
        message: "Túl sok bejelentkezési kísérlet ehhez a fiókhoz.",
        keyOf: (request) => request.body.name.trim().toLowerCase(),
    }),
    usersLogin);

/* Egy idézet PUBLIKUSAN olvasható az azonosítója alapján (a megosztott link egy
   konkrét idézetre mutat) — ezért ül ez az EGYETLEN idézet-végpont az auth
   ELŐTT. A lista és minden írás-művelet auth mögött van.

   KORLÁTOZVA, mert PUBLIKUS és DB-t olvas. A többi publikus végpont (login,
   regisztráció, /client-error) mind korlátozott; ez maradt ki. Az azonosító nem
   kitalálható (24 hexa, felsorolás nem reális), de a végpont korlát nélkül
   végtelen CPU/DB-terhelés a Pi-n — ezt zárjuk le, nem az adatszivárgást. A keret
   BŐSÉGES: egy megosztott idézetet sokan nyitnak meg, de KÜLÖNBÖZŐ IP-kről,
   egyenként; egy emberre percenként 60 kérés bőven elég, egy IP-ről ID-ket pörgető
   scrapert viszont megfog. A rate limit a validáció ELŐTT áll, tehát a rossz alakú
   kérés is fogyaszt a keretből (mint a loginnál). */
router.use("/quotes/id",
    rateLimit({
        windowMs: 60 * 1000,
        max: 60,
        message: "Túl sok kérés.",
    }),
    validateObjectId, quotesReadById);

/* A kliens szerződés-hibáinak fogadása (l. controllers/clientError.js). Az auth
   ELŐTT, mert a publikus idézet-nézet is sémán ellenőrzött választ kap: a
   kijelentkezett úton elromlott szerződésről is tudni akarunk.

   KORLÁTOZVA, mert publikus és NAPLÓBA ÍR — korlát nélkül a naplót (és a lemezt)
   tele lehetne írni. Az érték bőséges a valódi használathoz: a kliens
   végpontonként EGYSZER jelent egy oldalbetöltésen belül, tehát
   a 25 végpontból egy elromlott build is jóval húsz alatt marad öt perc alatt. */
router.use("/client-error",
    rateLimit({
        windowMs: 5 * 60 * 1000,
        max: 20,
        message: "Túl sok hiba.",
    }),
    validateClientError, clientError);

// Innentől minden végpont csak érvényes tokennel érhető el.
router.use(auth);

/* Token-megújítás. Az auth MÖGÖTT: csak érvényes tokenért jár friss —
   lejárt tokennel már nem lehet visszakapaszkodni, ez a tétlenségi
   kijelentkezés lényege. */
router.use("/refresh", usersRefresh);

/* KI VAN BEJELENTKEZVE. Az auth MÖGÖTT, és épp ez a szerepe: a kijelentkezett
   hívó 401-et kap, és a felület ebből tudja, hogy nincs munkamenete. A HttpOnly
   süti óta ez az EGYETLEN módja megtudni — a JavaScript a tokent nem látja
   (l. controllers/Users/me.js). */
router.use("/me", usersMe);

/* Kijelentkezés: a felhasználó ÖSSZES munkamenetének visszavonása. Az auth
   MÖGÖTT, két okból is. Egyrészt a visszavonandó fiókot a tokenből vesszük (a
   törzsből véve bárki bárkit kiléptethetne); másrészt így a művelet csak azzal
   a tokennel érhető el, amit épp meg akarunk szüntetni.

   Nincs korlátozva (rateLimit), mert nem publikus és nem drága: egy hitelesített
   kérés, egyetlen $inc. Aki vissza tud élni vele, az kizárólag saját magát tudja
   kiléptetni. */
router.use("/logout", usersLogout);

/* A piszkozat-titkosítás kulcsa. Az auth MÖGÖTT, mert a kulcsot a TOKENBŐL vett
   felhasználóhoz adjuk ki — ez az egyetlen titok, ami a felhasználó gépén fekvő
   piszkozatokat védi (l. controllers/Drafts/key.js és draftKey.js).

   Szekciótól független, mint a /refresh: a piszkozat minden szekció szerkesztőjét
   szolgálja, ezért nem kerül a /to-dos vagy a /quotes névtér alá. */
router.use("/drafts/key", draftsKey);

/* A to-do minden végpontja a /to-dos névtér alatt — így a további szekciók
   (pl. /quotes) ütközés nélkül kapják a saját "create", "id", "update"
   végpontjaikat. A user- és auth-útvonalak (login, refresh) szekciótól
   függetlenek, ezért fentebb NEM kerülnek prefix alá. */
/* AZ ÍRÁS-MŰVELETEK FIÓK-ALAPÚ KÉRÉS-KORLÁTOZÁSA — két vödör, a művelet
   természetéhez szabva.

   MIÉRT FIÓK (userId), NEM IP. Ezek a végpontok az `auth` MÖGÖTT állnak (l.
   fentebb, router.use(auth)), tehát a hívót a tokenből ismerjük, és a
   request.userId garantáltan beállított. Amit itt fékezünk, az egy (akár
   ellopott) TOKEN teljes írás-mennyisége — azt a fiók kulcsolja pontosan. Az IP
   itt rossz kulcs volna: egy megosztott kijáraton (egyetem, iroda) sok jogos
   fiók egy vödörbe esne, egy botnet viszont IP-nként szétosztva megkerülné. A
   serializePerUser a PÁRHUZAMOSSÁGOT már fogja (fiókonként egy írás fut); ez a
   MENNYISÉGET.

   MIÉRT KÉT VÖDÖR. A négy írás-művelet nem egyforma kockázatú:

     - a `reorder` a legburstösebb JOGOS művelet (a főoldali húzás), viszont a
       legártalmatlanabb: MEGLÉVŐ elemek sorrendjét cseréli, semmit nem NÖVESZT,
       és a legolcsóbb. Mérve (frontend useSortableCards.ts): egy húzás PONTOSAN
       egy kérés — a köztes „átlépések" lokálisak, csak az `onDragEnd` megy ki.
       Emberi tempó ~40 húzás/perc a felső széle; a 180-as keret ennek ~4×-e,
       tehát a jogos használatot sosem érinti.

     - a `create`/`update`/`delete` a tárhely- és erőforrás-vektor (a `create`
       az egyetlen, ami NÖVESZTI a tárat). Ezek emberi tempójúak: az autosave is
       csak 10 perc TÉTLENSÉG után fut (l. frontend idle.ts), nem gépelés közben.
       A kombinált csúcs ~40/perc körül van; a 90-es, SZOROSABB keret ~2×-e.

   A HÁROM ÍRÁS EGY KÖZÖS VÖDÖRBEN (egy limiter-példány mind a hat route-on,
   to-do ÉS idézet), mert az erőforrás-nyomás a TELJES írás-mennyiséggel arányos,
   nem szekciónként külön. A reorder külön példány.

   AMIT EZ NEM FOG: a LASSÚ, kitartó feltöltést (90/perc órákon át). Arra a helyes
   eszköz egy fiókonkénti elem-darabszám-KVÓTA — külön mechanizmus, külön menetben
   (per-section, modell-deklarált plafon). A kettő két külön tengely: ez a
   SEBESSÉGET, a kvóta a VÉGÖSSZEGET fogja. */
const writeRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 90,
    message: "Túl sok írási művelet rövid idő alatt. Próbáld újra kicsit később.",
    keyOf: (request) => request.userId,
});
const reorderRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 180,
    message: "Túl sok átrendezés rövid idő alatt. Próbáld újra kicsit később.",
    keyOf: (request) => request.userId,
});

const todosRouter = require("express").Router();

/* A SORSZÁMOT MOZGATÓ VÉGPONTOK SOROSÍTVA, felhasználónként. Négyen vannak
   szekciónként (create, update, delete, reorder), és mind ugyanabból a két
   lépésből áll: told el a szomszédokat, majd írd az elemet. A pár nem atomi
   (tranzakció nincs, mérve), tehát két párhuzamos kérés egymásba fűzheti a
   feleit — a lista pedig némán elromlik. Az indoklás és a mérések: userLock.js.

   Az `auth` MÖGÖTT áll, mert a tokenből vett `request.userId`-re épül. */

/* A LÉTREHOZÁS IS AZONOSÍTÓT KÉR. Az `_id`-t a kliens adja (a szerkesztő
   megnyitásakor születik), mert az egyedi index az egyetlen atomi eszközünk arra,
   hogy egy megismételt kérés ne hozzon létre másodpéldányt — l. createOnce.js.
   Ezért ugyanaz a két őr áll előtte, mint a módosítás előtt: az azonosító alakja,
   majd a törzs. A hiányzó azonosító VALIDÁCIÓS HIBA, nem csendes visszaesés a
   szerver-generálásra: a kétoldali kötést jobb kimondani, mint feltételezni. */
todosRouter.use("/create", writeRateLimit, validateObjectId, validateTodoBody, serializePerUser, todosCreate);

todosRouter.use("/last/order", readLastOrder);
todosRouter.use("/categories", todosReadCategory);
todosRouter.use("/id", validateObjectId, todosReadById);
todosRouter.use("/category", validateCategoryFilter, todosReadByCategory);
todosRouter.use("/color", validateColorFilter, todosReadByColor);

// A módosításnak az id-ja ÉS a törzse is ellenőrzendő, a törlésnek csak az id-ja.
todosRouter.use("/update", writeRateLimit, validateObjectId, validateTodoBody, serializePerUser, todosUpdate);
todosRouter.use("/delete", writeRateLimit, validateObjectId, serializePerUser, todosDelete);
// Csak a sorszámot mozgatja (főoldali húzás) — a tartalomhoz nem nyúl. Külön,
// LAZÁBB vödör (reorderRateLimit): a húzás burstös, de semmit nem növeszt.
todosRouter.use("/reorder", reorderRateLimit, validateObjectId, validateOrderOnly, serializePerUser, todosReorder);

// A to-do főlistája: POST /to-dos
todosRouter.use(todosRead);

router.use("/to-dos", todosRouter);

/* Az idézetek névtere. Az egy-idézet-olvasás (/quotes/id) fentebb, az auth ELŐTT
   van; itt a saját lista, a szerző-szűrés és az írás-műveletek, mind auth mögött.
   Szimmetrikus a /to-dos-val, csak vékonyabb (nincs szín, sorszám-lekérdezés). */
const quotesRouter = require("express").Router();

quotesRouter.use("/create", writeRateLimit, validateObjectId, validateQuoteBody, serializePerUser, quotesCreate);
quotesRouter.use("/last/order", quotesReadLastOrder);
quotesRouter.use("/authors", validateAuthorPrefix, quotesReadAuthors);
quotesRouter.use("/author", validateAuthorFilter, quotesReadByAuthor);
/* A szerkesztő idézet-betöltése — auth MÖGÖTT, tulajdonos-ellenőrzéssel (l.
   readForEdit.js). A publikus /quotes/id (auth ELŐTT, fent) csak a megjelenítő
   mezőket adja; a sorszámot a szerkesztő ezen a hitelesített végponton kapja. */
quotesRouter.use("/edit", validateObjectId, quotesReadForEdit);
/* A keresés két végpontja. A /search-mode a beküldéskori MÓD-döntés (olcsó,
   lét-kérdések), a /search a szöveg-mód TÖMB-találata (a húzáshoz). A statikus
   nevek nem ütköznek egymással, sem a /author-ral. */
quotesRouter.use("/search-mode", validateSearchTerm, quotesReadSearchMode);
quotesRouter.use("/search", validateSearchTerm, quotesReadSearch);

quotesRouter.use("/update", writeRateLimit, validateObjectId, validateQuoteBody, serializePerUser, quotesUpdate);
quotesRouter.use("/delete", writeRateLimit, validateObjectId, serializePerUser, quotesDelete);
// Külön, lazább vödör, mint a to-do reorderé — ugyanaz a példány, egy fiók-vödör.
quotesRouter.use("/reorder", reorderRateLimit, validateObjectId, validateOrderOnly, serializePerUser, quotesReorder);

// Az idézet-lista: POST /quotes
quotesRouter.use(quotesRead);

router.use("/quotes", quotesRouter);

module.exports = router;
