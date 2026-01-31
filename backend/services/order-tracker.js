const fs = require('fs').promises;
const path = require('path');
const FILE = path.join(__dirname, '../data/orders.json');

// Ensure data directory exists
async function initialize() {
    try {
        await fs.mkdir(path.dirname(FILE), { recursive: true });
        try {
            await fs.access(FILE);
        } catch {
            await fs.writeFile(FILE, JSON.stringify({}));
        }
    } catch (err) {
        console.error('Failed to init order store', err);
    }
}

async function getOrders() {
    try {
        const data = await fs.readFile(FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

async function saveOrders(orders) {
    await fs.writeFile(FILE, JSON.stringify(orders, null, 2));
}

async function updateStatus(saleId, status, details = {}) {
    const orders = await getOrders();
    const existing = orders[saleId] || {};
    const mergedDetails = { ...details };
    if (details.steps && typeof details.steps === 'object') {
        mergedDetails.steps = { ...(existing.steps || {}), ...details.steps };
    }
    if (details.emails && typeof details.emails === 'object') {
        mergedDetails.emails = { ...(existing.emails || {}), ...details.emails };
    }
    if (Array.isArray(details.warnings)) {
        const prev = Array.isArray(existing.warnings) ? existing.warnings : [];
        mergedDetails.warnings = Array.from(new Set([...prev, ...details.warnings]));
    }
    orders[saleId] = {
        ...existing,
        status,
        updatedAt: new Date().toISOString(),
        ...mergedDetails
    };
    await saveOrders(orders);
}

async function getStatus(saleId) {
    const orders = await getOrders();
    return orders[saleId] || { status: 'not_found' };
}

initialize();

module.exports = { updateStatus, getStatus };
