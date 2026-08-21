const router = require("express").Router();
const auth = require("./middleware/auth");
/* Az azonosító és a sorszám ellenőrzése minden szekcióban ugyanaz — egy közös
   middleware szolgálja ki mindet (korábban szekciónként külön, azonos kóddal). A
   szekció-specifikus szabályok maradnak a saját moduljukban. */
const {validateObjectId, validateOrderOnly} = require("./middleware/validators");
const {validateTodoBody, validateCategoryFilter, validateColorFilter} = require("./middleware/validateTodo");
const {validateQuoteBody, validateAuthorFilter, validateSearchTerm,
    validateAuthorPrefix} = require("./middleware/validateQuote");
const validateCredentials = require("./middleware/validateCredentials");
const validateClientError = require("./middleware/validateClientError");
const rateLimit = require("./middleware/rateLimit");

const usersCreate = require("./controllers/Users/create");
const usersLogin = require("./controllers/Users/login");
const usersRefresh = require("./controllers/Users/refresh");
const clientError = require("./controllers/clientError");

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
router.use("/login",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 20,
        message: "Túl sok bejelentkezési kísérlet.",
    }),
    validateCredentials, usersLogin);

/* Egy idézet PUBLIKUSAN olvasható az azonosítója alapján (a megosztott link egy
   konkrét idézetre mutat) — ezért ül ez az EGYETLEN idézet-végpont az auth
   ELŐTT. A lista és minden írás-művelet auth mögött van. */
router.use("/quotes/id", validateObjectId, quotesReadById);

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

/* A to-do minden végpontja a /to-dos névtér alatt — így a további szekciók
   (pl. /quotes) ütközés nélkül kapják a saját "create", "id", "update"
   végpontjaikat. A user- és auth-útvonalak (login, refresh) szekciótól
   függetlenek, ezért fentebb NEM kerülnek prefix alá. */
const todosRouter = require("express").Router();

/* A LÉTREHOZÁS IS AZONOSÍTÓT KÉR. Az `_id`-t a kliens adja (a szerkesztő
   megnyitásakor születik), mert az egyedi index az egyetlen atomi eszközünk arra,
   hogy egy megismételt kérés ne hozzon létre másodpéldányt — l. createOnce.js.
   Ezért ugyanaz a két őr áll előtte, mint a módosítás előtt: az azonosító alakja,
   majd a törzs. A hiányzó azonosító VALIDÁCIÓS HIBA, nem csendes visszaesés a
   szerver-generálásra: a kétoldali kötést jobb kimondani, mint feltételezni. */
todosRouter.use("/create", validateObjectId, validateTodoBody, todosCreate);

todosRouter.use("/last/order", readLastOrder);
todosRouter.use("/categories", todosReadCategory);
todosRouter.use("/id", validateObjectId, todosReadById);
todosRouter.use("/category", validateCategoryFilter, todosReadByCategory);
todosRouter.use("/color", validateColorFilter, todosReadByColor);

// A módosításnak az id-ja ÉS a törzse is ellenőrzendő, a törlésnek csak az id-ja.
todosRouter.use("/update", validateObjectId, validateTodoBody, todosUpdate);
todosRouter.use("/delete", validateObjectId, todosDelete);
// Csak a sorszámot mozgatja (főoldali húzás) — a tartalomhoz nem nyúl.
todosRouter.use("/reorder", validateObjectId, validateOrderOnly, todosReorder);

// A to-do főlistája: POST /to-dos
todosRouter.use(todosRead);

router.use("/to-dos", todosRouter);

/* Az idézetek névtere. Az egy-idézet-olvasás (/quotes/id) fentebb, az auth ELŐTT
   van; itt a saját lista, a szerző-szűrés és az írás-műveletek, mind auth mögött.
   Szimmetrikus a /to-dos-val, csak vékonyabb (nincs szín, sorszám-lekérdezés). */
const quotesRouter = require("express").Router();

quotesRouter.use("/create", validateObjectId, validateQuoteBody, quotesCreate);
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

quotesRouter.use("/update", validateObjectId, validateQuoteBody, quotesUpdate);
quotesRouter.use("/delete", validateObjectId, quotesDelete);
quotesRouter.use("/reorder", validateObjectId, validateOrderOnly, quotesReorder);

// Az idézet-lista: POST /quotes
quotesRouter.use(quotesRead);

router.use("/quotes", quotesRouter);

module.exports = router;
