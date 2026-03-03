const { validateTelegramData, parseInitData } = require('../utils/telegram');

// Admin authentication middleware
async function adminAuth(req, res, next) {
    try {
        const initData = req.headers['x-telegram-init-data'];
        
        if (!initData) {
            return res.status(401).json({ error: 'No authentication data' });
        }
        
        // Validate Telegram data
        const isValid = validateTelegramData(initData, process.env.BOT_TOKEN);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid authentication data' });
        }
        
        // Parse user data
        const userData = parseInitData(initData);
        const userId = userData.id.toString();
        
        // Check if user is admin
        const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
        
        if (!adminIds.includes(userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        req.adminUser = userData;
        next();
        
    } catch (err) {
        console.error('Admin auth error:', err);
        res.status(401).json({ error: 'Authentication failed' });
    }
}

module.exports = {
    adminAuth
};
