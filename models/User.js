const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true }, // Telegram user id
  username: { type: String },
  firstName: { type: String },
  coins: { type: Number, default: 1000 }, // starting bonus 1000 MMK
  totalBets: { type: Number, default: 0 },
  totalWon: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
