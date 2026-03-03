const crypto = require('crypto');

function validateTelegramData(initData, botToken) {
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        
        if (!hash) return false;
        
        params.delete('hash');
        
        // Sort keys alphabetically
        const sortedKeys = Array.from(params.keys()).sort();
        const dataCheckString = sortedKeys
            .map(key => `${key}=${params.get(key)}`)
            .join('\n');
        
        // Create secret key from bot token
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(botToken)
            .digest();
        
        // Calculate HMAC
        const hmac = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');
        
        return hmac === hash;
        
    } catch (err) {
        console.error('Telegram validation error:', err);
        return false;
    }
}

function parseInitData(initData) {
    const params = new URLSearchParams(initData);
    const userStr = params.get('user');
    
    if (!userStr) {
        throw new Error('No user data in initData');
    }
    
    return JSON.parse(decodeURIComponent(userStr));
}

module.exports = {
    validateTelegramData,
    parseInitData
};
