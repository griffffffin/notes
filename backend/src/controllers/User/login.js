const router = require("express").Router();
const User = require("../../models/user");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

module.exports = router.post("/", ((request, response) =>
        User.findOne({"name": request.body.name})
            .then((user) =>
                (user === null) ? response.status(400).json("Error: Hibas felhasznalonev.") :
                    bcrypt.compare(request.body.password, user.password, (error, isMatch) =>
                        (error) ? response.status(400).json("Error: " + error) :
                            (isMatch) ?
                                response.json(jwt.sign({id: user._id}, process.env.JWT_SECRET,
                                    {expiresIn: "7d"})) :
                                response.status(400).json("Error: Hibas jelszo.")))
            .catch((error) => response.status(400).json(error))
));
