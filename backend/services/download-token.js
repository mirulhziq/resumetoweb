const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const FILE = path.join(__dirname, '../data/download-links.json');

async function generateToken(email, saleId) {
    return crypto.randomBytes(32).toString('hex');
}

async function saveLink(linkData) {
    let links = [];
    try {
        const data = await fs.readFile(FILE, 'utf8');
        links = JSON.parse(data);
    } catch {}
    
    links.push(linkData);
    await fs.writeFile(FILE, JSON.stringify(links, null, 2));
}

async function getLink(token) {
    try {
        const data = await fs.readFile(FILE, 'utf8');
        const links = JSON.parse(data);
        return links.find(l => l.token === token);
    } catch {
        return null;
    }
}

async function incrementDownloads(token) {
    const data = await fs.readFile(FILE, 'utf8');
    const links = JSON.parse(data);
    const link = links.find(l => l.token === token);
    if (link) {
        link.downloads = (link.downloads || 0) + 1;
        await fs.writeFile(FILE, JSON.stringify(links, null, 2));
    }
}

module.exports = { generateToken, saveLink, getLink, incrementDownloads };
