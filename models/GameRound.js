const mongoose = require('mongoose');

const GameRoundSchema = new mongoose.Schema({
    roundId: { 
        type: String, 
        required: true, 
        unique: true 
    },
    crashPoint: { 
        type: Number, 
        required: true 
    },
    startTime: { 
        type: Date, 
        default: Date.now 
    },
    endTime: Date,
    totalBets: { 
        type: Number, 
        default: 0 
    },
    totalAmount: { 
        type: Number, 
        default: 0 
    },
    maxMultiplier: { 
        type: Number 
    }
});

GameRoundSchema.index({ startTime: -1 });

module.exports = mongoose.model('GameRound', GameRoundSchema);
