/**
 * Socket.IO Real-Time Event Handlers
 * Handles real-time video synchronization, drift correction, WebRTC voice signaling,
 * floating screen reactions, buffer auto-pausing, and shared playlist queue.
 */

const roomManager = require('./rooms');
const db = require('./db');

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    // Current socket session context
    let currentRoomCode = null;
    let currentUser = null;

    // Helper to get room code
    const getRoom = () => currentRoomCode ? roomManager.getRoom(currentRoomCode) : null;

    // 1. Join Room
    socket.on('join_room', ({ roomCode, user, password }, callback) => {
      if (!roomCode || !user) {
        if (callback) callback({ success: false, message: 'Invalid join parameters' });
        return;
      }

      const code = roomCode.toUpperCase().trim();
      let room = roomManager.getRoom(code);

      // If room not in memory, try rehydrating from SQLite
      if (!room) {
        const savedRoom = db.getRoom(code);
        if (savedRoom) {
          room = roomManager.createRoom({
            title: savedRoom.title,
            isPrivate: savedRoom.isPrivate,
            controlMode: savedRoom.controlMode,
            autoPauseOnBuffer: savedRoom.autoPauseOnBuffer
          });
          room.code = savedRoom.code;
          room.passwordHash = savedRoom.passwordHash;
          roomManager.rooms.set(savedRoom.code, room);
        } else {
          // If room doesn't exist, auto-create it with this user as host
          room = roomManager.createRoom({
            title: `Room ${code}`,
            hostId: socket.id,
            isPrivate: false
          });
          room.code = code;
          roomManager.rooms.set(code, room);
        }
      }

      // Password verification for private rooms
      if (room.isPrivate && room.passwordHash) {
        if (!roomManager.verifyPassword(code, password)) {
          if (callback) callback({ success: false, message: 'Incorrect room password', isPrivate: true });
          return;
        }
      }

      // Leave any prior room
      if (currentRoomCode) {
        socket.leave(`room_${currentRoomCode}`);
        roomManager.removeMember(currentRoomCode, socket.id);
      }

      currentRoomCode = code;
      currentUser = {
        id: user.id || socket.id,
        nickname: user.nickname ? user.nickname.trim().slice(0, 30) : `Guest-${socket.id.slice(0, 4)}`,
        avatar: user.avatar || 'neon-cat'
      };

      // Add socket to room channel
      socket.join(`room_${code}`);

      // Add member to room state
      const member = roomManager.addMember(code, socket.id, currentUser);

      // Fetch recent chat messages from DB
      const chatHistory = db.getRecentChatMessages(code, 40);

      // Save system message: user joined
      const sysMsg = {
        nickname: 'System',
        avatar: 'system',
        text: `${member.nickname} joined the room`,
        isSystem: true,
        createdAt: Date.now()
      };
      db.saveChatMessage(code, sysMsg);

      // Broadcast join event to everyone else in the room
      socket.to(`room_${code}`).emit('user_joined', {
        member,
        systemMessage: sysMsg
      });

      // Send full room snapshot and chat history to the joined user
      const snapshot = roomManager.getRoomSnapshot(code);
      if (callback) {
        callback({
          success: true,
          snapshot,
          chatHistory,
          myMember: member
        });
      }

      // Update room member list across everyone in room
      io.to(`room_${code}`).emit('members_updated', {
        members: Array.from(room.members.values()),
        hostId: room.hostId
      });
    });

    // 2. Heartbeat Ping / Pong for Drift Calculation & Latency Measurement
    socket.on('heartbeat_ping', ({ clientTime }) => {
      const room = getRoom();
      if (!room) return;

      const serverTime = Date.now();
      const masterTime = roomManager.getMasterClockTime(room);

      socket.emit('heartbeat_pong', {
        clientTime,
        serverTime,
        masterTime,
        isPaused: room.video.paused,
        playbackRate: room.video.playbackRate,
        currentVideoUrl: room.video.url
      });
    });

    // Client reports calculated ping
    socket.on('report_ping', ({ ping }) => {
      if (currentRoomCode) {
        roomManager.setMemberPing(currentRoomCode, socket.id, ping);
        // Throttle broadcast of ping update to every few seconds if needed
        socket.to(`room_${currentRoomCode}`).emit('member_ping_updated', {
          socketId: socket.id,
          ping: Math.round(ping)
        });
      }
    });

    // 3. Video Playback Synchronization
    socket.on('sync_play', ({ currentTime }) => {
      const room = getRoom();
      if (!room) return;

      // Check permission
      if (!roomManager.canControl(currentRoomCode, socket.id)) {
        socket.emit('error_notice', { message: 'Only the host can control playback in Host-Only mode.' });
        return;
      }

      const playState = roomManager.playVideo(currentRoomCode, currentTime, socket.id);
      if (playState) {
        // Broadcast to other participants in the room
        socket.to(`room_${currentRoomCode}`).emit('sync_play', {
          currentTime: playState.currentTime,
          serverTime: playState.lastUpdated,
          playbackRate: playState.playbackRate,
          actionBy: socket.id,
          nickname: currentUser?.nickname || 'Someone'
        });
      }
    });

    socket.on('sync_pause', ({ currentTime }) => {
      const room = getRoom();
      if (!room) return;

      if (!roomManager.canControl(currentRoomCode, socket.id)) {
        socket.emit('error_notice', { message: 'Only the host can control playback in Host-Only mode.' });
        return;
      }

      const pauseState = roomManager.pauseVideo(currentRoomCode, currentTime, socket.id);
      if (pauseState) {
        socket.to(`room_${currentRoomCode}`).emit('sync_pause', {
          currentTime: pauseState.currentTime,
          serverTime: pauseState.lastUpdated,
          actionBy: socket.id,
          nickname: currentUser?.nickname || 'Someone'
        });
      }
    });

    socket.on('sync_seek', ({ currentTime }) => {
      const room = getRoom();
      if (!room) return;

      if (!roomManager.canControl(currentRoomCode, socket.id)) {
        socket.emit('error_notice', { message: 'Only the host can seek in Host-Only mode.' });
        return;
      }

      const seekState = roomManager.seekVideo(currentRoomCode, currentTime, socket.id);
      if (seekState) {
        socket.to(`room_${currentRoomCode}`).emit('sync_seek', {
          currentTime: seekState.currentTime,
          serverTime: seekState.lastUpdated,
          paused: seekState.paused,
          actionBy: socket.id,
          nickname: currentUser?.nickname || 'Someone'
        });
      }
    });

    socket.on('sync_rate', ({ playbackRate }) => {
      const room = getRoom();
      if (!room) return;

      if (!roomManager.canControl(currentRoomCode, socket.id)) {
        socket.emit('error_notice', { message: 'Only the host can change speed in Host-Only mode.' });
        return;
      }

      const rateState = roomManager.setPlaybackRate(currentRoomCode, playbackRate, socket.id);
      if (rateState) {
        io.to(`room_${currentRoomCode}`).emit('sync_rate', {
          playbackRate: rateState.playbackRate,
          currentTime: rateState.currentTime,
          actionBy: socket.id,
          nickname: currentUser?.nickname || 'Someone'
        });
      }
    });

    // 4. Change Video Source
    socket.on('change_video', ({ type, url, title, duration }, callback) => {
      const room = getRoom();
      if (!room) return;

      if (!roomManager.canControl(currentRoomCode, socket.id)) {
        socket.emit('error_notice', { message: 'Only the host can change videos in Host-Only mode.' });
        if (callback) callback({ success: false, message: 'Permission denied' });
        return;
      }

      const newVideo = roomManager.changeVideo(currentRoomCode, { type, url, title, duration }, currentUser?.id, socket.id);
      if (newVideo) {
        // Broadcast video change to entire room
        io.to(`room_${currentRoomCode}`).emit('video_changed', {
          video: newVideo,
          changedBy: {
            id: currentUser?.id,
            nickname: currentUser?.nickname,
            socketId: socket.id
          }
        });

        // Add system message to chat
        const sysMsg = {
          nickname: 'System',
          avatar: 'system',
          text: `${currentUser?.nickname || 'Someone'} changed video to "${newVideo.title}"`,
          isSystem: true,
          createdAt: Date.now()
        };
        db.saveChatMessage(currentRoomCode, sysMsg);
        io.to(`room_${currentRoomCode}`).emit('new_message', sysMsg);

        if (callback) callback({ success: true, video: newVideo });
      }
    });

    // 5. Buffer State & Smart Auto-Pause
    socket.on('buffer_state', ({ isBuffering }) => {
      if (!currentRoomCode) return;
      const result = roomManager.setMemberBuffering(currentRoomCode, socket.id, isBuffering);

      // If auto-pause triggered because someone buffered
      if (result.shouldPause) {
        io.to(`room_${currentRoomCode}`).emit('sync_pause', {
          currentTime: roomManager.getMasterClockTime(roomManager.getRoom(currentRoomCode)),
          isAutoPause: true,
          bufferingUser: currentUser?.nickname
        });

        io.to(`room_${currentRoomCode}`).emit('buffer_notice', {
          status: 'buffering',
          message: `${currentUser?.nickname || 'A user'} is buffering. Auto-pausing video...`,
          bufferingList: result.bufferingList
        });
      } else if (result.shouldResume) {
        // All buffering cleared, auto-resume
        io.to(`room_${currentRoomCode}`).emit('sync_play', {
          currentTime: roomManager.getMasterClockTime(roomManager.getRoom(currentRoomCode)),
          isAutoResume: true
        });

        io.to(`room_${currentRoomCode}`).emit('buffer_notice', {
          status: 'ready',
          message: `Buffer caught up. Playback resumed!`,
          bufferingList: []
        });
      } else {
        // Update buffering indicator in member list
        io.to(`room_${currentRoomCode}`).emit('buffering_update', {
          socketId: socket.id,
          isBuffering: Boolean(isBuffering),
          bufferingList: result.bufferingList
        });
      }
    });

    // 6. Host Settings & Controls
    socket.on('set_control_mode', ({ mode }) => {
      const room = getRoom();
      if (!room || room.hostId !== socket.id) {
        socket.emit('error_notice', { message: 'Only the room host can change control settings.' });
        return;
      }

      room.controlMode = mode === 'host_only' ? 'host_only' : 'collaborative';
      db.saveRoom(room);

      io.to(`room_${currentRoomCode}`).emit('control_mode_changed', {
        controlMode: room.controlMode,
        changedBy: currentUser?.nickname
      });

      const sysMsg = {
        nickname: 'System',
        avatar: 'system',
        text: `Host set controls to: ${room.controlMode === 'host_only' ? 'Host-Only Controls 🔒' : 'Collaborative Mode 👥'}`,
        isSystem: true,
        createdAt: Date.now()
      };
      db.saveChatMessage(currentRoomCode, sysMsg);
      io.to(`room_${currentRoomCode}`).emit('new_message', sysMsg);
    });

    socket.on('set_auto_pause', ({ enabled }) => {
      const room = getRoom();
      if (!room || room.hostId !== socket.id) return;

      room.autoPauseOnBuffer = Boolean(enabled);
      db.saveRoom(room);

      io.to(`room_${currentRoomCode}`).emit('auto_pause_changed', {
        autoPauseOnBuffer: room.autoPauseOnBuffer
      });
    });

    socket.on('transfer_host', ({ targetSocketId }) => {
      const room = getRoom();
      if (!room || room.hostId !== socket.id) return;

      const targetMember = room.members.get(targetSocketId);
      if (!targetMember) return;

      // Remove host flag from current host
      const currentHostMember = room.members.get(socket.id);
      if (currentHostMember) currentHostMember.isHost = false;

      // Set target as new host
      targetMember.isHost = true;
      room.hostId = targetSocketId;
      db.saveRoom(room);

      io.to(`room_${currentRoomCode}`).emit('host_changed', {
        newHostId: targetSocketId,
        newHostNickname: targetMember.nickname
      });

      io.to(`room_${currentRoomCode}`).emit('members_updated', {
        members: Array.from(room.members.values()),
        hostId: room.hostId
      });

      const sysMsg = {
        nickname: 'System',
        avatar: 'system',
        text: `Host role transferred to ${targetMember.nickname} 👑`,
        isSystem: true,
        createdAt: Date.now()
      };
      db.saveChatMessage(currentRoomCode, sysMsg);
      io.to(`room_${currentRoomCode}`).emit('new_message', sysMsg);
    });

    socket.on('kick_member', ({ targetSocketId }) => {
      const room = getRoom();
      if (!room || room.hostId !== socket.id || targetSocketId === socket.id) return;

      const targetSocket = io.sockets.sockets.get(targetSocketId);
      const targetMember = room.members.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit('kicked_notice', { message: 'You have been kicked by the host.' });
        targetSocket.leave(`room_${currentRoomCode}`);
      }

      roomManager.removeMember(currentRoomCode, targetSocketId);

      io.to(`room_${currentRoomCode}`).emit('members_updated', {
        members: Array.from(room.members.values()),
        hostId: room.hostId
      });

      if (targetMember) {
        const sysMsg = {
          nickname: 'System',
          avatar: 'system',
          text: `${targetMember.nickname} was removed from the room`,
          isSystem: true,
          createdAt: Date.now()
        };
        db.saveChatMessage(currentRoomCode, sysMsg);
        io.to(`room_${currentRoomCode}`).emit('new_message', sysMsg);
      }
    });

    // 7. Playlist Queue Operations
    socket.on('queue_add', ({ item }, callback) => {
      const room = getRoom();
      if (!room) return;

      // In host-only mode, only host can add to queue
      if (room.controlMode === 'host_only' && room.hostId !== socket.id) {
        socket.emit('error_notice', { message: 'Only the host can modify the queue in Host-Only mode.' });
        if (callback) callback({ success: false, message: 'Permission denied' });
        return;
      }

      const queueItem = roomManager.addToQueue(currentRoomCode, item, currentUser || { id: socket.id, nickname: 'Anonymous' });
      if (queueItem) {
        io.to(`room_${currentRoomCode}`).emit('queue_updated', {
          queue: room.queue
        });

        const sysMsg = {
          nickname: 'System',
          avatar: 'system',
          text: `${currentUser?.nickname || 'Someone'} queued "${queueItem.title}"`,
          isSystem: true,
          createdAt: Date.now()
        };
        db.saveChatMessage(currentRoomCode, sysMsg);
        io.to(`room_${currentRoomCode}`).emit('new_message', sysMsg);

        if (callback) callback({ success: true, item: queueItem });
      }
    });

    socket.on('queue_remove', ({ itemId }) => {
      const room = getRoom();
      if (!room) return;

      if (room.controlMode === 'host_only' && room.hostId !== socket.id) {
        socket.emit('error_notice', { message: 'Only the host can modify the queue in Host-Only mode.' });
        return;
      }

      const removed = roomManager.removeFromQueue(currentRoomCode, itemId);
      if (removed) {
        io.to(`room_${currentRoomCode}`).emit('queue_updated', {
          queue: room.queue
        });
      }
    });

    socket.on('queue_reorder', ({ oldIndex, newIndex }) => {
      const room = getRoom();
      if (!room) return;

      if (room.controlMode === 'host_only' && room.hostId !== socket.id) {
        return;
      }

      const updated = roomManager.reorderQueue(currentRoomCode, oldIndex, newIndex);
      if (updated) {
        io.to(`room_${currentRoomCode}`).emit('queue_updated', {
          queue: room.queue
        });
      }
    });

    socket.on('queue_play_next', () => {
      const room = getRoom();
      if (!room) return;

      if (room.controlMode === 'host_only' && room.hostId !== socket.id) {
        return;
      }

      const nextVideo = roomManager.playNextInQueue(currentRoomCode);
      if (nextVideo) {
        io.to(`room_${currentRoomCode}`).emit('video_changed', {
          video: room.video,
          changedBy: { id: 'queue', nickname: 'Queue Auto-Advance' }
        });
        io.to(`room_${currentRoomCode}`).emit('queue_updated', {
          queue: room.queue
        });
        io.to(`room_${currentRoomCode}`).emit('sync_play', {
          currentTime: 0,
          serverTime: Date.now(),
          actionBy: socket.id,
          nickname: 'Queue'
        });
      }
    });

    // 8. Live Text Chat & Floating Reactions
    socket.on('send_message', ({ text, replyTo }) => {
      if (!currentRoomCode || !text || !text.trim()) return;

      const cleanText = text.trim().slice(0, 500);
      const msg = {
        roomCode: currentRoomCode,
        userId: currentUser?.id,
        nickname: currentUser?.nickname || 'Anonymous',
        avatar: currentUser?.avatar || 'neon-cat',
        text: cleanText,
        replyTo: replyTo || null,
        isSystem: false,
        createdAt: Date.now()
      };

      const msgId = db.saveChatMessage(currentRoomCode, msg);
      msg.id = msgId;

      io.to(`room_${currentRoomCode}`).emit('new_message', msg);
    });

    socket.on('send_reaction', ({ emoji }) => {
      if (!currentRoomCode || !emoji) return;
      const allowedEmojis = ['😂', '❤️', '🔥', '😱', '👏', '💀', '🎉', '🍿', '😮', '🚀'];
      if (!allowedEmojis.includes(emoji)) return;

      const reactionData = {
        emoji,
        sender: currentUser?.nickname || 'Guest',
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now()
      };

      // Broadcast reaction to everyone in room for floating animations
      io.to(`room_${currentRoomCode}`).emit('new_reaction', reactionData);
    });

    // 9. WebRTC Mesh Voice Signaling
    socket.on('voice_join', () => {
      const room = getRoom();
      if (!room) return;

      roomManager.setMemberVoiceState(currentRoomCode, socket.id, true);

      // Notify other participants in the room that this peer joined voice
      socket.to(`room_${currentRoomCode}`).emit('webrtc_peer_joined', {
        socketId: socket.id,
        nickname: currentUser?.nickname,
        avatar: currentUser?.avatar
      });

      // Update members list
      io.to(`room_${currentRoomCode}`).emit('members_updated', {
        members: Array.from(room.members.values()),
        hostId: room.hostId
      });
    });

    socket.on('voice_leave', () => {
      if (!currentRoomCode) return;
      roomManager.setMemberVoiceState(currentRoomCode, socket.id, false);
      roomManager.setMemberSpeaking(currentRoomCode, socket.id, false);

      socket.to(`room_${currentRoomCode}`).emit('webrtc_peer_left', {
        socketId: socket.id
      });

      const room = getRoom();
      if (room) {
        io.to(`room_${currentRoomCode}`).emit('members_updated', {
          members: Array.from(room.members.values()),
          hostId: room.hostId
        });
      }
    });

    // WebRTC Offer / Answer / ICE Candidate forwarding
    socket.on('webrtc_offer', ({ to, offer }) => {
      if (!to || !offer) return;
      io.to(to).emit('webrtc_offer', {
        from: socket.id,
        offer,
        nickname: currentUser?.nickname,
        avatar: currentUser?.avatar
      });
    });

    socket.on('webrtc_answer', ({ to, answer }) => {
      if (!to || !answer) return;
      io.to(to).emit('webrtc_answer', {
        from: socket.id,
        answer
      });
    });

    socket.on('webrtc_ice_candidate', ({ to, candidate }) => {
      if (!to || !candidate) return;
      io.to(to).emit('webrtc_ice_candidate', {
        from: socket.id,
        candidate
      });
    });

    // Voice speaking indicator (for glowing avatar halo)
    socket.on('voice_speaking_state', ({ isSpeaking }) => {
      if (!currentRoomCode) return;
      roomManager.setMemberSpeaking(currentRoomCode, socket.id, isSpeaking);

      socket.to(`room_${currentRoomCode}`).emit('speaking_state_changed', {
        socketId: socket.id,
        isSpeaking: Boolean(isSpeaking)
      });
    });

    // 10. Live Room Polls
    socket.on('poll_create', ({ question, options }, callback) => {
      const room = getRoom();
      if (!room || !question || !Array.isArray(options) || options.length < 2) return;

      const poll = roomManager.createPoll(currentRoomCode, question, options, currentUser || { id: socket.id, nickname: 'Anonymous' });
      if (poll) {
        io.to(`room_${currentRoomCode}`).emit('poll_created', { poll });

        const sysMsg = {
          nickname: 'System',
          avatar: 'system',
          text: `📊 ${currentUser?.nickname || 'Someone'} started a live poll: "${question}"`,
          isSystem: true,
          createdAt: Date.now()
        };
        db.saveChatMessage(currentRoomCode, sysMsg);
        io.to(`room_${currentRoomCode}`).emit('new_message', sysMsg);

        if (callback) callback({ success: true, poll });
      }
    });

    socket.on('poll_vote', ({ pollId, optionIndex }) => {
      if (!currentRoomCode || !pollId) return;
      const poll = roomManager.votePoll(currentRoomCode, pollId, optionIndex, currentUser?.id || socket.id);
      if (poll) {
        io.to(`room_${currentRoomCode}`).emit('poll_updated', { poll });
      }
    });

    socket.on('poll_end', ({ pollId }) => {
      const room = getRoom();
      if (!room || !pollId) return;

      const poll = roomManager.endPoll(currentRoomCode, pollId);
      if (poll) {
        io.to(`room_${currentRoomCode}`).emit('poll_ended', { poll });
      }
    });

    // 11. Typing Indicators
    socket.on('typing_state', ({ isTyping }) => {
      if (!currentRoomCode) return;
      socket.to(`room_${currentRoomCode}`).emit('user_typing', {
        socketId: socket.id,
        nickname: currentUser?.nickname || 'Someone',
        isTyping: Boolean(isTyping)
      });
    });

    // 12. Subtitle Synchronization
    socket.on('sync_subtitles', (subtitlesData) => {
      if (!currentRoomCode) return;
      const subtitles = roomManager.setSubtitles(currentRoomCode, subtitlesData);
      io.to(`room_${currentRoomCode}`).emit('subtitles_synced', { subtitles });

      const sysMsg = {
        nickname: 'System',
        avatar: 'system',
        text: `📝 ${currentUser?.nickname || 'Someone'} loaded subtitles: "${subtitlesData.label || 'Subtitles'}"`,
        isSystem: true,
        createdAt: Date.now()
      };
      db.saveChatMessage(currentRoomCode, sysMsg);
      io.to(`room_${currentRoomCode}`).emit('new_message', sysMsg);
    });

    // 13. Screen Sharing Video Broadcast
    socket.on('screen_share_started', () => {
      const room = getRoom();
      if (!room) return;
      room.screenSharingUser = socket.id;
      socket.to(`room_${currentRoomCode}`).emit('screen_share_started', {
        socketId: socket.id,
        nickname: currentUser?.nickname || 'Friend'
      });
    });

    socket.on('screen_share_stopped', () => {
      const room = getRoom();
      if (!room) return;
      if (room.screenSharingUser === socket.id) {
        room.screenSharingUser = null;
      }
      socket.to(`room_${currentRoomCode}`).emit('screen_share_stopped', {
        socketId: socket.id
      });
    });

    // 14. Disconnect & Cleanup
    socket.on('disconnect', () => {
      if (!currentRoomCode) return;

      const code = currentRoomCode;
      const removal = roomManager.removeMember(code, socket.id);

      if (removal && removal.leavingMember) {
        // WebRTC peer left signal
        socket.to(`room_${code}`).emit('webrtc_peer_left', {
          socketId: socket.id
        });

        // Broadcast user left
        socket.to(`room_${code}`).emit('user_left', {
          socketId: socket.id,
          nickname: removal.leavingMember.nickname,
          remainingCount: removal.remainingCount
        });

        // Broadcast new host if transferred
        if (removal.newHost) {
          socket.to(`room_${code}`).emit('host_changed', {
            newHostId: removal.newHost.socketId,
            newHostNickname: removal.newHost.nickname
          });
        }

        const room = roomManager.getRoom(code);
        if (room) {
          socket.to(`room_${code}`).emit('members_updated', {
            members: Array.from(room.members.values()),
            hostId: room.hostId
          });
        }

        // Save system message
        const sysMsg = {
          nickname: 'System',
          avatar: 'system',
          text: `${removal.leavingMember.nickname} left the room`,
          isSystem: true,
          createdAt: Date.now()
        };
        db.saveChatMessage(code, sysMsg);
        socket.to(`room_${code}`).emit('new_message', sysMsg);
      }
    });
  });
}

module.exports = { setupSocketHandlers };
