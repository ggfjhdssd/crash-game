const mongoose = require('mongoose');

const BetSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: { type: String },
  amount: { type: Number, required: true },
  cashoutMultiplier: { type: Number, default: null }, // null if lost
  profit: { type: Number, default: 0 },
  crashPoint: { type: Number }, // game crash point
  roundId: { type: String, required: true },
  status: { type: String, enum: ['active', 'cashed_out', 'lost'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Bet', BetSchema);
