const mongoose = require("mongoose");
const Schema = mongoose.Schema;

module.exports = mongoose.model("Users", new Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        required: true
    }
}));
