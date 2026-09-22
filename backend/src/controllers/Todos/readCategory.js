const router = require("express").Router();
const Todos = require("../../models/todos");
const serverError = require("../../serverError");
const {findOwnedList} = require("../../ownership");

/* A felhasználó ÖSSZES kategóriája, ábécésorrendben — ebből épül a navbar
   legördülője. A localeCompare a magyar ékezetes betűket a helyükre teszi (az
   alapértelmezett kódpont-sorrend az "Á"-t a "Z" mögé sorolná).

   (Az idézeteknek volt hasonló szerző-javaslata, de az az E2EE-átállással megszűnt
   — a titkosított tartalomra a szerver nem tud szűrni; a kliens-oldali keresés F3-ban
   jön. A to-do kategóriái nyílt mezők, ezért ez a legördülő marad szerver-oldali.)

   A kategóriákat ma a letöltött listából gyűjtjük ki. Ez a to-do méretén rendben
   van, de a mintája nem skálázódik; ha egyszer sok elem lesz, a `distinct` a
   helyes eszköz (l. a readLastOrder-nél ugyanezt már megtettük). */
module.exports = router.post("/", (request, response) =>
    findOwnedList(Todos, request.userId)
        .then((todos) => {
            const categories = [...new Set(todos.map((todo) => todo.category))];
            categories.sort((first, second) => first.localeCompare(second));
            response.json(categories);
        })
        .catch((error) => serverError(response, error, "Todos.readCategory")));
