const router = require("express").Router();
const auth = require("./middleware/auth");
/* Az azonosító és a sorszám ellenőrzése minden szekcióban ugyanaz — egy közös
   middleware szolgálja ki mindet (korábban szekciónként külön, azonos kóddal). A
   szekció-specifikus szabályok maradnak a saját moduljukban. */
const {validateObjectId, validateOrderOnly} = require("./middleware/validators");
const {validateTodoBody, validateCategoryFilter, validateColorFilter} = require("./middleware/validateTodo");
const {validateQuoteBody, validateAuthorFilter, validateSearchTerm} = require("./middleware/validateQuote");
const validateCredentials = require("./middleware/validateCredentials");

const userCreate = require("./controllers/User/create");
const userLogin = require("./controllers/User/login");
const userRefresh = require("./controllers/User/refresh");

const todoCreate = require("./controllers/Todo/create");

const todoRead = require("./controllers/Todo/read");
const readLastOrder = require("./controllers/Todo/readLastOrder");
const todoReadCategory = require("./controllers/Todo/readCategory");
const todoReadById = require("./controllers/Todo/readById");
const todoReadByCategory = require("./controllers/Todo/readByCategory");
const todoReadByColor = require("./controllers/Todo/readByColor");

const todoUpdate = require("./controllers/Todo/update");
const todoDelete = require("./controllers/Todo/delete");
const todoReorder = require("./controllers/Todo/reorder");

const quoteCreate = require("./controllers/Quote/create");
const quoteReadLastOrder = require("./controllers/Quote/readLastOrder");
const quoteReadAuthors = require("./controllers/Quote/readAuthors");
const quoteReadSearchMode = require("./controllers/Quote/readSearchMode");
const quoteReadSearch = require("./controllers/Quote/readSearch");
const quoteRead = require("./controllers/Quote/read");
const quoteReadByAuthor = require("./controllers/Quote/readByAuthor");
const quoteReadById = require("./controllers/Quote/readById");
const quoteReadForEdit = require("./controllers/Quote/readForEdit");
const quoteUpdate = require("./controllers/Quote/update");
const quoteDelete = require("./controllers/Quote/delete");
const quoteReorder = require("./controllers/Quote/reorder");


router.use("/user/create", validateCredentials, userCreate);
router.use("/login", validateCredentials, userLogin);

/* Egy idézet PUBLIKUSAN olvasható az azonosítója alapján (a megosztott link egy
   konkrét idézetre mutat) — ezért ül ez az EGYETLEN idézet-végpont az auth
   ELŐTT. A lista és minden írás-művelet auth mögött van. */
router.use("/quotes/id", validateObjectId, quoteReadById);

// Innentől minden végpont csak érvényes tokennel érhető el.
router.use(auth);

/* Token-megújítás. Az auth MÖGÖTT: csak érvényes tokenért jár friss —
   lejárt tokennel már nem lehet visszakapaszkodni, ez a tétlenségi
   kijelentkezés lényege. */
router.use("/refresh", userRefresh);

/* A to-do minden végpontja a /to-do névtér alatt — így a további kategóriák
   (pl. /quotes) ütközés nélkül kapják a saját "create", "id", "update"
   végpontjaikat. A user- és auth-útvonalak (login, refresh) kategóriától
   függetlenek, ezért fentebb NEM kerülnek prefix alá. */
const todoRouter = require("express").Router();

todoRouter.use("/create", validateTodoBody, todoCreate);

todoRouter.use("/last/order", readLastOrder);
todoRouter.use("/categories", todoReadCategory);
todoRouter.use("/id", validateObjectId, todoReadById);
todoRouter.use("/category", validateCategoryFilter, todoReadByCategory);
todoRouter.use("/color", validateColorFilter, todoReadByColor);

// A módosításnak az id-ja ÉS a törzse is ellenőrzendő, a törlésnek csak az id-ja.
todoRouter.use("/update", validateObjectId, validateTodoBody, todoUpdate);
todoRouter.use("/delete", validateObjectId, todoDelete);
// Csak a sorszámot mozgatja (főoldali húzás) — a tartalomhoz nem nyúl.
todoRouter.use("/reorder", validateObjectId, validateOrderOnly, todoReorder);

// A to-do főlistája: POST /to-do
todoRouter.use(todoRead);

router.use("/to-do", todoRouter);

/* Az idézetek névtere. Az egy-idézet-olvasás (/quotes/id) fentebb, az auth ELŐTT
   van; itt a saját lista, a szerző-szűrés és az írás-műveletek, mind auth mögött.
   Szimmetrikus a /to-do-val, csak vékonyabb (nincs szín, sorszám-lekérdezés). */
const quoteRouter = require("express").Router();

quoteRouter.use("/create", validateQuoteBody, quoteCreate);
quoteRouter.use("/last/order", quoteReadLastOrder);
quoteRouter.use("/authors", quoteReadAuthors);
quoteRouter.use("/author", validateAuthorFilter, quoteReadByAuthor);
/* A szerkesztő idézet-betöltése — auth MÖGÖTT, tulajdonos-ellenőrzéssel (l.
   readForEdit.js). A publikus /quotes/id (auth ELŐTT, fent) csak a megjelenítő
   mezőket adja; a sorszámot a szerkesztő ezen a hitelesített végponton kapja. */
quoteRouter.use("/edit", validateObjectId, quoteReadForEdit);
/* A keresés két végpontja. A /search-mode a beküldéskori MÓD-döntés (olcsó,
   lét-kérdések), a /search a szöveg-mód TÖMB-találata (a húzáshoz). A statikus
   nevek nem ütköznek egymással, sem a /author-ral. */
quoteRouter.use("/search-mode", validateSearchTerm, quoteReadSearchMode);
quoteRouter.use("/search", validateSearchTerm, quoteReadSearch);

quoteRouter.use("/update", validateObjectId, validateQuoteBody, quoteUpdate);
quoteRouter.use("/delete", validateObjectId, quoteDelete);
quoteRouter.use("/reorder", validateObjectId, validateOrderOnly, quoteReorder);

// Az idézet-lista: POST /quotes
quoteRouter.use(quoteRead);

router.use("/quotes", quoteRouter);

module.exports = router;
