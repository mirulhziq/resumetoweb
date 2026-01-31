const express = require('express');
const router = express.Router();
const counter = require('../services/purchase-counter');

router.get('/remaining', async (req, res) => {
    try {
        const remaining = await counter.getRemainingSlots();
        const soldOut = remaining === 0;
        
        res.json({
            remaining,
            soldOut,
            total: 50
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get status' });
    }
});

module.exports = router;
