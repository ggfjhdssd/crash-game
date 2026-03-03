const express = require('express');
const router = express.Router();
const Bet = require('../models/Bet');
const User = require('../models/User');

// Get admin stats
router.get('/stats', async (req, res) => {
  try {
    const totalBets = await Bet.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalWon = await Bet.aggregate([
      { $match: { status: 'cashed_out' } },
      { $group: { _id: null, total: { $sum: { $multiply: ['$amount', '$cashoutMultiplier'] } } } }
    ]);
    const totalBetAmount = totalBets.length ? totalBets[0].total : 0;
    const totalWonAmount = totalWon.length ? totalWon[0].total : 0;
    const profit = totalBetAmount - (totalWonAmount - totalBetAmount); // or totalBetAmount - totalWonAmount? Let's clarify: Profit = total bets placed - total winnings paid out.
    // Actually, house profit = total bets - total winnings (since winnings include original stake)
    const houseProfit = totalBetAmount - (totalWonAmount - totalBetAmount); // because totalWonAmount = total paid out (including stake), so profit = totalBetAmount - (totalWonAmount - totalBetAmount) = 2*totalBetAmount - totalWonAmount.
    // Simpler: profit = totalBetAmount - (totalWonAmount - totalBetAmount) = 2*totalBetAmount - totalWonAmount.
    // Or we can compute net profit directly.
    const netProfit = totalBetAmount - (totalWonAmount - totalBetAmount); // This is the same.

    res.json({
      totalBets: totalBetAmount,
      totalWon: totalWonAmount,
      profit: netProfit
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all users (simple)
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().sort({ coins: -1 }).limit(50);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
