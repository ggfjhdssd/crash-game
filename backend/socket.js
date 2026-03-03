const User = require('./models/User');
const Bet = require('./models/Bet');
const { v4: uuidv4 } = require('uuid');

// Game state
let currentMultiplier = 1.00;
let gameActive = false;
let crashPoint = 1.00;
let roundId = uuidv4();
let intervalId = null;
let bets = []; // active bets in current round
let io; // Global io variable

// Generate crash point with 3% house edge
function generateCrashPoint() {
  const r = Math.random();
  const crash = 0.97 / (1 - r);
  return Math.max(1.00, Math.floor(crash * 100) / 100);
}

// Reset game for new round
function resetGame() {
  currentMultiplier = 1.00;
  gameActive = true;
  crashPoint = generateCrashPoint();
  roundId = uuidv4();
  bets = []; // clear active bets
  if (io) {
    io.emit('game_started', { roundId }); // crashPoint ကို client ကိုမပို့ပါနဲ့ (secret ထားရန်)
  }
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

  if (io) {
    io.emit('game_crashed', { crashPoint, roundId });
  }

  // Schedule next round after 5 seconds
  setTimeout(() => {
    resetGame();
    startMultiplierIncrease();
  }, 5000);
}

// Increase multiplier every 100ms
function startMultiplierIncrease() {
  intervalId = setInterval(() => {
    if (!gameActive) return;
    currentMultiplier = parseFloat((currentMultiplier + 0.01).toFixed(2));
    
    if (io) {
      io.emit('multiplier_update', { multiplier: currentMultiplier, roundId });
    }

    // Check if crash point reached
    if (currentMultiplier >= crashPoint) {
      endRound();
    }
  }, 100);
}

// Helper to parse Telegram initData (simplified)
function parseInitData(initData) {
  const params = new URLSearchParams(initData);
  const userStr = params.get('user');
  if (!userStr) throw new Error('No user data');
  return JSON.parse(decodeURIComponent(userStr));
}

// Main socket function
module.exports = (socketIO) => {
  io = socketIO; // Assign to global io variable
  
  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Send current game state
    socket.emit('game_state', {
      gameActive,
      currentMultiplier,
      roundId
    });

    // User authentication via Telegram initData
    socket.on('authenticate', async (initData) => {
      try {
        const userData = parseInitData(initData);
        const { id, username, first_name } = userData;

        let user = await User.findOne({ userId: id.toString() });
        if (!user) {
          user = new User({
            userId: id.toString(),
            username: username || first_name,
            firstName: first_name,
            coins: 1000 // Welcome bonus
          });
          await user.save();
        }

        socket.user = user;
        socket.emit('authenticated', { balance: user.coins, username: user.username });
      } catch (err) {
        socket.emit('auth_error', 'Invalid initData');
      }
    });

    // Place bet
    socket.on('place_bet', async (data) => {
      if (!socket.user) return socket.emit('error', 'Not authenticated');
      if (!gameActive) return socket.emit('error', 'Game not active');
      if (bets.some(b => b.userId === socket.user.userId)) return socket.emit('error', 'Already bet in this round');

      const amount = parseFloat(data.amount);
      if (isNaN(amount) || amount <= 0) return socket.emit('error', 'Invalid amount');
      if (socket.user.coins < amount) return socket.emit('error', 'Insufficient balance');

      // Deduct balance
      socket.user.coins -= amount;
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

      socket.emit('bet_placed', { balance: socket.user.coins, betId: bet._id });
      io.emit('new_bet', { username: socket.user.username, amount });
    });

    // Cash out
    socket.on('cash_out', async () => {
      if (!socket.user) return socket.emit('error', 'Not authenticated');
      if (!gameActive) return socket.emit('error', 'Game already crashed');

      const bet = bets.find(b => b.userId === socket.user.userId && b.status === 'active');
      if (!bet) return socket.emit('error', 'No active bet found');

      const cashoutMultiplier = currentMultiplier;
      const winAmount = bet.amount * cashoutMultiplier;
      const profit = winAmount - bet.amount;

      // Update user balance
      socket.user.coins += winAmount;
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
      io.emit('user_cashed_out', { username: socket.user.username, multiplier: cashoutMultiplier });
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  // Start first round
  resetGame();
  startMultiplierIncrease();
};
