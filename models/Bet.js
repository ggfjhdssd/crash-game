const mongoose = require('mongoose');

const BetSchema = new mongoose.Schema({
    userId: { 
        type: String, 
        required: true,
        index: true 
    },
    username: String,
    amount: { 
        type: Number, 
        required: true 
    },
    cashoutMultiplier: { 
        type: Number 
    },
    profit: { 
        type: Number, 
        default: 0 
    },
    crashPoint: { 
        type: Number 
    },
    roundId: { 
        type: String, 
        required: true,
        index: true 
    },
    status: { 
        type: String, 
        enum: ['active', 'cashed_out', 'lost'],
        default: 'active',
        index: true 
    },
    createdAt: { 
        type: Date, 
        default: Date.now,
        index: true 
    }
});

// Compound index for queries
BetSchema.index({ roundId: 1, status: 1 });
BetSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Bet', BetSchema);
