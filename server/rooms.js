/**
 * Room Management & Real-Time State Controller
 * Manages active rooms, master video clocks, participants, and playlist queues.
 */

const crypto = require('node:crypto');
const db = require('./db');

class RoomManager {
  constructor() {
    /**
     * Map of roomCode => RoomObject
     * @type {Map<string, Object>}
     */
    this.rooms = new Map();
  }

  // Generate 6-character room code (alphanumeric uppercase)
  generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit ambiguous characters (I, O, 0, 1)
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  hashPassword(password) {
    if (!password) return null;
    return crypto.createHash('sha256').update(password.trim()).digest('hex');
  }

  verifyPassword(roomCode, inputPassword) {
    const room = this.rooms.get(roomCode);
    if (!room || !room.isPrivate) return true;
    if (!room.passwordHash) return true;
    if (!inputPassword) return false;
    const inputHash = this.hashPassword(inputPassword);
    return inputHash === room.passwordHash;
  }

  createRoom({ title, hostId, isPrivate = false, password = '', controlMode = 'collaborative', autoPauseOnBuffer = true, initialVideo = null }) {
    let code = this.generateCode();
    while (this.rooms.has(code)) {
      code = this.generateCode();
    }

    const passwordHash = isPrivate && password ? this.hashPassword(password) : null;
    const now = Date.now();

    const room = {
      code,
      title: title && title.trim() ? title.trim() : `Room ${code}`,
      hostId: hostId || null,
      isPrivate: Boolean(isPrivate),
      passwordHash,
      controlMode: controlMode === 'host_only' ? 'host_only' : 'collaborative',
      autoPauseOnBuffer: autoPauseOnBuffer !== false,
      createdAt: now,
      lastActive: now,
      // Video state & Master Clock
      video: {
        type: initialVideo?.type || 'youtube', // 'youtube' | 'direct' | 'hls' | 'local'
        url: initialVideo?.url || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Default classic sample
        title: initialVideo?.title || 'Welcome Video (Rick Astley - Never Gonna Give You Up)',
        duration: initialVideo?.duration || 213,
        currentTime: 0,
        paused: true,
        playbackRate: 1,
        lastUpdated: now
      },
      // Buffer sync state
      bufferingUsers: new Map(), // socketId => { nickname, avatar, since }
      wasAutoPausedForBuffer: false,
      // Playlist queue
      queue: [], // Array of { id, title, url, type, duration, addedBy, addedByName }
      // Active Poll
      activePoll: null, // { id, question, options: [{ text, votes: [] }], createdBy, createdByName, createdAt }
      // Active Screen Share
      screenSharingUser: null, // socketId or null
      // Synced Subtitles
      subtitles: null, // { content, format, label }
      // Members Map: socketId => { id, socketId, nickname, avatar, isHost, ping, isBuffering, isSpeaking, inVoice, joinedAt }
      members: new Map()
    };

    this.rooms.set(code, room);

    // Persist room to DB
    db.saveRoom(room);

    return room;
  }

  getRoom(code) {
    if (!code) return null;
    const cleanCode = code.toUpperCase().trim();
    return this.rooms.get(cleanCode) || null;
  }

  // Calculate the authoritative room timestamp based on master clock
  getMasterClockTime(room) {
    if (!room || !room.video) return 0;
    if (room.video.paused) {
      return Math.max(0, room.video.currentTime || 0);
    }
    const elapsedSeconds = (Date.now() - room.video.lastUpdated) / 1000;
    const calculated = (room.video.currentTime || 0) + elapsedSeconds * (room.video.playbackRate || 1);
    
    // Cap at video duration if known
    if (room.video.duration && room.video.duration > 0 && calculated > room.video.duration) {
      return room.video.duration;
    }
    return Math.max(0, calculated);
  }

  // Update room video play state
  playVideo(code, currentTime, updatedBySocketId) {
    const room = this.getRoom(code);
    if (!room) return null;

    const time = typeof currentTime === 'number' && !isNaN(currentTime) ? Math.max(0, currentTime) : this.getMasterClockTime(room);
    room.video.currentTime = time;
    room.video.paused = false;
    room.video.lastUpdated = Date.now();
    room.lastActive = Date.now();
    room.wasAutoPausedForBuffer = false;

    db.updateRoomActivity(code);
    return {
      currentTime: time,
      paused: false,
      playbackRate: room.video.playbackRate,
      lastUpdated: room.video.lastUpdated,
      actionBy: updatedBySocketId
    };
  }

  // Update room video pause state
  pauseVideo(code, currentTime, updatedBySocketId, isAutoPause = false) {
    const room = this.getRoom(code);
    if (!room) return null;

    const time = typeof currentTime === 'number' && !isNaN(currentTime) ? Math.max(0, currentTime) : this.getMasterClockTime(room);
    room.video.currentTime = time;
    room.video.paused = true;
    room.video.lastUpdated = Date.now();
    room.lastActive = Date.now();
    if (isAutoPause) {
      room.wasAutoPausedForBuffer = true;
    }

    db.updateRoomActivity(code);
    return {
      currentTime: time,
      paused: true,
      playbackRate: room.video.playbackRate,
      lastUpdated: room.video.lastUpdated,
      actionBy: updatedBySocketId,
      isAutoPause
    };
  }

  // Update room video seek position
  seekVideo(code, seekTime, updatedBySocketId) {
    const room = this.getRoom(code);
    if (!room) return null;

    const time = Math.max(0, seekTime || 0);
    room.video.currentTime = time;
    room.video.lastUpdated = Date.now();
    room.lastActive = Date.now();

    db.updateRoomActivity(code);
    return {
      currentTime: time,
      paused: room.video.paused,
      playbackRate: room.video.playbackRate,
      lastUpdated: room.video.lastUpdated,
      actionBy: updatedBySocketId
    };
  }

  // Update playback rate
  setPlaybackRate(code, rate, updatedBySocketId) {
    const room = this.getRoom(code);
    if (!room) return null;

    const clampedRate = Math.min(2.0, Math.max(0.25, parseFloat(rate) || 1));
    const currentClock = this.getMasterClockTime(room);
    room.video.currentTime = currentClock;
    room.video.playbackRate = clampedRate;
    room.video.lastUpdated = Date.now();

    return {
      playbackRate: clampedRate,
      currentTime: currentClock,
      paused: room.video.paused,
      actionBy: updatedBySocketId
    };
  }

  // Change video source
  changeVideo(code, { type, url, title, duration = 0 }, userId, socketId) {
    const room = this.getRoom(code);
    if (!room) return null;

    const now = Date.now();
    room.video = {
      type: type || 'youtube',
      url,
      title: title || 'Shared Video',
      duration: duration || 0,
      currentTime: 0,
      paused: true,
      playbackRate: 1,
      lastUpdated: now
    };
    room.lastActive = now;
    room.bufferingUsers.clear();
    room.wasAutoPausedForBuffer = false;

    // Save to DB watch history
    db.addWatchHistory(userId, code, room.video);
    db.updateRoomActivity(code);

    return room.video;
  }

  // Check if participant has permission to control video
  canControl(code, socketId) {
    const room = this.getRoom(code);
    if (!room) return false;
    if (room.controlMode === 'collaborative') return true;
    return room.hostId === socketId;
  }

  // Participant management
  addMember(code, socketId, user) {
    const room = this.getRoom(code);
    if (!room) return null;

    const isFirstMember = room.members.size === 0;
    // If no host exists or this is first member, set as host
    if (isFirstMember || !room.hostId) {
      room.hostId = socketId;
    }

    const member = {
      id: user.id || socketId,
      socketId,
      nickname: user.nickname || `Guest-${socketId.slice(0, 4)}`,
      avatar: user.avatar || 'neon-cat',
      isHost: room.hostId === socketId,
      ping: 0,
      isBuffering: false,
      isSpeaking: false,
      inVoice: false,
      joinedAt: Date.now()
    };

    room.members.set(socketId, member);
    db.upsertUser(member.id, member.nickname, member.avatar);
    room.lastActive = Date.now();

    return member;
  }

  removeMember(code, socketId) {
    const room = this.getRoom(code);
    if (!room) return null;

    const leavingMember = room.members.get(socketId);
    room.members.delete(socketId);
    room.bufferingUsers.delete(socketId);

    let newHost = null;
    // If host left, elect the oldest remaining participant
    if (room.hostId === socketId && room.members.size > 0) {
      const nextHost = Array.from(room.members.values()).sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (nextHost) {
        room.hostId = nextHost.socketId;
        nextHost.isHost = true;
        newHost = nextHost;
      }
    }

    // If room is empty, we keep it in memory for a grace period or DB
    room.lastActive = Date.now();

    return { leavingMember, newHost, remainingCount: room.members.size };
  }

  setMemberPing(code, socketId, ping) {
    const room = this.getRoom(code);
    if (!room) return;
    const member = room.members.get(socketId);
    if (member) {
      member.ping = Math.round(ping);
    }
  }

  setMemberSpeaking(code, socketId, isSpeaking) {
    const room = this.getRoom(code);
    if (!room) return;
    const member = room.members.get(socketId);
    if (member) {
      member.isSpeaking = Boolean(isSpeaking);
    }
  }

  setMemberVoiceState(code, socketId, inVoice) {
    const room = this.getRoom(code);
    if (!room) return;
    const member = room.members.get(socketId);
    if (member) {
      member.inVoice = Boolean(inVoice);
    }
  }

  // Buffer handling
  setMemberBuffering(code, socketId, isBuffering) {
    const room = this.getRoom(code);
    if (!room) return { shouldPause: false, shouldResume: false };

    const member = room.members.get(socketId);
    if (!member) return { shouldPause: false, shouldResume: false };

    member.isBuffering = Boolean(isBuffering);

    let shouldPause = false;
    let shouldResume = false;

    if (isBuffering) {
      room.bufferingUsers.set(socketId, {
        nickname: member.nickname,
        avatar: member.avatar,
        since: Date.now()
      });
      // If room is playing and autoPauseOnBuffer is enabled, pause room
      if (room.autoPauseOnBuffer && !room.video.paused) {
        this.pauseVideo(code, this.getMasterClockTime(room), socketId, true);
        shouldPause = true;
      }
    } else {
      room.bufferingUsers.delete(socketId);
      // If no one is buffering anymore and room was auto-paused, auto-resume!
      if (room.bufferingUsers.size === 0 && room.wasAutoPausedForBuffer) {
        this.playVideo(code, this.getMasterClockTime(room), socketId);
        room.wasAutoPausedForBuffer = false;
        shouldResume = true;
      }
    }

    return {
      shouldPause,
      shouldResume,
      bufferingCount: room.bufferingUsers.size,
      bufferingList: Array.from(room.bufferingUsers.values())
    };
  }

  // Queue Operations
  addToQueue(code, item, user) {
    const room = this.getRoom(code);
    if (!room) return null;

    const queueItem = {
      id: crypto.randomUUID ? crypto.randomUUID() : 'q_' + Math.random().toString(36).substring(2, 9),
      title: item.title || 'Queued Video',
      url: item.url,
      type: item.type || 'youtube',
      duration: item.duration || 0,
      addedBy: user.id,
      addedByName: user.nickname,
      addedAt: Date.now()
    };

    room.queue.push(queueItem);
    return queueItem;
  }

  removeFromQueue(code, itemId) {
    const room = this.getRoom(code);
    if (!room) return null;
    const index = room.queue.findIndex(q => q.id === itemId);
    if (index !== -1) {
      const removed = room.queue.splice(index, 1)[0];
      return removed;
    }
    return null;
  }

  reorderQueue(code, oldIndex, newIndex) {
    const room = this.getRoom(code);
    if (!room) return null;
    if (oldIndex < 0 || oldIndex >= room.queue.length || newIndex < 0 || newIndex >= room.queue.length) {
      return null;
    }
    const [movedItem] = room.queue.splice(oldIndex, 1);
    room.queue.splice(newIndex, 0, movedItem);
    return room.queue;
  }

  playNextInQueue(code) {
    const room = this.getRoom(code);
    if (!room || room.queue.length === 0) return null;

    const nextItem = room.queue.shift();
    this.changeVideo(code, nextItem, nextItem.addedBy, null);
    // Auto-play the next video
    this.playVideo(code, 0, null);
    return nextItem;
  }

  // Public summary for lobby listing
  getPublicRoomsSummary() {
    const list = [];
    for (const room of this.rooms.values()) {
      if (!room.isPrivate) {
        list.push({
          code: room.code,
          title: room.title,
          memberCount: room.members.size,
          currentVideoTitle: room.video?.title || 'No video loaded',
          videoType: room.video?.type || 'youtube',
          controlMode: room.controlMode,
          lastActive: room.lastActive
        });
      }
    }
    // Also include recently active public rooms from SQLite if not currently in memory
    const dbPublic = db.getPublicRooms(10);
    for (const r of dbPublic) {
      if (!this.rooms.has(r.code)) {
        list.push({
          code: r.code,
          title: r.title,
          memberCount: 0,
          currentVideoTitle: 'Saved Room',
          videoType: 'youtube',
          controlMode: r.controlMode,
          lastActive: r.lastActive
        });
      }
    }

    return list.sort((a, b) => b.lastActive - a.lastActive);
  }

  // Poll Operations
  createPoll(code, question, options, user) {
    const room = this.getRoom(code);
    if (!room) return null;

    const formattedOptions = (options || []).map((opt, idx) => ({
      index: idx,
      text: typeof opt === 'string' ? opt.trim() : opt.text,
      voters: [] // userIds
    }));

    room.activePoll = {
      id: 'poll_' + Math.random().toString(36).substring(2, 9),
      question: question.trim(),
      options: formattedOptions,
      createdBy: user.id,
      createdByName: user.nickname,
      createdAt: Date.now(),
      closed: false
    };

    return room.activePoll;
  }

  votePoll(code, pollId, optionIndex, userId) {
    const room = this.getRoom(code);
    if (!room || !room.activePoll || room.activePoll.id !== pollId || room.activePoll.closed) {
      return null;
    }

    // Remove user's previous vote across all options
    room.activePoll.options.forEach(opt => {
      opt.voters = opt.voters.filter(uid => uid !== userId);
    });

    // Add new vote if valid option index
    if (optionIndex >= 0 && optionIndex < room.activePoll.options.length) {
      room.activePoll.options[optionIndex].voters.push(userId);
    }

    return room.activePoll;
  }

  endPoll(code, pollId) {
    const room = this.getRoom(code);
    if (!room || !room.activePoll || room.activePoll.id !== pollId) return null;
    room.activePoll.closed = true;
    return room.activePoll;
  }

  setSubtitles(code, subtitlesData) {
    const room = this.getRoom(code);
    if (!room) return null;
    room.subtitles = subtitlesData;
    return room.subtitles;
  }

  // Export full room state snapshot for a connecting client
  getRoomSnapshot(code) {
    const room = this.getRoom(code);
    if (!room) return null;

    return {
      code: room.code,
      title: room.title,
      hostId: room.hostId,
      isPrivate: room.isPrivate,
      controlMode: room.controlMode,
      autoPauseOnBuffer: room.autoPauseOnBuffer,
      video: {
        ...room.video,
        currentTime: this.getMasterClockTime(room)
      },
      queue: room.queue,
      activePoll: room.activePoll,
      screenSharingUser: room.screenSharingUser,
      subtitles: room.subtitles,
      members: Array.from(room.members.values()),
      bufferingCount: room.bufferingUsers.size,
      bufferingList: Array.from(room.bufferingUsers.values()),
      serverTime: Date.now()
    };
  }
}

module.exports = new RoomManager();
