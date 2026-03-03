const express = require('express');
const router = express.Router();
const Bet = require('../models/Bet');
const User = require('../models/User');

// Environment Variable ကနေ Admin IDs ကိုဖတ်မယ်
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];

console.log('Admin IDs loaded:', ADMIN_IDS); // Deploy log မှာပြမယ်

// Admin စစ်ဆေးရန် Middleware
const isAdmin = (req, res, next) => {
  // Telegram initData ကနေ user id ကိုရယူပါ
  const initData = req.headers['x-telegram-init-data'];
  if (!initData) {
    return res.status(401).json({ error: 'Unauthorized - No initData' });
  }

  try {
    // initData ကို parse လုပ်ပါ
    const params = new URLSearchParams(initData);
    const userStr = params.get('user');
    if (!userStr) throw new Error('No user data');
    
    const user = JSON.parse(decodeURIComponent(userStr));
    const userId = user.id.toString();
    
    // Environment Variable ကနေရလာတဲ့ Admin IDs နဲ့စစ်ဆေးပါ
    if (!ADMIN_IDS.includes(userId)) {
      console.log(`Unauthorized access attempt by user: ${userId}`);
      return res.status(403).json({ error: 'Forbidden - Not an admin' });
    }
    
    req.adminUser = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid initData' });
  }
};

// Get admin stats
router.get('/stats', isAdmin, async (req, res) => {
  try {
    // Total bets
    const totalBetsAgg = await Bet.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    // Total won
    const totalWonAgg = await Bet.aggregate([
      { $match: { status: 'cashed_out' } },
      { $group: { _id: null, total: { $sum: { $multiply: ['$amount', '$cashoutMultiplier'] } } } }
    ]);

    // ဒီနေ့စာရင်း
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayBetsAgg = await Bet.aggregate([
      { $match: { createdAt: { $gte: today } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    const todayWonAgg = await Bet.aggregate([
      { $match: { status: 'cashed_out', createdAt: { $gte: today } } },
      { $group: { _id: null, total: { $sum: { $multiply: ['$amount', '$cashoutMultiplier'] } } } }
    ]);

    const totalBets = totalBetsAgg[0]?.total || 0;
    const totalWon = totalWonAgg[0]?.total || 0;
    const todayBets = todayBetsAgg[0]?.total || 0;
    const todayWon = todayWonAgg[0]?.total || 0;
    
    // အမြတ် = စုစုပေါင်းလောင်းငွေ - (စုစုပေါင်းအနိုင်ငွေ - စုစုပေါင်းလောင်းငွေ)
    const profit = (totalBets * 2) - totalWon;
    const todayProfit = (todayBets * 2) - todayWon;

    res.json({
      totalBets,
      totalWon,
      profit,
      todayBets,
      todayProfit,
      lastUpdated: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all users
router.get('/users', isAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .sort({ coins: -1 })
      .limit(100)
      .select('-__v');
    
    const totalUsers = await User.countDocuments();
    const totalCoins = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$coins' } } }
    ]);

    res.json({
      users,
      totalUsers,
      totalCoins: totalCoins[0]?.total || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
