/**
 * Watch Together Server Entry Point
 * Express HTTP + Socket.IO WebSocket Server
 */

const http = require('node:http');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const apiRouter = require('./routes/api');
const { setupSocketHandlers } = require('./socketHandlers');
const db = require('./db');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS and low-latency transport settings
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 10000,
  pingTimeout: 5000,
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets from public directory
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// API Routes
app.use('/api', apiRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

// SPA catch-all route (support direct room links like /room/:code)
app.use((req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Setup Real-time WebSockets
setupSocketHandlers(io);

// Initialize DB schema on launch
try {
  db.getDb();
  console.log('[Database] SQLite DatabaseSync initialized successfully.');
} catch (err) {
  console.error('[Database] Error initializing database:', err);
}

// Server configuration
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🎬 Watch Together Server is live!`);
  console.log(`🌐 Local URL:   http://localhost:${PORT}`);
  console.log(`📡 WebSocket:   Ready for room synchronization`);
  console.log(`📱 PWA:         Enabled (Service Worker & Manifest ready)`);
  console.log('====================================================');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down gracefully...');
  server.close(() => {
    console.log('[Server] Closed all connections.');
    process.exit(0);
  });
});
