const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true, // No two users can have the same username
    },
    email: {
        type: String,
        required: true,
        unique: true, // No two users can have the same email
    },
    password: {
        type: String,
        required: true,
    },
    walletAddress: {
        type: String,
        default: '',
    },
}, { timestamps: true }); // Adds createdAt and updatedAt fields

module.exports = mongoose.model('user', UserSchema);