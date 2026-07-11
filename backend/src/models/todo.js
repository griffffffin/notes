const mongoose = require("mongoose");
const Schema = mongoose.Schema;

module.exports = mongoose.model("Todo", new Schema({
    user: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    tasks: {
        type: Object,
    },
    taskOrder: {
        type: [Number]
    },
    category: {
        type: String,
        required: true
    },
    color: {
        type: String,
        required: true
    },
    percentage: {
        type: Number,
        required: true
    },
    order: {
        type: Number,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        required: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}));
