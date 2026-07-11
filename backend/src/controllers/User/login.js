const router = require("express").Router();
const User = require("../../models/user");
const bcrypt = require("bcrypt");

module.exports = router.post("/", ((request, response) =>
        User.findOne({"name": request.body.name})
            .then((user) =>
                (user === null) ? response.status(400).json("Error: Hibas felhasznalonev.") :
                    bcrypt.compare(request.body.password, user.password, (error, isMatch) =>
                        (error) ? response.status(400).json("Error: " + error) :
                            (isMatch) ?
                                response.json(user._id) : response.status(400).json("Error: Hibas jelszo.")))
            .catch((error) => response.status(400).json(error))
));
