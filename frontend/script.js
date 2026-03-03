const tg = window.Telegram.WebApp;
tg.expand();

const socket = io(); // connect to same origin

let user = null;
let gameActive = false;
let currentMultiplier = 1.00;
let roundId = null;
let myBet = null;

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

// Stars background (static)
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
    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    drawStars();

    // Draw multiplier path curve
    ctx.beginPath();
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.moveTo(0, canvasHeight);
    for (let x = 0; x <= canvasWidth; x += 10) {
        let t = x / canvasWidth; // 0 to 1
        let y = canvasHeight - (t * multiplier * 50); // climb based on multiplier
        if (y < 0) y = 0;
        ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw plane with wobble
    const planeAngle = Math.sin(Date.now() * 0.01) * 0.1; // slight rotation
    wobble = Math.sin(Date.now() * 0.02) * 5; // side wobble

    let targetY = canvasHeight - (multiplier - 1) * 80;
    if (targetY < 20) targetY = 20;

    // Smooth plane movement
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

// Start animation
drawPlane(1.00);

// Telegram auth
const initData = tg.initData;
if (initData) {
    socket.emit('authenticate', initData);
} else {
    alert('Telegram initData not found');
}

// Socket event handlers
socket.on('authenticated', (data) => {
    user = data;
    document.getElementById('balance').innerText = data.balance;
    document.getElementById('username').innerText = data.username;
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
    document.getElementById('multiplier').innerText = '💥 ' + data.crashPoint.toFixed(2) + 'x';
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
    alert(`ငွေထုတ်ပြီးပါပြီ! ${data.winAmount.toFixed(2)} MMK (${data.multiplier.toFixed(2)}x)`);
});

socket.on('error', (msg) => {
    alert(msg);
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

// Fetch admin stats (if user is admin, you may check by userId)
// For demo, we'll fetch if userId matches admin list (optional)
socket.on('authenticated', (data) => {
    // Example: if user id is admin (hardcoded for demo)
    if (user.userId === '123456789') { // replace with your admin user id
        document.getElementById('adminPanel').style.display = 'block';
        fetchAdminStats();
    }
});

async function fetchAdminStats() {
    const res = await fetch('/api/admin/stats');
    const stats = await res.json();
    document.getElementById('totalBets').innerText = stats.totalBets;
    document.getElementById('totalWon').innerText = stats.totalWon;
    document.getElementById('profit').innerText = stats.profit;
}
