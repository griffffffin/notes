const router = require("express").Router();
const find = require("./functions/find");

module.exports = router.post("/", ((request, response) =>
    find({user: request.body.user}, null, response, (todos) => {
            let lastOrder = 0;
            for (const [key] of Object.entries(todos)) {
                const order = todos[key].order;
                if (order > lastOrder) lastOrder = order;
            }
            response.json(lastOrder);
        }
    )));
