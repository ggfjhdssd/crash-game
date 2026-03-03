const User = require('./models/User');
const Bet = require('./models/Bet');
const GameRound = require('./models/GameRound');
const { v4: uuidv4 } = require('uuid');

let io;
let currentMultiplier = 1.00;
let gameActive = false;
let crashPoint = 1.00;
let roundId = uuidv4();
let intervalId = null;
let countdownInterval = null;
let bets = [];
let roundStartTime = null;

// =============================================
// FIX 1: Smart Crash Logic for Admin Profitability
// =============================================
function generateSmartCrashPoint() {
    // Base random crash point with 3% house edge
    const r = Math.random();
    const baseCrash = 0.97 / (1 - r);
    
    // Calculate total active bets
    const totalBetsAmount = bets.reduce((sum, bet) => sum + bet.amount, 0);
    
    // Smart Logic: If total bets > threshold, force early crash
    const THRESHOLD = 10000; // 10,000 MMK threshold
    const EARLY_CRASH_MAX = 1.50; // Max 1.50x if threshold exceeded
    
    let finalCrash = Math.max(1.00, Math.floor(baseCrash * 100) / 100);
    
    // If total bets exceed threshold, limit crash point
    if (totalBetsAmount > THRESHOLD) {
        finalCrash = Math.min(finalCrash, EARLY_CRASH_MAX);
        console.log(`🛡️ House protection: Total bets ${totalBetsAmount} > threshold, limiting crash to ${finalCrash}x`);
    }
    
    // House Edge: Ensure 95% payout ratio over time
    // This is handled by the base formula 0.97/(1-r) which already has 3% edge
    
    return finalCrash;
}

// Reset game for new round
async function resetGame() {
    currentMultiplier = 1.00;
    gameActive = true;
    crashPoint = generateSmartCrashPoint(); // Use smart crash logic
    roundId = uuidv4();
    roundStartTime = Date.now();
    bets = [];
    
    // Save round to database
    await GameRound.create({
        roundId,
        crashPoint,
        startTime: new Date()
    });
    
    io.emit('game_started', { roundId });
    console.log(`🎮 New round started: ${roundId}, crash point: ${crashPoint}x`);
}

// End round (crash)
async function endRound() {
    gameActive = false;
    clearInterval(intervalId);
    
    // Process all active bets as lost
    for (const bet of bets) {
        bet.status = 'lost';
        await bet.save();
    }
    
    // Update round in database
    await GameRound.findOneAndUpdate(
        { roundId },
        { 
            endTime: new Date(),
            totalBets: bets.length,
            totalAmount: bets.reduce((sum, b) => sum + b.amount, 0),
            crashPoint
        }
    );
    
    io.emit('game_crashed', { crashPoint, roundId });
    console.log(`💥 Round crashed at ${crashPoint}x`);
    
    // Start countdown for next round
    startCountdown();
}

// Start countdown between rounds
function startCountdown() {
    let countdown = 5;
    countdownInterval = setInterval(() => {
        countdown--;
        io.emit('countdown', { seconds: countdown });
        
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            resetGame();
            startMultiplierIncrease();
        }
    }, 1000);
}

// Increase multiplier every 100ms
function startMultiplierIncrease() {
    intervalId = setInterval(() => {
        if (!gameActive) return;
        
        currentMultiplier = parseFloat((currentMultiplier + 0.01).toFixed(2));
        
        // Send multiplier update to all clients
        io.emit('multiplier_update', { 
            multiplier: currentMultiplier, 
            roundId,
            timestamp: Date.now()
        });
        
        // Check if crash point reached
        if (currentMultiplier >= crashPoint) {
            endRound();
        }
    }, 100);
}

// Get active bets count and total
function getRoundStats() {
    return {
        totalBets: bets.reduce((sum, b) => sum + b.amount, 0),
        playersCount: bets.length
    };
}

module.exports = (socketIO) => {
    io = socketIO;
    
    io.on('connection', async (socket) => {
        console.log(`🔌 New client connected: ${socket.id}`);
        
        // Send current game state
        socket.emit('game_state', {
            gameActive,
            currentMultiplier,
            roundId,
            roundStartTime
        });
        
        socket.emit('round_stats', getRoundStats());
        
        // =============================================
        // FIX 2: Authentication with proper username fallback
        // =============================================
        socket.on('authenticate', async (initData) => {
            try {
                const { validateTelegramData, parseInitData } = require('./utils/telegram');
                
                // Validate Telegram data
                const isValid = validateTelegramData(initData, process.env.BOT_TOKEN);
                if (!isValid) {
                    socket.emit('auth_error', 'Invalid Telegram data');
                    return;
                }
                
                const userData = parseInitData(initData);
                const { id, username, first_name } = userData;
                
                // FIX: Proper username fallback
                const displayName = username || first_name || id.toString().slice(0, 8);
                
                let user = await User.findOne({ userId: id.toString() });
                
                if (!user) {
                    // FIX: New user gets 1000 MMK bonus
                    user = new User({
                        userId: id.toString(),
                        username: displayName,
                        firstName: first_name || '',
                        coins: 1000, // Welcome bonus
                        totalGames: 0,
                        totalWins: 0
                    });
                    await user.save();
                    console.log(`👤 New user created: ${displayName} with 1000 MMK bonus`);
                } else {
                    // Update last seen
                    user.lastSeen = new Date();
                    await user.save();
                }
                
                socket.user = user;
                socket.emit('authenticated', { 
                    balance: user.coins, 
                    username: user.username,
                    userId: user.userId
                });
                
            } catch (err) {
                console.error('Authentication error:', err);
                socket.emit('auth_error', 'Authentication failed');
            }
        });
        
        // Place bet
        socket.on('place_bet', async (data) => {
            try {
                if (!socket.user) {
                    socket.emit('error', 'ကျေးဇူးပြု၍အကောင့်ဝင်ပါ');
                    return;
                }
                
                if (!gameActive) {
                    socket.emit('error', 'ဂိမ်းစတင်ရန်စောင့်ဆိုင်းနေပါသည်');
                    return;
                }
                
                if (bets.some(b => b.userId === socket.user.userId)) {
                    socket.emit('error', 'ဤအကျော့တွင်လောင်းပြီးပါပြီ');
                    return;
                }
                
                const amount = parseFloat(data.amount);
                if (isNaN(amount) || amount < 10) {
                    socket.emit('error', 'အနည်းဆုံး ၁၀ MMK လောင်းရပါမည်');
                    return;
                }
                
                if (socket.user.coins < amount) {
                    socket.emit('error', 'လက်ကျန်ငွေမလုံလောက်ပါ');
                    return;
                }
                
                // Check if user is banned
                if (socket.user.banned) {
                    socket.emit('error', 'သင့်အကောင့်ကိုပိတ်ထားပါသည်');
                    return;
                }
                
                // Deduct balance
                socket.user.coins -= amount;
                socket.user.totalBets += 1;
                socket.user.totalWagered += amount;
                await socket.user.save();
                
                const bet = new Bet({
                    userId: socket.user.userId,
                    username: socket.user.username,
                    amount,
                    roundId,
                    status: 'active'
                });
                await bet.save();
                
                bets.push(bet);
                
                socket.emit('bet_placed', { 
                    balance: socket.user.coins, 
                    betId: bet._id 
                });
                
                io.emit('round_stats', getRoundStats());
                
                console.log(`💰 Bet placed: ${socket.user.username} - ${amount} MMK`);
                
            } catch (err) {
                console.error('Bet placement error:', err);
                socket.emit('error', 'လောင်းကြေးထည့်ရာတွင်အဆင်မပြေပါ');
            }
        });
        
        // Cash out
        socket.on('cash_out', async () => {
            try {
                if (!socket.user) {
                    socket.emit('error', 'ကျေးဇူးပြု၍အကောင့်ဝင်ပါ');
                    return;
                }
                
                if (!gameActive) {
                    socket.emit('error', 'ဂိမ်းပြီးဆုံးသွားပါပြီ');
                    return;
                }
                
                const bet = bets.find(b => 
                    b.userId === socket.user.userId && b.status === 'active'
                );
                
                if (!bet) {
                    socket.emit('error', 'လောင်းကြေးမရှိပါ');
                    return;
                }
                
                const cashoutMultiplier = currentMultiplier;
                const winAmount = bet.amount * cashoutMultiplier;
                const profit = winAmount - bet.amount;
                
                // Update user balance
                socket.user.coins += winAmount;
                socket.user.totalWins += 1;
                await socket.user.save();
                
                // Update bet record
                bet.status = 'cashed_out';
                bet.cashoutMultiplier = cashoutMultiplier;
                bet.profit = profit;
                await bet.save();
                
                socket.emit('cashed_out', {
                    multiplier: cashoutMultiplier,
                    winAmount,
                    balance: socket.user.coins
                });
                
                io.emit('round_stats', getRoundStats());
                io.emit('user_cashed_out', { 
                    username: socket.user.username, 
                    multiplier: cashoutMultiplier 
                });
                
                console.log(`💵 Cash out: ${socket.user.username} - ${winAmount} MMK at ${cashoutMultiplier}x`);
                
            } catch (err) {
                console.error('Cash out error:', err);
                socket.emit('error', 'ငွေထုတ်ရာတွင်အဆင်မပြေပါ');
            }
        });
        
        // Reconnection handling
        socket.on('reconnect', () => {
            console.log(`🔄 Client reconnected: ${socket.id}`);
            if (socket.user) {
                socket.emit('game_state', {
                    gameActive,
                    currentMultiplier,
                    roundId
                });
                socket.emit('authenticated', {
                    balance: socket.user.coins,
                    username: socket.user.username,
                    userId: socket.user.userId
                });
            }
        });
        
        socket.on('disconnect', () => {
            console.log(`🔌 Client disconnected: ${socket.id}`);
        });
    });
    
    // Start first round
    setTimeout(() => {
        resetGame();
        startMultiplierIncrease();
    }, 1000);
};
