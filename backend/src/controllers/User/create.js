const router = require("express").Router();
const bcrypt = require("bcrypt");
const SALT_WORK_FACTOR = 10;
const User = require("../../models/user");

module.exports = router.post("/", ((request, response) => {
    const name = request.body.name;
    const password = request.body.password;

    if (/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/.test(password))
        bcrypt.genSalt(SALT_WORK_FACTOR, (error, salt) =>
            (error) ? response.status(400).json("Error: " + error) :
                bcrypt.hash(password, salt, (error, hashedPassword) =>
                    (error) ? response.status(400).json("Error: " + error) :
                        new User({name: name, password: hashedPassword})
                            .save()
                            .then((user) => response.json(user._id))
                            .catch((error) => {
                                if (error.code === 11000) response.status(400)
                                    .json("MongoServerError: " + name + " felhasznalonev mar foglalt.");
                                else if (error.errors?.name?.properties?.type === "required" &&
                                    error.errors?.name?.properties?.path === "name") response.status(400)
                                    .json("ValidatorError: A felhasznalonev megadasa kotelezo.");
                                else response.status(400).json("Error: " + error);
                            })
                )
        );
    else response.status(400).json(
        "ValidationError: " + " A jelszo legalabb 8 karakter legyen. Kis-, nagybetukbol es szamokbol alljon."
    );

}));
