const router = require("express").Router();
const Todo = require("../../models/todo");
const serverError = require("../../serverError");
const {findOwnedList} = require("../../ownership");

/* A felhasználó ÖSSZES kategóriája, ábécésorrendben — ebből épül a navbar
   legördülője. A localeCompare a magyar ékezetes betűket a helyükre teszi (az
   alapértelmezett kódpont-sorrend az "Á"-t a "Z" mögé sorolná).

   ELTÉRÉS az idézetek szerző-javaslataitól (Quote/readAuthors.js): az ott
   PREFIX-re szűr és a legutóbb használtat adja (autocomplete, $limit 1), itt a
   teljes, rendezett lista kell egy legördülőhöz — más a felület, más a lekérdezés.

   A kategóriákat ma a letöltött listából gyűjtjük ki. Ez a to-do méretén rendben
   van, de a mintája nem skálázódik; ha egyszer sok elem lesz, a `distinct` a
   helyes eszköz (l. a readLastOrder-nél ugyanezt már megtettük). */
module.exports = router.post("/", (request, response) =>
    findOwnedList(Todo, request.userId)
        .then((todos) => {
            const categories = [...new Set(todos.map((todo) => todo.category))];
            categories.sort((first, second) => first.localeCompare(second));
            response.json(categories);
        })
        .catch((error) => serverError(response, error, "Todo.readCategory")));
