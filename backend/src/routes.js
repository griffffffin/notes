const router = require("express").Router();
const auth = require("./middleware/auth");

const userCreate = require("./controllers/User/create");
const userLogin = require("./controllers/User/login");

const todoCreate = require("./controllers/Todo/create");

const todoRead = require("./controllers/Todo/read");
const readLastOrder = require("./controllers/Todo/readLastOrder");
const todoReadCategory = require("./controllers/Todo/readCategory");
const todoReadById = require("./controllers/Todo/readById");
const todoReadByCategory = require("./controllers/Todo/readByCategory");
const todoReadByColor = require("./controllers/Todo/readByColor");

const todoUpdate = require("./controllers/Todo/update");
const todoDelete = require("./controllers/Todo/delete");


router.use("/user/create", userCreate);
router.use("/login", userLogin);

// Innentől minden végpont csak érvényes tokennel érhető el.
router.use(auth);

router.use("/todo/create", todoCreate);

router.use("/last/order", readLastOrder);
router.use("/categories", todoReadCategory);
router.use("/id", todoReadById);
router.use("/category", todoReadByCategory);
router.use("/color", todoReadByColor);

router.use("/update", todoUpdate);
router.use("/delete", todoDelete);

router.use(todoRead);

module.exports = router;
