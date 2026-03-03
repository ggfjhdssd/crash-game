const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    userId: { 
        type: String, 
        required: true, 
        unique: true,
        index: true 
    },
    username: { 
        type: String,
        default: 'Anonymous'
    },
    firstName: String,
    coins: { 
        type: Number, 
        default: 1000,
        min: 0 
    },
    totalBets: { 
        type: Number, 
        default: 0 
    },
    totalWins: { 
        type: Number, 
        default: 0 
    },
    totalWagered: { 
        type: Number, 
        default: 0 
    },
    banned: { 
        type: Boolean, 
        default: false 
    },
    lastSeen: { 
        type: Date, 
        default: Date.now 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
}, { strict: true }); // ဒါအရေးကြီးတယ်

// Virtual for win rate
UserSchema.virtual('winRate').get(function() {
    if (this.totalBets === 0) return 0;
    return (this.totalWins / this.totalBets * 100).toFixed(2);
});

module.exports = mongoose.model('User', UserSchema);
