// Telegram WebApp initialization
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Socket connection with reconnection handling
const socket = io({
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000
});

// Game state
let user = null;
let gameActive = false;
let currentMultiplier = 1.00;
let roundId = null;
let myBet = null;
let isAdmin = false;
let crashHistory = [];

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let canvasWidth, canvasHeight;

// Particles system
let particles = [];

class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = (Math.random() - 0.5) * 8 - 2;
        this.size = Math.random() * 4 + 2;
        this.color = `hsl(${Math.random() * 30 + 340}, 100%, 60%)`;
        this.life = 1;
        this.decay = Math.random() * 0.02 + 0.02;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.2; // gravity
        this.life -= this.decay;
    }

    draw() {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

// Toast notification system
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s forwards';
        setTimeout(() => container.removeChild(toast), 300);
    }, 3000);
}

// Canvas resize
function resizeCanvas() {
    canvasWidth = canvas.clientWidth;
    canvasHeight = canvas.clientHeight;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Draw stars background
function drawStars() {
    for (let i = 0; i < 100; i++) {
        const x = (i * 123456789) % canvasWidth;
        const y = (i * 987654321) % canvasHeight;
        const radius = ((i * 123) % 3) + 1;
        const brightness = ((i * 456) % 100) / 100;
        
        ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fill();
        
        // Twinkle effect
        if (Math.random() > 0.99) {
            ctx.fillStyle = 'rgba(255, 215, 0, 0.8)';
            ctx.beginPath();
            ctx.arc(x, y, radius * 2, 0, 2 * Math.PI);
            ctx.fill();
        }
    }
}

// Draw plane with smooth animation
function drawPlane(multiplier) {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    drawStars();
    
    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++) {
        const y = canvasHeight - (i * canvasHeight / 5);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
        ctx.font = '10px Inter';
        ctx.fillText(`${i}x`, 10, y - 5);
    }
    
    // Draw multiplier curve
    ctx.beginPath();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ff0033';
    ctx.shadowBlur = 15;
    
    for (let x = 0; x <= canvasWidth; x += 5) {
        const t = x / canvasWidth;
        const y = canvasHeight - (Math.pow(multiplier, t) * canvasHeight / 3);
        
        if (x === 0) {
            ctx.moveTo(x, Math.max(0, Math.min(canvasHeight, y)));
        } else {
            ctx.lineTo(x, Math.max(0, Math.min(canvasHeight, y)));
        }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Draw plane
    const planeX = Math.min(canvasWidth * 0.8, 100 + (multiplier - 1) * 50);
    const planeY = Math.max(50, canvasHeight - (multiplier * 40));
    
    // Plane body
    ctx.save();
    ctx.translate(planeX, planeY);
    
    // Wobble effect
    const wobble = Math.sin(Date.now() * 0.01) * 5;
    ctx.rotate(Math.sin(Date.now() * 0.02) * 0.1);
    
    // Draw plane
    ctx.shadowColor = '#ff0033';
    ctx.shadowBlur = 20;
    
    // Body
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(-30, -10);
    ctx.lineTo(20, -15);
    ctx.lineTo(30, -5);
    ctx.lineTo(20, 5);
    ctx.lineTo(-30, 0);
    ctx.closePath();
    ctx.fill();
    
    // Cockpit
    ctx.fillStyle = '#ff0033';
    ctx.beginPath();
    ctx.arc(15, -8, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Trail effect
    ctx.shadowBlur = 30;
    for (let i = 1; i <= 5; i++) {
        ctx.globalAlpha = 0.2 / i;
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(-30 - i * 10, wobble * i, 10 - i, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
    ctx.globalAlpha = 1;
    
    // Update and draw particles
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
        p.update();
        p.draw();
    });
    
    requestAnimationFrame(() => drawPlane(currentMultiplier));
}

// Start animation
drawPlane(1.00);

// Authentication with Telegram
const initData = tg.initData;
if (initData) {
    socket.emit('authenticate', initData);
} else {
    showToast('Telegram data မရှိပါ', 'error');
}

// Socket event handlers
socket.on('connect', () => {
    console.log('Socket connected');
    showToast('ဂိမ်းဆာဗာနှင့်ချိတ်ဆက်မှုအောင်မြင်', 'success');
});

socket.on('disconnect', () => {
    console.log('Socket disconnected');
    showToast('ဆာဗာပြတ်တောက်နေသည်... ပြန်လည်ချိတ်ဆက်နေပါသည်', 'error');
});

socket.on('reconnect', () => {
    showToast('ပြန်လည်ချိတ်ဆက်မှုအောင်မြင်', 'success');
    if (initData) socket.emit('authenticate', initData);
});

// FIX: Immediate UI update after authentication
socket.on('authenticated', (data) => {
    user = data;
    document.getElementById('balance').innerText = data.balance.toLocaleString();
    document.getElementById('username').innerText = data.username;
    
    checkAdminStatus();
    showToast(`ကြိုဆိုပါတယ် ${data.username}!`, 'success');
});

// FIX: Handle force crash from admin
socket.on('admin_force_crash', (data) => {
    showToast(`⚠️ ${data.message}`, 'error');
    // Trigger crash effect
    document.getElementById('crashEffect').classList.add('active');
    setTimeout(() => {
        document.getElementById('crashEffect').classList.remove('active');
    }, 500);
});

socket.on('game_state', (state) => {
    gameActive = state.gameActive;
    currentMultiplier = state.currentMultiplier;
    roundId = state.roundId;
    
    if (gameActive) {
        document.getElementById('waitingOverlay').classList.remove('active');
    }
});

socket.on('multiplier_update', (data) => {
    if (data.roundId === roundId) {
        currentMultiplier = data.multiplier;
        document.getElementById('multiplier').innerText = currentMultiplier.toFixed(2) + 'x';
    }
});

socket.on('game_started', (data) => {
    roundId = data.roundId;
    gameActive = true;
    currentMultiplier = 1.00;
    
    document.getElementById('waitingOverlay').classList.remove('active');
    document.getElementById('placeBetBtn').disabled = false;
    document.getElementById('cashoutBtn').disabled = true;
    document.getElementById('multiplier').innerText = '1.00x';
    
    // Update countdown
    let countdown = 5;
    const interval = setInterval(() => {
        countdown--;
        if (countdown <= 0) clearInterval(interval);
    }, 1000);
});

socket.on('game_crashed', (data) => {
    gameActive = false;
    
    // Add to history
    crashHistory.unshift(data.crashPoint);
    if (crashHistory.length > 10) crashHistory.pop();
    updateHistoryStrip();
    
    // Crash effect
    document.getElementById('multiplier').innerHTML = `💥 ${data.crashPoint.toFixed(2)}x`;
    document.getElementById('crashEffect').classList.add('active');
    setTimeout(() => {
        document.getElementById('crashEffect').classList.remove('active');
    }, 500);
    
    // Create particles
    for (let i = 0; i < 50; i++) {
        particles.push(new Particle(
            canvasWidth / 2 + (Math.random() - 0.5) * 100,
            canvasHeight / 2 + (Math.random() - 0.5) * 100
        ));
    }
    
    document.getElementById('cashoutBtn').disabled = true;
    document.getElementById('placeBetBtn').disabled = true;
    
    // Show waiting overlay
    document.getElementById('waitingOverlay').classList.add('active');
    
    // Countdown animation
    let width = 0;
    const interval = setInterval(() => {
        width += 2;
        document.getElementById('countdownProgress').style.width = width + '%';
        if (width >= 100) {
            clearInterval(interval);
            document.getElementById('countdownProgress').style.width = '0%';
        }
    }, 100);
});

socket.on('bet_placed', (data) => {
    user.balance = data.balance;
    document.getElementById('balance').innerText = data.balance.toLocaleString();
    myBet = { id: data.betId };
    document.getElementById('placeBetBtn').disabled = true;
    document.getElementById('cashoutBtn').disabled = false;
    showToast('လောင်းကြေးထည့်ပြီးပါပြီ', 'success');
});

socket.on('cashed_out', (data) => {
    user.balance = data.balance;
    document.getElementById('balance').innerText = data.balance.toLocaleString();
    document.getElementById('cashoutBtn').disabled = true;
    document.getElementById('placeBetBtn').disabled = true;
    myBet = null;
    
    showToast(`ငွေထုတ်ပြီးပါပြီ! ${data.winAmount.toFixed(2)} MMK (${data.multiplier.toFixed(2)}x)`, 'success');
    
    // Add to history
    crashHistory.unshift(data.multiplier);
    if (crashHistory.length > 10) crashHistory.pop();
    updateHistoryStrip();
});

socket.on('round_stats', (data) => {
    document.getElementById('roundBets').innerText = data.totalBets.toLocaleString() + ' MMK';
    document.getElementById('playersCount').innerText = data.playersCount;
});

socket.on('error', (msg) => {
    showToast(msg, 'error');
});

// Update history strip
function updateHistoryStrip() {
    const strip = document.getElementById('historyStrip');
    strip.innerHTML = crashHistory.map(point => 
        `<div class="history-item ${point > 2 ? 'crash' : 'cashout'}">${point.toFixed(2)}x</div>`
    ).join('');
}

// =============================================
// FIX 4: Admin functions with better error handling
// =============================================
async function checkAdminStatus() {
    if (!user) return;
    
    try {
        const response = await fetch('/api/admin/stats', {
            headers: { 
                'x-telegram-init-data': initData,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            isAdmin = true;
            document.getElementById('adminPanel').style.display = 'block';
            fetchAdminStats();
            fetchUsers();
            startAdminAutoRefresh();
            console.log('✅ Admin access granted');
        } else {
            console.log('❌ Not an admin:', response.status);
        }
    } catch (err) {
        console.log('Admin check failed:', err);
    }
}

let adminRefreshInterval;
function startAdminAutoRefresh() {
    if (adminRefreshInterval) clearInterval(adminRefreshInterval);
    adminRefreshInterval = setInterval(() => {
        fetchAdminStats();
        fetchUsers();
    }, 30000);
}

async function fetchAdminStats() {
    try {
        const response = await fetch('/api/admin/stats', {
            headers: { 
                'x-telegram-init-data': initData,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const stats = await response.json();
            document.getElementById('totalBets').innerText = stats.totalBets.toLocaleString();
            document.getElementById('totalWon').innerText = stats.totalWon.toLocaleString();
            document.getElementById('profit').innerText = stats.profit.toLocaleString();
        }
    } catch (err) {
        console.error('Failed to fetch admin stats');
    }
}

async function fetchUsers() {
    try {
        const response = await fetch('/api/admin/users', {
            headers: { 
                'x-telegram-init-data': initData,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            displayUsers(data.users);
        }
    } catch (err) {
        console.error('Failed to fetch users');
    }
}

function displayUsers(users) {
    const usersList = document.getElementById('usersList');
    if (!usersList) return;
    
    usersList.innerHTML = users.map(user => `
        <div class="user-item">
            <div class="user-info">
                <span class="user-name">${user.username || 'Anonymous'}</span>
                <span class="user-balance">${user.coins.toLocaleString()} MMK</span>
            </div>
            <div class="user-actions">
                <button class="user-action-btn edit" onclick="editUser('${user.userId}')">✏️</button>
                <button class="user-action-btn ban" onclick="toggleBanUser('${user.userId}')">${user.banned ? '✅' : '🚫'}</button>
            </div>
        </div>
    `).join('');
}

// =============================================
// FIX 5: Force Crash function for admin
// =============================================
async function forceCrash() {
    try {
        const response = await fetch('/api/admin/force-crash', {
            method: 'POST',
            headers: { 
                'x-telegram-init-data': initData,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            showToast('✅ ဂိမ်းကိုရပ်လိုက်ပါပြီ', 'success');
        } else {
            showToast('❌ ဂိမ်းရပ်ရန်မအောင်မြင်ပါ', 'error');
        }
    } catch (err) {
        showToast('❌ Force crash failed', 'error');
    }
}

// Global functions for buttons
window.placeBet = function() {
    const amount = document.getElementById('betAmount').value;
    if (!amount || amount <= 0) {
        showToast('လောင်းကြေးပမာဏထည့်ပါ', 'error');
        return;
    }
    socket.emit('place_bet', { amount: parseFloat(amount) });
};

window.cashOut = function() {
    socket.emit('cash_out');
};

window.refreshAdmin = function() {
    fetchAdminStats();
    fetchUsers();
    showToast('ဒေတာများကိုပြန်လည်စစ်ဆေးနေပါသည်', 'info');
};

window.forceCrash = forceCrash;

window.exportData = async function() {
    try {
        const response = await fetch('/api/admin/users', {
            headers: { 
                'x-telegram-init-data': initData,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `crash-game-data-${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            showToast('ဒေတာထုတ်ယူပြီးပါပြီ', 'success');
        }
    } catch (err) {
        showToast('ဒေတာထုတ်ယူရာတွင်အဆင်မပြေပါ', 'error');
    }
};

window.editUser = function(userId) {
    const newBalance = prompt('လက်ကျန်ငွေအသစ်ထည့်ပါ:');
    if (newBalance && !isNaN(newBalance)) {
        fetch('/api/admin/user/' + userId, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-telegram-init-data': initData
            },
            body: JSON.stringify({ balance: parseFloat(newBalance) })
        }).then(response => {
            if (response.ok) {
                fetchUsers();
                showToast('ငွေပမာဏပြောင်းလဲပြီးပါပြီ', 'success');
            }
        });
    }
};

window.toggleBanUser = function(userId) {
    fetch('/api/admin/user/' + userId + '/toggle-ban', {
        method: 'POST',
        headers: { 
            'x-telegram-init-data': initData,
            'Content-Type': 'application/json'
        }
    }).then(response => {
        if (response.ok) {
            fetchUsers();
            showToast('အသုံးပြုခွင့်ပြောင်းလဲပြီးပါပြီ', 'success');
        }
    });
};

// Quick amount buttons
document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('betAmount').value = btn.dataset.amount;
    });
});

// Bet buttons
document.getElementById('placeBetBtn').addEventListener('click', window.placeBet);
document.getElementById('cashoutBtn').addEventListener('click', window.cashOut);
