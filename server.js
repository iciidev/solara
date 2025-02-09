const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;
const path = require('path');
const fs = require('fs');

// Store timeouts
let timeouts = new Map();
const TIMEOUT_DURATION = 30 * 60 * 1000; // 30 minutes
let currentOrder = null;

// Load timeouts from file
const TIMEOUTS_FILE = path.join(__dirname, 'timeouts.json');
try {
    if (fs.existsSync(TIMEOUTS_FILE)) {
        const data = JSON.parse(fs.readFileSync(TIMEOUTS_FILE));
        for (const [username, timestamp] of Object.entries(data)) {
            timeouts.set(username, Number(timestamp));
        }
        console.log('Loaded timeouts:', timeouts);
    }
} catch (error) {
    console.error('Error loading timeouts:', error);
}

// Save timeouts to file
function saveTimeouts() {
    try {
        const data = Object.fromEntries(timeouts);
        fs.writeFileSync(TIMEOUTS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving timeouts:', error);
    }
}

// Check if user has timeout
function checkTimeout(username) {
    const timeout = timeouts.get(username);
    if (!timeout) return false;

    const timeLeft = timeout + TIMEOUT_DURATION - Date.now();
    if (timeLeft <= 0) {
        timeouts.delete(username);
        saveTimeouts();
        return false;
    }

    return timeLeft;
}

// Set timeout for user
function setTimeout(username) {
    timeouts.set(username, Date.now());
    saveTimeouts();
}

app.use(express.json());

// Serve static files from public directory
app.use(express.static('public'));

// Debug logging middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`, req.body);
    next();
});

// Function to get Minecraft skin URL
async function getSkinUrl(username) {
    try {
        return `https://www.mc-heads.net/head/${username}`;
    } catch (error) {
        console.error('Error fetching skin URL:', error);
        return null;
    }
}

// Admin endpoint to reset timeout for a user
app.delete('/api/admin/reset/:username', (req, res) => {
    const { username } = req.params;
    console.log('Resetting timeout for:', username);
    if (timeouts.has(username)) {
        timeouts.delete(username);
        saveTimeouts();
        console.log('Timeout deleted');
    }
    res.json({ success: true, message: `Reset timeout for ${username}` });
});

// Admin endpoint to edit timeout duration
app.post('/api/admin/edit/:username', (req, res) => {
    const { username } = req.params;
    const { minutes } = req.body;
    
    console.log('Editing timeout:', { username, minutes });
    
    if (!minutes || isNaN(minutes)) {
        console.log('Invalid minutes value:', minutes);
        return res.status(400).json({ success: false, message: 'Invalid minutes value' });
    }

    const now = new Date().getTime();
    timeouts.set(username, now);
    saveTimeouts();
    
    console.log(`Set ${username}'s timeout to ${minutes} minutes`);
    res.json({ success: true, message: `Updated timeout for ${username} to ${minutes} minutes` });
});

// API endpoint to add a timeout
app.post('/api/timeout', (req, res) => {
    const { username } = req.body;
    setTimeout(username);
    res.json({ success: true });
});

// API endpoint to check timeout
app.get('/api/timeout/:username', (req, res) => {
    const { username } = req.params;
    const timeLeft = checkTimeout(username);
    if (!timeLeft) {
        res.json({ 
            hasTimeout: false,
            canUse: true
        });
        return;
    }

    const minutesLeft = Math.ceil(timeLeft / 60000);
    res.json({ 
        hasTimeout: true,
        canUse: false,
        timeLeft,
        minutesLeft,
        message: `Please wait ${minutesLeft} minutes before requesting another kit.`
    });
});

// API endpoint to get all timeouts
app.get('/api/timeouts', async (req, res) => {
    const now = Date.now();
    const timeoutData = {};
    // Clean up expired timeouts
    for (const [username, timestamp] of timeouts) {
        if (timestamp + TIMEOUT_DURATION <= now) {
            timeouts.delete(username);
            saveTimeouts();
            continue;
        }

        // Only include active timeouts
        const endTime = timestamp + TIMEOUT_DURATION;
        timeoutData[username] = {
            username,
            startTime: timestamp,
            endTime: endTime,
            skinUrl: `https://mc-heads.net/avatar/${username}`
        };
    }
    res.json(timeoutData);
});

// Current order endpoints
app.get('/api/current-order', (req, res) => {
    console.log('Getting current order:', currentOrder);
    res.json(currentOrder); // Just send the order object directly
});

app.post('/api/current-order', (req, res) => {
    const { username, orderType } = req.body;
    if (currentOrder) {
        res.status(400).json({ 
            success: false, 
            error: 'There is already an active order' 
        });
        return;
    }
    currentOrder = {
        username,
        orderType,
        timestamp: Date.now()
    };
    res.json({ success: true, currentOrder });
});

app.delete('/api/current-order', (req, res) => {
    currentOrder = null;
    res.json({ success: true });
});

app.post('/api/timeout/:username/set', (req, res) => {
    const { username } = req.params;
    setTimeout(username);
    res.json({ success: true });
});

// Admin endpoint to kill bot
app.post('/api/admin/kill-bot', async (req, res) => {
    try {
        const result = await bot.handleKillCommand();
        if (result.success) {
            res.json({ success: true });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('Error killing bot:', error);
        res.status(500).json({ success: false, error: 'Failed to kill bot' });
    }
});

// API endpoint to clear all timeouts
app.delete('/api/admin/reset-all', (req, res) => {
    timeouts.clear();
    saveTimeouts();
    console.log('All timeouts cleared');
    res.json({ success: true, message: 'All timeouts cleared' });
});

const COORDINATES_FILE = path.join(__dirname, 'coordinates.json');

// Load coordinates from file
let coordinates = { deaths: [], teleports: [] };
try {
    if (fs.existsSync(COORDINATES_FILE)) {
        coordinates = JSON.parse(fs.readFileSync(COORDINATES_FILE));
    }
} catch (error) {
    console.error('Error loading coordinates:', error);
}

// Save coordinates to file
function saveCoordinates() {
    try {
        fs.writeFileSync(COORDINATES_FILE, JSON.stringify(coordinates, null, 2));
    } catch (error) {
        console.error('Error saving coordinates:', error);
    }
}

// API endpoint to get coordinates
app.get('/api/coordinates', (req, res) => {
    res.json(coordinates);
});

// API endpoint to add coordinates
app.post('/api/coordinates', (req, res) => {
    const { type, x, y, z, username, timestamp } = req.body;
    
    if (type !== 'death' && type !== 'teleport') {
        return res.status(400).json({ error: 'Invalid coordinate type' });
    }
    
    const newCoordinate = {
        x: Number(x),
        y: Number(y),
        z: Number(z),
        username,
        timestamp: timestamp || Date.now()
    };
    
    if (type === 'death') {
        coordinates.deaths.push(newCoordinate);
    } else {
        coordinates.teleports.push(newCoordinate);
    }
    
    saveCoordinates();
    res.json({ success: true });
});

// API endpoint to clear coordinates
app.delete('/api/coordinates/:type', (req, res) => {
    const { type } = req.params;
    if (type === 'all') {
        coordinates.deaths = [];
        coordinates.teleports = [];
    } else if (type === 'deaths') {
        coordinates.deaths = [];
    } else if (type === 'teleports') {
        coordinates.teleports = [];
    } else {
        return res.status(400).json({ error: 'Invalid type' });
    }
    
    saveCoordinates();
    res.json({ success: true });
});

app.listen(port, () => {
    console.log(`Timeout server running at http://localhost:${port}`);
});
