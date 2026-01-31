const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const FILE = path.join(DATA_DIR, 'purchase-counter.json');
const MAX = 50;

class PurchaseCounter {
    async initialize() {
        try {
            // Ensure data directory exists first
            await fs.mkdir(DATA_DIR, { recursive: true });
            
            try {
                await fs.access(FILE);
            } catch {
                await fs.writeFile(FILE, JSON.stringify({
                    count: 0,
                    purchases: [],
                    soldOutAt: null
                }, null, 2));
            }
        } catch (err) {
            console.error('PurchaseCounter init error (non-fatal):', err.message);
        }
    }
    
    async getCount() {
        const data = await fs.readFile(FILE, 'utf8');
        return JSON.parse(data);
    }
    
    async isSoldOut() {
        const { count } = await this.getCount();
        return count >= MAX;
    }
    
    async getRemainingSlots() {
        const { count } = await this.getCount();
        return Math.max(0, MAX - count);
    }
    
    async incrementCounter(email, saleId) {
        const data = await this.getCount();
        
        if (data.count >= MAX) {
            throw new Error('SOLD_OUT');
        }
        
        data.count++;
        data.purchases.push({
            email,
            saleId,
            timestamp: new Date().toISOString(),
            position: data.count
        });
        
        if (data.count === MAX) {
            data.soldOutAt = new Date().toISOString();
        }
        
        await fs.writeFile(FILE, JSON.stringify(data, null, 2));
        
        return data.count;
    }
}

module.exports = new PurchaseCounter();
