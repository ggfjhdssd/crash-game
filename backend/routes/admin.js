const express = require('express');
const router = express.Router();
const Bet = require('../models/Bet');
const User = require('../models/User');

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
    
    // Admin User IDs စာရင်း (ခင်ဗျားရဲ့ Telegram ID ထည့်ပါ)
    const adminUserIds = [
      '123456789', // ခင်ဗျားရဲ့ Telegram User ID ၁
      '987654321', // ခင်ဗျားရဲ့ Telegram User ID ၂ (အခြား Admin ရှိရင်)
    ];
    
    if (!adminUserIds.includes(userId)) {
      return res.status(403).json({ error: 'Forbidden - Not an admin' });
    }
    
    req.adminUser = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid initData' });
  }
};

// Get admin stats (Admin ဝင်လို့ရမယ်)
router.get('/stats', isAdmin, async (req, res) => {
  try {
    // Total bets (စုစုပေါင်းလောင်းငွေ)
    const totalBetsAgg = await Bet.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    // Total won (စုစုပေါင်းအနိုင်ငွေ)
    const totalWonAgg = await Bet.aggregate([
      { $match: { status: 'cashed_out' } },
      { $group: { _id: null, total: { $sum: { $multiply: ['$amount', '$cashoutMultiplier'] } } } }
    ]);

    // ဒီနေ့စာရင်း (Today's stats)
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

    // ဒီအပတ်စာရင်း (This week's stats)
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    const weekBetsAgg = await Bet.aggregate([
      { $match: { createdAt: { $gte: weekStart } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // ဒီလစာရင်း (This month's stats)
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    
    const monthBetsAgg = await Bet.aggregate([
      { $match: { createdAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalBets = totalBetsAgg[0]?.total || 0;
    const totalWon = totalWonAgg[0]?.total || 0;
    const todayBets = todayBetsAgg[0]?.total || 0;
    const todayWon = todayWonAgg[0]?.total || 0;
    const weekBets = weekBetsAgg[0]?.total || 0;
    const monthBets = monthBetsAgg[0]?.total || 0;
    
    // အမြတ် = စုစုပေါင်းလောင်းငွေ - (စုစုပေါင်းအနိုင်ငွေ - စုစုပေါင်းလောင်းငွေ)
    const profit = (totalBets * 2) - totalWon;
    const todayProfit = (todayBets * 2) - todayWon;

    res.json({
      totalBets,
      totalWon,
      profit,
      todayBets,
      todayProfit,
      weekBets,
      monthBets,
      lastUpdated: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all users (Admin ဝင်လို့ရမယ်)
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

// Get game statistics (Round history)
router.get('/game-stats', isAdmin, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const rounds = await Bet.aggregate([
      { $group: {
          _id: '$roundId',
          totalBets: { $sum: '$amount' },
          totalWon: { 
            $sum: { 
              $cond: [
                { $eq: ['$status', 'cashed_out'] },
                { $multiply: ['$amount', '$cashoutMultiplier'] },
                0
              ]
            }
          },
          players: { $addToSet: '$userId' },
          crashPoint: { $first: '$crashPoint' },
          firstBet: { $min: '$createdAt' }
      }},
      { $sort: { firstBet: -1 } },
      { $limit: parseInt(limit) }
    ]);

    res.json(rounds);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Force crash game (Admin အတွက် special feature)
router.post('/force-crash', isAdmin, async (req, res) => {
  try {
    const { io } = req.app.locals; // socket.io instance ကိုရယူပါ
    
    if (io) {
      io.emit('admin_force_crash', { 
        message: 'Admin မှ ဂိမ်းကိုရပ်လိုက်ပါသည်',
        timestamp: new Date()
      });
    }
    
    res.json({ success: true, message: 'Game crash forced' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
