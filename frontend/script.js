const tg = window.Telegram.WebApp;
tg.expand();

const socket = io(); // connect to same origin

let user = null;
let gameActive = false;
let currentMultiplier = 1.00;
let roundId = null;
let myBet = null;
let isAdmin = false;

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let canvasWidth, canvasHeight;

function resizeCanvas() {
    canvasWidth = canvas.clientWidth;
    canvasHeight = canvas.clientHeight;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Stars background
function drawStars() {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 100; i++) {
        const x = Math.random() * canvasWidth;
        const y = Math.random() * canvasHeight;
        const radius = Math.random() * 2;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(255,255,255,${Math.random()*0.8+0.2})`;
        ctx.fill();
    }
}

// Plane animation variables
let planeX = 100;
let planeY = canvasHeight - 50;
let wobble = 0;

function drawPlane(multiplier) {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    drawStars();

    ctx.beginPath();
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.moveTo(0, canvasHeight);
    for (let x = 0; x <= canvasWidth; x += 10) {
        let t = x / canvasWidth;
        let y = canvasHeight - (t * multiplier * 50);
        if (y < 0) y = 0;
        ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const planeAngle = Math.sin(Date.now() * 0.01) * 0.1;
    wobble = Math.sin(Date.now() * 0.02) * 5;

    let targetY = canvasHeight - (multiplier - 1) * 80;
    if (targetY < 20) targetY = 20;

    planeY += (targetY - planeY) * 0.05;
    planeX = 80 + wobble;

    ctx.save();
    ctx.translate(planeX, planeY);
    ctx.rotate(planeAngle);
    ctx.fillStyle = '#f2f2f2';
    ctx.shadowColor = 'cyan';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(30, -5);
    ctx.lineTo(30, 5);
    ctx.lineTo(0, 10);
    ctx.closePath();
    ctx.fillStyle = '#e0e0e0';
    ctx.fill();
    ctx.fillStyle = '#ff3333';
    ctx.beginPath();
    ctx.arc(25, 0, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();

    requestAnimationFrame(() => drawPlane(currentMultiplier));
}

drawPlane(1.00);

// Telegram auth
const initData = tg.initData;
if (initData) {
    socket.emit('authenticate', initData);
} else {
    alert('Telegram initData not found');
}

// Admin panel functions
async function checkAdminStatus() {
    if (!user) return;
    
    try {
        const response = await fetch('/api/admin/stats', {
            headers: {
                'x-telegram-init-data': initData
            }
        });
        
        if (response.ok) {
            isAdmin = true;
            document.getElementById('adminPanel').style.display = 'block';
            fetchAdminStats();
            startAdminAutoRefresh();
        }
    } catch (err) {
        console.log('Not an admin');
    }
}

let adminRefreshInterval;

function startAdminAutoRefresh() {
    if (adminRefreshInterval) clearInterval(adminRefreshInterval);
    adminRefreshInterval = setInterval(fetchAdminStats, 30000);
}

async function fetchAdminStats() {
    try {
        const response = await fetch('/api/admin/stats', {
            headers: {
                'x-telegram-init-data': initData
            }
        });
        
        if (response.ok) {
            const stats = await response.json();
            
            document.getElementById('totalBets').innerText = stats.totalBets.toLocaleString();
            document.getElementById('totalWon').innerText = stats.totalWon.toLocaleString();
            document.getElementById('profit').innerText = stats.profit.toLocaleString();
            document.getElementById('todayProfit').innerText = stats.todayProfit.toLocaleString();
            
            const timeStr = new Date(stats.lastUpdated).toLocaleString('my-MM', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
                timeZone: 'Asia/Yangon'
            });
            document.getElementById('lastUpdate').innerText = timeStr;
        }
    } catch (err) {
        console.error('Failed to fetch admin stats:', err);
    }
}

// Socket event handlers
socket.on('authenticated', (data) => {
    user = data;
    document.getElementById('balance').innerText = data.balance;
    document.getElementById('username').innerText = data.username;
    
    checkAdminStatus();
});

socket.on('game_state', (state) => {
    gameActive = state.gameActive;
    currentMultiplier = state.currentMultiplier;
    roundId = state.roundId;
    document.getElementById('multiplier').innerText = currentMultiplier.toFixed(2) + 'x';
});

socket.on('multiplier_update', (data) => {
    if (data.roundId === roundId) {
        currentMultiplier = data.multiplier;
        document.getElementById('multiplier').innerText = data.multiplier.toFixed(2) + 'x';
    }
});

socket.on('game_crashed', (data) => {
    gameActive = false;
    document.getElementById('multiplier').innerHTML = '💥 ' + data.crashPoint.toFixed(2) + 'x';
    document.getElementById('cashoutBtn').disabled = true;
    document.getElementById('placeBetBtn').disabled = false;
    myBet = null;
});

socket.on('game_started', (data) => {
    roundId = data.roundId;
    gameActive = true;
    document.getElementById('placeBetBtn').disabled = false;
    document.getElementById('cashoutBtn').disabled = true;
});

socket.on('bet_placed', (data) => {
    user.balance = data.balance;
    document.getElementById('balance').innerText = data.balance;
    myBet = { id: data.betId };
    document.getElementById('placeBetBtn').disabled = true;
    document.getElementById('cashoutBtn').disabled = false;
});

socket.on('cashed_out', (data) => {
    user.balance = data.balance;
    document.getElementById('balance').innerText = data.balance;
    document.getElementById('cashoutBtn').disabled = true;
    document.getElementById('placeBetBtn').disabled = false;
    myBet = null;
    alert(`✅ ငွေထုတ်ပြီးပါပြီ! ${data.winAmount.toFixed(2)} MMK (${data.multiplier.toFixed(2)}x)`);
});

socket.on('error', (msg) => {
    alert('❌ ' + msg);
});

// UI Buttons
document.getElementById('placeBetBtn').addEventListener('click', () => {
    const amount = document.getElementById('betAmount').value;
    if (!amount || amount <= 0) return alert('လောင်းကြေးထည့်ပါ');
    socket.emit('place_bet', { amount: parseFloat(amount) });
});

document.getElementById('cashoutBtn').addEventListener('click', () => {
    socket.emit('cash_out');
});

// Refresh function
function refreshAdmin() {
    fetchAdminStats();
}

// Export data function
async function exportData() {
    try {
        const response = await fetch('/api/admin/users', {
            headers: {
                'x-telegram-init-data': initData
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `admin-data-${new Date().toISOString().slice(0,10)}.json`;
            a.click();
        }
    } catch (err) {
        alert('ဒေတာထုတ်ရာတွင်အဆင်မပြေပါ');
    }
}
