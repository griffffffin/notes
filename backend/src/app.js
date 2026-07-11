const express = require("express");
const app = express();
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();
const env = process.env;

app.use(cors());
app.use(express.json());

mongoose.connect(env.DATABASE)
    .then(() => console.log("Adatbázis-kapcsolat él."))
    .catch((error) => console.log("Error: " + error));

app.get("/health", async (request, response) => {
    try {
        await mongoose.connection.db.admin().ping();
        response.json({status: "ok", database: "ok"});
    } catch (error) {
        response.status(503).json({status: "ok", database: "unreachable", error: error.message});
    }
});

app.listen(env.PORT, env.HOST, () => console.log("A szerver fut."));
