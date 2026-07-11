const router = require("express").Router();
const find = require("./functions/find");

module.exports = router.post("/", ((request, response) =>
    find({user: request.body.user}, null, response, (todos) => {
            let categories = [];
            for (const [key] of Object.entries(todos)) {
                const category = todos[key].category;
                if (categories.indexOf(category) === -1) categories.push(category);
            }
            categories.sort((x, y) => x.localeCompare(y));
            response.json(categories);
        }
    )));
