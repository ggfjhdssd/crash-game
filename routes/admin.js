const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Bet = require('../models/Bet');
const GameRound = require('../models/GameRound');
const { adminAuth } = require('../middleware/auth');

// All admin routes require authentication
router.use(adminAuth);

// Get dashboard stats
router.get('/stats', async (req, res) => {
    try {
        // Total stats
        const totalBetsAgg = await Bet.aggregate([
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const totalWonAgg = await Bet.aggregate([
            { $match: { status: 'cashed_out' } },
            { $group: { _id: null, total: { $sum: '$profit' } } }
        ]);
        
        // Today's stats
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayBetsAgg = await Bet.aggregate([
            { $match: { createdAt: { $gte: today } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const todayWonAgg = await Bet.aggregate([
            { $match: { status: 'cashed_out', createdAt: { $gte: today } } },
            { $group: { _id: null, total: { $sum: '$profit' } } }
        ]);
        
        // User stats
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ 
            lastSeen: { $gte: new Date(Date.now() - 24*60*60*1000) }
        });
        
        const totalBets = totalBetsAgg[0]?.total || 0;
        const totalWon = totalWonAgg[0]?.total || 0;
        const todayBets = todayBetsAgg[0]?.total || 0;
        const todayWon = todayWonAgg[0]?.total || 0;
        
        // House profit = Total Bets - Total Winnings
        const profit = totalBets - totalWon;
        const todayProfit = todayBets - todayWon;
        
        // Recent games
        const recentGames = await GameRound.find()
            .sort({ startTime: -1 })
            .limit(10)
            .select('crashPoint startTime totalBets');
        
        res.json({
            totalBets,
            totalWon,
            profit,
            todayBets,
            todayWon,
            todayProfit,
            totalUsers,
            activeUsers,
            recentGames,
            lastUpdated: new Date()
        });
        
    } catch (err) {
        console.error('Admin stats error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get all users with pagination
router.get('/users', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;
        
        const users = await User.find()
            .sort({ coins: -1 })
            .skip(skip)
            .limit(limit)
            .select('-__v');
        
        const totalUsers = await User.countDocuments();
        
        res.json({
            users,
            totalUsers,
            page,
            totalPages: Math.ceil(totalUsers / limit)
        });
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update user balance
router.put('/user/:userId', async (req, res) => {
    try {
        const { balance } = req.body;
        
        if (balance === undefined || balance < 0) {
            return res.status(400).json({ error: 'Invalid balance' });
        }
        
        const user = await User.findOneAndUpdate(
            { userId: req.params.userId },
            { coins: balance },
            { new: true }
        );
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ 
            success: true, 
            user: { 
                userId: user.userId, 
                username: user.username, 
                coins: user.coins 
            } 
        });
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Toggle user ban
router.post('/user/:userId/toggle-ban', async (req, res) => {
    try {
        const user = await User.findOne({ userId: req.params.userId });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        user.banned = !user.banned;
        await user.save();
        
        res.json({ 
            success: true, 
            banned: user.banned,
            userId: user.userId 
        });
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get game history
router.get('/history', async (req, res) => {
    try {
        const history = await GameRound.find()
            .sort({ startTime: -1 })
            .limit(50)
            .select('crashPoint startTime totalBets totalAmount');
        
        res.json(history);
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
