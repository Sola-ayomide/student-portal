const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    course: { type: String, required: true },
    address: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profileImage: { type: String },
    regNumber: { type: String, unique: true},
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Student', StudentSchema);