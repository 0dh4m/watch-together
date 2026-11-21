/**
 * REST API Endpoints for Watch Together
 */

const express = require('express');
const router = express.Router();
const roomManager = require('../rooms');
const db = require('../db');

// List active public rooms
router.get('/rooms', (req, res) => {
  try {
    const rooms = roomManager.getPublicRoomsSummary();
    res.json({ success: true, rooms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Check room existence and privacy status
router.get('/rooms/:code', (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    let room = roomManager.getRoom(code);

    if (!room) {
      // Check database if it was saved
      const savedRoom = db.getRoom(code);
      if (savedRoom) {
        // Rehydrate in-memory room from DB
        room = roomManager.createRoom({
          title: savedRoom.title,
          isPrivate: savedRoom.isPrivate,
          controlMode: savedRoom.controlMode,
          autoPauseOnBuffer: savedRoom.autoPauseOnBuffer
        });
        room.code = savedRoom.code;
        room.passwordHash = savedRoom.passwordHash;
        roomManager.rooms.set(savedRoom.code, room);
      }
    }

    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found' });
    }

    res.json({
      success: true,
      room: {
        code: room.code,
        title: room.title,
        isPrivate: room.isPrivate,
        controlMode: room.controlMode,
        memberCount: room.members.size,
        currentVideoTitle: room.video?.title || null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create a new room via HTTP
router.post('/rooms/create', (req, res) => {
  try {
    const { title, isPrivate, password, controlMode, autoPauseOnBuffer, initialVideo, userId } = req.body;
    const room = roomManager.createRoom({
      title,
      isPrivate,
      password,
      controlMode,
      autoPauseOnBuffer,
      initialVideo
    });

    res.json({
      success: true,
      code: room.code,
      room: {
        code: room.code,
        title: room.title,
        isPrivate: room.isPrivate,
        controlMode: room.controlMode
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Verify private room password
router.post('/rooms/verify-password', (req, res) => {
  try {
    const { code, password } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Room code required' });
    }
    const isValid = roomManager.verifyPassword(code, password);
    res.json({ success: isValid, valid: isValid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get user profile
router.get('/profile/:userId', (req, res) => {
  try {
    const user = db.getUser(req.params.userId);
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save or update user profile
router.post('/profile', (req, res) => {
  try {
    const { userId, nickname, avatar } = req.body;
    if (!userId || !nickname) {
      return res.status(400).json({ success: false, message: 'userId and nickname are required' });
    }
    const user = db.upsertUser(userId, nickname.trim(), avatar || 'neon-cat');
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get watch history for user
router.get('/history/:userId', (req, res) => {
  try {
    const history = db.getWatchHistory(req.params.userId, 30);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
