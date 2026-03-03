const express = require('express');
const router = express.Router();
const { validateTelegramData, parseInitData } = require('../utils/telegram');

// Verify Telegram authentication
router.post('/verify', async (req, res) => {
    try {
        const { initData } = req.body;
        
        if (!initData) {
            return res.status(400).json({ error: 'No initData provided' });
        }
        
        // Validate Telegram data
        const isValid = validateTelegramData(initData, process.env.BOT_TOKEN);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid Telegram data' });
        }
        
        // Parse user data
        const userData = parseInitData(initData);
        
        res.json({
            success: true,
            user: {
                id: userData.id,
                username: userData.username || userData.first_name,
                firstName: userData.first_name
            }
        });
        
    } catch (err) {
        console.error('Auth error:', err);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

// Get current user info
router.get('/me', (req, res) => {
    // This would normally come from session
    res.json({ message: 'User info endpoint' });
});

module.exports = router;
