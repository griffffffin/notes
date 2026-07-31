/* A bemenet-ellenőrzés tesztjei. A böngészőnk sosem küldene rossz adatot —
   de a végpont bárkinek nyitva áll, aki tokent szerzett, ezért a szerver nem
   bízhat a kliens jólneveltségében. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const request = require("supertest");

const {validateTodoBody, validateCategoryFilter, validateColorFilter} = require("./validateTodo");

const app = express();
app.use(express.json());
app.post("/todo", validateTodoBody, (request_, response) => response.json(request_.body));

// Érvényes alap, amiből a tesztek egy-egy mezőt rontanak el.
const VALID = {title: "Bevásárlás", category: "otthon", color: "warning", order: 1, tasks: {}, taskOrder: []};
const post = (body) => request(app).post("/todo").send(body);

test("érvényes to-dót átenged", async () => {
    const response = await post(VALID);
    assert.strictEqual(response.status, 200);
});

test("üres címet elutasít (400)", async () => {
    assert.strictEqual((await post({...VALID, title: "   "})).status, 400);
});

test("hiányzó kategóriát elutasít (400)", async () => {
    assert.strictEqual((await post({...VALID, category: undefined})).status, 400);
});

test("ismeretlen színt elutasít (400)", async () => {
    // A szín Bootstrap-osztálynévbe kerül — nem vehetünk át bármit.
    assert.strictEqual((await post({...VALID, color: "kek"})).status, 400);
});

test("nulla és negatív sorszámot elutasít (400)", async () => {
    assert.strictEqual((await post({...VALID, order: 0})).status, 400);
    assert.strictEqual((await post({...VALID, order: -5})).status, 400);
});

test("tört sorszámot elutasít (400)", async () => {
    assert.strictEqual((await post({...VALID, order: 1.5})).status, 400);
});

test("túl hosszú címet elutasít (400)", async () => {
    assert.strictEqual((await post({...VALID, title: "a".repeat(201)})).status, 400);
});

test("objektumot string helyett elutasít — NoSQL-injekció ellen (400)", async () => {
    /* Ha ez átmenne, a {$ne: null} nem ÉRTÉKKÉNT, hanem lekérdezés-
       OPERÁTORKÉNT kerülne a szűrőbe, és megváltoztatná a jelentését. */
    assert.strictEqual((await post({...VALID, title: {$ne: null}})).status, 400);
    assert.strictEqual((await post({...VALID, category: {$ne: null}})).status, 400);
});

test("hiányzó tasks esetén üres objektumra egészíti ki", async () => {
    // A százalékszámítás Object.keys(tasks)-ot hív: undefined-on elhasalna.
    const response = await post({...VALID, tasks: undefined, taskOrder: undefined});
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body.tasks, {});
    assert.deepStrictEqual(response.body.taskOrder, []);
});

test("tasks helyett tömböt elutasít (400)", async () => {
    assert.strictEqual((await post({...VALID, tasks: ["a"]})).status, 400);
});

test("hibás alakú listaelemet elutasít (400)", async () => {
    assert.strictEqual((await post({...VALID, tasks: {0: {content: "x", done: "igen"}}})).status, 400);
    assert.strictEqual((await post({...VALID, tasks: {0: {content: 5, done: true}}})).status, 400);
});

test("nem szám taskOrder-t elutasít (400)", async () => {
    assert.strictEqual((await post({...VALID, taskOrder: ["elso"]})).status, 400);
});

// Az azonosító ellenőrzése minden szekcióban közös — a tesztje a validators.test.js-ben.

/* A szűrő-végpontok mezői EGYENESEN a lekérdezésbe kerülnek. Az idegen adat a
   user-szűkítés miatt így sem szivárogna ki, de egy operátor a SAJÁT szűrésünk
   jelentését változtatná meg — a kategória-nézet mindent visszaadna. */
const filterApp = express();
filterApp.use(express.json());
filterApp.post("/category", validateCategoryFilter, (request_, response) => response.json({ok: true}));
filterApp.post("/color", validateColorFilter, (request_, response) => response.json({ok: true}));

test("kategória-szűrő: stringet átenged, operátort elutasít (400)", async () => {
    assert.strictEqual((await request(filterApp).post("/category").send({category: "otthon"})).status, 200);
    assert.strictEqual((await request(filterApp).post("/category").send({category: {$ne: null}})).status, 400);
    assert.strictEqual((await request(filterApp).post("/category").send({})).status, 400);
});

test("szín-szűrő: csak paletta-színt enged át (400)", async () => {
    assert.strictEqual((await request(filterApp).post("/color").send({color: "warning"})).status, 200);
    assert.strictEqual((await request(filterApp).post("/color").send({color: {$ne: null}})).status, 400);
    assert.strictEqual((await request(filterApp).post("/color").send({color: "kek"})).status, 400);
});

test("ismeretlen mezőt tartalmazó listaelemet elutasít (400)", async () => {
    /* A séma "tasks: {type: Object}"-ot mond, tehát bármit eltárolna — ismeretlen
       kulcsok tiltása nélkül egy saját kliens tetszőleges adatot rejthetne el a
       listaelemekben, ami onnan az exportokba és a mentésekbe is átfolyna. */
    const task = {id: "0", content: "a", done: false, smuggled: "tetszőleges adat"};
    assert.strictEqual((await post({...VALID, tasks: {0: task}})).status, 400);
});

test("a szabályos három mezős listaelemet átengedi", async () => {
    const task = {id: "0", content: "a", done: false};
    assert.strictEqual((await post({...VALID, tasks: {0: task}, taskOrder: [0]})).status, 200);
});

test("nem létező listaelemre hivatkozó sorrendet elutasít (400)", async () => {
    /* A lista-nézet a taskOrder szerint járja be a tasks-ot (tasks[order].done).
       Hiányzó elemre ez TypeError, azaz a felhasználó a SAJÁT főoldalán kapna
       hibaképernyőt — és onnan nem is tudná visszacsinálni. */
    assert.strictEqual((await post({...VALID, tasks: {}, taskOrder: [99]})).status, 400);
    assert.strictEqual((await post({...VALID, tasks: undefined, taskOrder: [0]})).status, 400);
});

test("a tasks kulcsaira hivatkozó sorrendet átengedi", async () => {
    const tasks = {0: {id: "0", content: "a", done: false}, 1: {id: "1", content: "b", done: true}};
    assert.strictEqual((await post({...VALID, tasks, taskOrder: [1, 0]})).status, 200);
});
