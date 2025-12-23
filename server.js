const express = require('express');
const app = express();
app.use(express.json());

// HARDCODED SECRET - Ganti ini dengan secret Anda
const SECRET = process.env.SECRET_KEY || '231204';  // ← Hardcoded fallback
const sessions = new Map();

// CORS + Logging
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    console.log(`📥 ${req.method} ${req.path} from ${req.ip}`);
    next();
});

// Health check
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok',
        uptime: process.uptime(),
        sessions: sessions.size,
        timestamp: new Date().toISOString(),
        secretSet: SECRET === '231204' ? 'YES' : 'NO'
    });
});

app.get('/healthz', (req, res) => {
    res.json({ status: 'ok' });
});

// Register new session
app.post('/register', (req, res) => {
    const secret = req.headers['x-game-secret'];
    
    console.log(`🔑 Auth attempt - Received: ${secret}, Expected: ${SECRET}`);
    
    if (!secret || secret !== SECRET) {
        console.warn('⚠️ Invalid secret!');
        return res.status(401).json({ 
            error: 'Unauthorized',
            receivedSecret: secret ? 'present but incorrect' : 'missing'
        });
    }
    
    const { token, userId, username } = req.body;
    
    if (!token || !userId) {
        return res.status(400).json({ error: 'Missing parameters' });
    }
    
    sessions.set(token, {
        userId,
        username,
        createdAt: Date.now(),
        lastSeen: Date.now()
    });
    
    console.log(`✅ Session registered: ${username} (${userId})`);
    
    res.json({ success: true });
});

// Validate session
app.post('/validate', (req, res) => {
    const secret = req.headers['x-game-secret'];
    
    if (!secret || secret !== SECRET) {
        console.warn('⚠️ Validation failed: Invalid secret');
        return res.json({ valid: false, reason: 'Unauthorized' });
    }
    
    const { token, userId } = req.body;
    
    if (!token || !userId) {
        return res.json({ valid: false, reason: 'Missing parameters' });
    }
    
    const session = sessions.get(token);
    
    if (!session) {
        console.warn(`⚠️ Session not found: ${token.substring(0, 8)}... (User: ${userId})`);
        return res.json({ valid: false, reason: 'Session not found' });
    }
    
    if (session.userId !== userId) {
        console.warn(`🚨 Session mismatch! Token userId: ${session.userId}, Request userId: ${userId}`);
        return res.json({ valid: false, reason: 'Invalid session' });
    }
    
    // Update last seen
    session.lastSeen = Date.now();
    
    console.log(`✓ Validated: ${session.username}`);
    
    res.json({ valid: true });
});

// End session
app.post('/end', (req, res) => {
    const { token } = req.body;
    
    if (sessions.has(token)) {
        const session = sessions.get(token);
        console.log(`👋 Session ended: ${session.username}`);
        sessions.delete(token);
    }
    
    res.json({ success: true });
});

// Cleanup old sessions (every minute)
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [token, session] of sessions.entries()) {
        // Remove sessions older than 10 minutes
        if (now - session.lastSeen > 600000) {
            sessions.delete(token);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Cleaned ${cleaned} expired sessions`);
    }
}, 60000);

// Start server
const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════╗
║  🚀 Validation Server Started             ║
║  Port: ${PORT}                            ║
║  Secret: ${SECRET}                        ║
║  Status: Ready                            ║
╚═══════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('👋 Shutting down gracefully...');
    process.exit(0);
});
