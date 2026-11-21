/**
 * Database layer using Node.js native SQLite (DatabaseSync)
 * Provides persistent storage for user profiles, rooms, watch history, and chat messages.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'watch_together.db');
let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
    initTables(dbInstance);
  }
  return dbInstance;
}

function initTables(db) {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      avatar TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    );
  `);

  // Rooms table
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      host_id TEXT,
      is_private INTEGER DEFAULT 0,
      password_hash TEXT,
      control_mode TEXT DEFAULT 'collaborative',
      auto_pause_on_buffer INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      last_active INTEGER NOT NULL,
      settings_json TEXT
    );
  `);

  // Watch history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS watch_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      room_code TEXT,
      video_type TEXT,
      video_url TEXT,
      video_title TEXT,
      video_duration REAL DEFAULT 0,
      watched_at INTEGER NOT NULL
    );
  `);

  // Chat messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL,
      user_id TEXT,
      nickname TEXT NOT NULL,
      avatar TEXT NOT NULL,
      text TEXT NOT NULL,
      reply_to TEXT,
      is_system INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);

  // Indexes for fast lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_watch_history_user ON watch_history(user_id, watched_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room_code, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_rooms_last_active ON rooms(last_active DESC);
  `);
}

// User operations
function getUser(userId) {
  const db = getDb();
  const stmt = db.prepare('SELECT id, nickname, avatar, created_at, last_seen FROM users WHERE id = ?');
  return stmt.get(userId) || null;
}

function upsertUser(userId, nickname, avatar) {
  const db = getDb();
  const now = Date.now();
  const existing = getUser(userId);
  if (existing) {
    const stmt = db.prepare('UPDATE users SET nickname = ?, avatar = ?, last_seen = ? WHERE id = ?');
    stmt.run(nickname, avatar, now, userId);
  } else {
    const stmt = db.prepare('INSERT INTO users (id, nickname, avatar, created_at, last_seen) VALUES (?, ?, ?, ?, ?)');
    stmt.run(userId, nickname, avatar, now, now);
  }
  return { id: userId, nickname, avatar, last_seen: now };
}

// Room operations
function saveRoom(room) {
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO rooms (code, title, host_id, is_private, password_hash, control_mode, auto_pause_on_buffer, created_at, last_active, settings_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      title = excluded.title,
      host_id = excluded.host_id,
      is_private = excluded.is_private,
      password_hash = excluded.password_hash,
      control_mode = excluded.control_mode,
      auto_pause_on_buffer = excluded.auto_pause_on_buffer,
      last_active = excluded.last_active,
      settings_json = excluded.settings_json
  `);
  stmt.run(
    room.code,
    room.title || `Room ${room.code}`,
    room.hostId || null,
    room.isPrivate ? 1 : 0,
    room.passwordHash || null,
    room.controlMode || 'collaborative',
    room.autoPauseOnBuffer ? 1 : 0,
    room.createdAt || now,
    now,
    JSON.stringify(room.settings || {})
  );
}

function getRoom(code) {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM rooms WHERE code = ?');
  const row = stmt.get(code);
  if (!row) return null;
  return {
    code: row.code,
    title: row.title,
    hostId: row.host_id,
    isPrivate: Boolean(row.is_private),
    passwordHash: row.password_hash,
    controlMode: row.control_mode,
    autoPauseOnBuffer: Boolean(row.auto_pause_on_buffer),
    createdAt: row.created_at,
    lastActive: row.last_active,
    settings: row.settings_json ? JSON.parse(row.settings_json) : {}
  };
}

function updateRoomActivity(code) {
  const db = getDb();
  const stmt = db.prepare('UPDATE rooms SET last_active = ? WHERE code = ?');
  stmt.run(Date.now(), code);
}

function getPublicRooms(limit = 20) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT code, title, host_id, is_private, control_mode, created_at, last_active
    FROM rooms
    WHERE is_private = 0
    ORDER BY last_active DESC
    LIMIT ?
  `);
  return stmt.all(limit).map(r => ({
    code: r.code,
    title: r.title,
    hostId: r.host_id,
    isPrivate: false,
    controlMode: r.control_mode,
    createdAt: r.created_at,
    lastActive: r.last_active
  }));
}

// Watch history operations
function addWatchHistory(userId, roomCode, video) {
  if (!video || !video.url) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO watch_history (user_id, room_code, video_type, video_url, video_title, video_duration, watched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    userId || null,
    roomCode,
    video.type || 'direct',
    video.url,
    video.title || 'Untitled Video',
    video.duration || 0,
    Date.now()
  );
}

function getWatchHistory(userId, limit = 20) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, room_code, video_type, video_url, video_title, video_duration, watched_at
    FROM watch_history
    WHERE user_id = ?
    ORDER BY watched_at DESC
    LIMIT ?
  `);
  return stmt.all(userId, limit);
}

// Chat operations
function saveChatMessage(roomCode, msg) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO chat_messages (room_code, user_id, nickname, avatar, text, reply_to, is_system, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const replyTo = msg.replyTo ? JSON.stringify(msg.replyTo) : null;
  const result = stmt.run(
    roomCode,
    msg.userId || null,
    msg.nickname,
    msg.avatar,
    msg.text,
    replyTo,
    msg.isSystem ? 1 : 0,
    msg.createdAt || Date.now()
  );
  return result.lastInsertRowid;
}

function getRecentChatMessages(roomCode, limit = 50) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, room_code, user_id, nickname, avatar, text, reply_to, is_system, created_at
    FROM chat_messages
    WHERE room_code = ?
    ORDER BY created_at ASC
    LIMIT ?
  `);
  return stmt.all(roomCode, limit).map(m => ({
    id: m.id,
    roomCode: m.room_code,
    userId: m.user_id,
    nickname: m.nickname,
    avatar: m.avatar,
    text: m.text,
    replyTo: m.reply_to ? JSON.parse(m.reply_to) : null,
    isSystem: Boolean(m.is_system),
    createdAt: m.created_at
  }));
}

module.exports = {
  getDb,
  getUser,
  upsertUser,
  saveRoom,
  getRoom,
  updateRoomActivity,
  getPublicRooms,
  addWatchHistory,
  getWatchHistory,
  saveChatMessage,
  getRecentChatMessages
};
