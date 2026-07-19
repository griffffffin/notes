const router = require("express").Router();
const auth = require("./middleware/auth");
const {
    validateTodoBody, validateTodoId, validateOrderOnly, validateCategoryFilter, validateColorFilter,
} = require("./middleware/validateTodo");
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


router.use("/user/create", validateCredentials, userCreate);
router.use("/login", validateCredentials, userLogin);

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
todoRouter.use("/id", validateTodoId, todoReadById);
todoRouter.use("/category", validateCategoryFilter, todoReadByCategory);
todoRouter.use("/color", validateColorFilter, todoReadByColor);

// A módosításnak az id-ja ÉS a törzse is ellenőrzendő, a törlésnek csak az id-ja.
todoRouter.use("/update", validateTodoId, validateTodoBody, todoUpdate);
todoRouter.use("/delete", validateTodoId, todoDelete);
// Csak a sorszámot mozgatja (főoldali húzás) — a tartalomhoz nem nyúl.
todoRouter.use("/reorder", validateTodoId, validateOrderOnly, todoReorder);

// A to-do főlistája: POST /to-do
todoRouter.use(todoRead);

router.use("/to-do", todoRouter);

module.exports = router;
