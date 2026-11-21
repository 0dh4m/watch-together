/**
 * Main Application Bootstrap & Router
 * Coordinates Lobby, Cinema Room, User Profiles, PWA Installation, and Real-Time Sync.
 */

class App {
  constructor() {
    this.currentUser = {
      id: null,
      nickname: '',
      avatar: 'neon-cat'
    };
    this.currentRoom = null;
    this.isHost = false;
  }

  async init() {
    console.log('[App] Initializing Watch Together...');

    // 1. Load or initialize user profile from localStorage
    this.loadProfile();

    // 2. Initialize UI components
    window.ui.init();

    // 3. Initialize Unified Player
    window.unifiedPlayer.init({
      videoElementId: 'html5-video',
      ytContainerId: 'yt-player'
    });

    // 4. Initialize Socket Client
    const socket = window.socketClient.connect();

    // 5. Initialize Subsystems
    window.syncEngine.init({
      player: window.unifiedPlayer,
      socketClient: window.socketClient
    });

    window.voiceChat.init({
      socketClient: window.socketClient
    });

    window.chatManager.init({
      socketClient: window.socketClient,
      messagesListId: 'chat-messages-list',
      chatInputId: 'chat-input',
      replyBannerId: 'chat-reply-banner',
      reactionsOverlayId: 'reactions-container'
    });

    window.queueManager.init({
      socketClient: window.socketClient,
      queueContainerId: 'queue-items-container'
    });

    // Subtitles, Polls, Screen Sharing & i18n
    if (window.subtitles) {
      window.subtitles.init({ containerId: 'subtitle-overlay' });
    }
    if (window.pollManager) {
      window.pollManager.init({ containerId: 'poll-widget-container' });
    }
    if (window.screenShare) {
      window.screenShare.init();
    }
    if (window.i18n) {
      window.i18n.applyTranslations();
    }

    // 6. Bind Global Socket Events
    this.bindSocketEvents();

    // 7. Register PWA Service Worker
    this.registerPWA();

    // 8. Handle Routing (Lobby vs Room URL query)
    this.handleRouting();
  }

  // Load user profile from localStorage
  loadProfile() {
    let savedId = localStorage.getItem('wt_user_id');
    if (!savedId) {
      savedId = 'usr_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('wt_user_id', savedId);
    }

    const savedNick = localStorage.getItem('wt_nickname') || `Watcher-${savedId.slice(-3)}`;
    const savedAvatar = localStorage.getItem('wt_avatar') || 'neon-cat';

    this.currentUser = {
      id: savedId,
      nickname: savedNick,
      avatar: savedAvatar
    };

    // Update lobby profile inputs
    const nickInput = document.getElementById('lobby-nickname-input');
    if (nickInput) nickInput.value = savedNick;

    this.updateAvatarDisplay();
  }

  saveProfile(nickname, avatar) {
    if (nickname) {
      this.currentUser.nickname = nickname.trim().slice(0, 30);
      localStorage.setItem('wt_nickname', this.currentUser.nickname);
    }
    if (avatar) {
      this.currentUser.avatar = avatar;
      localStorage.setItem('wt_avatar', avatar);
    }
    this.updateAvatarDisplay();

    // Persist to server API
    fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: this.currentUser.id,
        nickname: this.currentUser.nickname,
        avatar: this.currentUser.avatar
      })
    }).catch(() => {});
  }

  updateAvatar(avatarKey) {
    this.saveProfile(null, avatarKey);
  }

  updateAvatarDisplay() {
    const avatarIcon = document.getElementById('lobby-avatar-icon');
    const preview = document.getElementById('lobby-profile-avatar-preview');
    if (window.chatManager) {
      const svg = window.chatManager.getAvatarSvg(this.currentUser.avatar);
      if (avatarIcon) {
        avatarIcon.textContent = svg;
      }
      if (preview) {
        preview.textContent = svg;
      }
    }
  }

  // Handle URL Routing & Direct Join Links
  handleRouting() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');

    if (roomParam) {
      this.showRoomJoinPrompt(roomParam.toUpperCase());
    } else {
      this.showLobbyView();
      this.refreshPublicRooms();
      this.loadUserWatchHistory();
    }
  }

  // Lobby & Navigation Views
  showLobbyView() {
    document.getElementById('lobby-view')?.classList.remove('hidden');
    document.getElementById('room-view')?.classList.add('hidden');
    document.getElementById('nav-room-badge')?.classList.add('hidden');
    window.history.replaceState({}, document.title, '/');
  }

  showRoomView() {
    document.getElementById('lobby-view')?.classList.add('hidden');
    document.getElementById('room-view')?.classList.remove('hidden');
    document.getElementById('nav-room-badge')?.classList.remove('hidden');
  }

  // Check room status before joining
  async showRoomJoinPrompt(roomCode) {
    try {
      const res = await fetch(`/api/rooms/${roomCode}`);
      const data = await res.json();

      if (!data.success) {
        window.ui.showToast('Room not found or expired', 'error');
        this.showLobbyView();
        return;
      }

      if (data.room.isPrivate) {
        // Prompt for password
        this.promptRoomPassword(roomCode, data.room.title);
      } else {
        this.joinRoom(roomCode);
      }
    } catch (err) {
      this.joinRoom(roomCode);
    }
  }

  promptRoomPassword(roomCode, roomTitle) {
    const modal = document.getElementById('modal-password-prompt');
    const titleEl = document.getElementById('pwd-modal-room-title');
    const codeEl = document.getElementById('pwd-modal-room-code');
    const input = document.getElementById('input-room-pwd');

    if (titleEl) titleEl.textContent = roomTitle || `Room ${roomCode}`;
    if (codeEl) codeEl.textContent = roomCode;
    if (input) input.value = '';

    modal?.classList.remove('hidden');

    const submitBtn = document.getElementById('btn-submit-pwd');
    if (submitBtn) {
      submitBtn.onclick = () => {
        const pwd = input?.value || '';
        modal?.classList.add('hidden');
        this.joinRoom(roomCode, pwd);
      };
    }
  }

  // Join Room via Socket.IO
  joinRoom(roomCode, password = '') {
    // Ensure nickname is saved
    const nicknameInput = document.getElementById('lobby-nickname-input');
    if (nicknameInput && nicknameInput.value.trim()) {
      this.saveProfile(nicknameInput.value.trim());
    }

    const payload = {
      roomCode: roomCode.toUpperCase().trim(),
      user: this.currentUser,
      password: password ? password.trim() : ''
    };

    console.log('[App] Joining room:', payload.roomCode);

    window.socketClient.emit('join_room', payload, (response) => {
      if (!response || !response.success) {
        window.ui.showToast(response?.message || 'Failed to join room', 'error');
        if (response?.isPrivate) {
          this.promptRoomPassword(roomCode);
        }
        return;
      }

      // Successful join!
      this.onRoomJoined(response);
    });
  }

  onRoomJoined({ snapshot, chatHistory, myMember }) {
    this.currentRoom = snapshot;
    this.isHost = snapshot.hostId === window.socketClient.getSocketId();

    // Update URL without reload
    window.history.pushState({}, '', `/?room=${snapshot.code}`);

    // Update room UI headers
    document.getElementById('header-room-title').textContent = snapshot.title;
    document.getElementById('header-room-code').textContent = snapshot.code;
    document.getElementById('current-video-title').textContent = snapshot.video?.title || 'No video loaded';

    // Update Room Permissions & Badges
    this.updateRoomControlMode(snapshot.controlMode);
    this.updateHostControls(this.isHost);

    // Initialize Sync Engine state
    window.syncEngine.setRoomState({
      roomCode: snapshot.code,
      isHost: this.isHost,
      controlMode: snapshot.controlMode,
      autoPauseOnBuffer: snapshot.autoPauseOnBuffer
    });

    // Load current media into Unified Player
    if (snapshot.video && snapshot.video.url) {
      window.unifiedPlayer.loadSource({
        type: snapshot.video.type,
        url: snapshot.video.url,
        startTime: snapshot.video.currentTime || 0
      });

      if (!snapshot.video.paused) {
        window.syncEngine.setRemoteActionFlag();
        window.unifiedPlayer.play();
      }
    }

    // Load playlist queue
    window.queueManager.setQueue(snapshot.queue || []);

    // Load active poll if present
    if (snapshot.activePoll && window.pollManager) {
      window.pollManager.currentPoll = snapshot.activePoll;
      window.pollManager.render();
    }

    // Load subtitles if present
    if (snapshot.subtitles && window.subtitles) {
      window.subtitles.loadSubtitleText(snapshot.subtitles.content, snapshot.subtitles.format, snapshot.subtitles.label, false);
    }

    // Load chat history
    window.chatManager.loadHistory(chatHistory || []);

    // Load participants
    window.ui.updateMembersList(snapshot.members || [], snapshot.hostId);

    // Switch view to Cinema Room
    this.showRoomView();
    window.ui.showToast(`Joined room: ${snapshot.title}`, 'success');
  }

  updateRoomControlMode(mode) {
    const badge = document.getElementById('room-mode-badge');
    if (!badge) return;
    if (mode === 'host_only') {
      badge.innerHTML = '<i class="fa-solid fa-lock text-[10px] mr-1"></i> Host-Only';
      badge.className = 'px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30';
    } else {
      badge.innerHTML = '<i class="fa-solid fa-users text-[10px] mr-1"></i> Collaborative';
      badge.className = 'px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    }
  }

  updateHostControls(isHost) {
    const hostControls = document.getElementById('host-quick-controls');
    if (hostControls) {
      hostControls.style.display = isHost ? 'flex' : 'none';
    }
  }

  // Create Room handler from Lobby form
  async createRoomFromLobby() {
    const titleInput = document.getElementById('create-room-title');
    const isPrivateCheck = document.getElementById('create-room-private');
    const passwordInput = document.getElementById('create-room-password');
    const controlModeSelect = document.getElementById('create-room-mode');

    const title = titleInput?.value.trim() || 'Cinema Lounge';
    const isPrivate = isPrivateCheck ? isPrivateCheck.checked : false;
    const password = passwordInput?.value || '';
    const controlMode = controlModeSelect?.value || 'collaborative';

    try {
      const res = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          isPrivate,
          password,
          controlMode,
          userId: this.currentUser.id
        })
      });

      const data = await res.json();
      if (data.success && data.code) {
        this.joinRoom(data.code, password);
      } else {
        window.ui.showToast('Failed to create room', 'error');
      }
    } catch (err) {
      window.ui.showToast('Network error while creating room', 'error');
    }
  }

  // Fetch Public Rooms list for Lobby
  async refreshPublicRooms() {
    const container = document.getElementById('public-rooms-list');
    if (!container) return;

    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();

      if (!data.success || !data.rooms || data.rooms.length === 0) {
        container.innerHTML = `
          <div class="py-8 text-center text-zinc-500 text-xs">
            No active public rooms right now. Create one and invite friends!
          </div>
        `;
        return;
      }

      container.innerHTML = '';
      data.rooms.forEach((r) => {
        const card = document.createElement('div');
        card.className = 'glass-panel p-3.5 rounded-xl border border-white/5 flex items-center justify-between gap-3 text-xs hover:border-violet-500/40 transition cursor-pointer';
        card.innerHTML = `
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium text-zinc-200 truncate">${window.ui.escapeHtml(r.title)}</span>
              <span class="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.2 rounded font-mono">${r.code}</span>
            </div>
            <p class="text-[11px] text-zinc-400 truncate mt-0.5">
              <i class="fa-solid fa-film text-violet-400 mr-1 text-[10px]"></i> ${window.ui.escapeHtml(r.currentVideoTitle)}
            </p>
          </div>
          <div class="flex items-center gap-3 flex-shrink-0">
            <span class="text-[11px] text-cyan-400 font-medium">
              <i class="fa-solid fa-users text-[10px] mr-1"></i> ${r.memberCount || 1}
            </span>
            <button onclick="app.joinRoom('${r.code}')" class="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium text-xs shadow-md transition">
              Join
            </button>
          </div>
        `;
        container.appendChild(card);
      });
    } catch (err) {
      console.warn('[App] Error fetching public rooms:', err);
    }
  }

  // Fetch User Watch History
  async loadUserWatchHistory() {
    const container = document.getElementById('watch-history-list');
    if (!container || !this.currentUser.id) return;

    try {
      const res = await fetch(`/api/history/${this.currentUser.id}`);
      const data = await res.json();

      if (!data.success || !data.history || data.history.length === 0) {
        container.innerHTML = `
          <div class="py-6 text-center text-zinc-500 text-xs">
            Your watch history will appear here once you watch videos with friends.
          </div>
        `;
        return;
      }

      container.innerHTML = '';
      data.history.slice(0, 5).forEach((h) => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between text-xs py-2 px-3 rounded-lg bg-zinc-900/40 border border-white/5 mb-1.5';
        const dateStr = new Date(h.watched_at).toLocaleDateString([], { month: 'short', day: 'numeric' });

        item.innerHTML = `
          <div class="min-w-0 flex items-center gap-2">
            <i class="fa-solid fa-clock-rotate-left text-zinc-500 text-[11px]"></i>
            <span class="text-zinc-300 truncate max-w-[220px]">${window.ui.escapeHtml(h.video_title)}</span>
          </div>
          <div class="flex items-center gap-2 text-zinc-500 text-[10px] flex-shrink-0">
            <span>Room ${h.room_code}</span>
            <span>•</span>
            <span>${dateStr}</span>
          </div>
        `;
        container.appendChild(item);
      });
    } catch (e) {
      console.warn('[App] Error fetching history:', e);
    }
  }

  // Bind Real-Time Room Socket Events
  bindSocketEvents() {
    // Video source changed in room
    window.socketClient.on('video_changed', ({ video, changedBy }) => {
      console.log('[App] Video changed by', changedBy?.nickname, video.title);
      document.getElementById('current-video-title').textContent = video.title;

      // Load new video into unified player
      window.unifiedPlayer.loadSource({
        type: video.type,
        url: video.url,
        startTime: 0
      });

      // Show local sync banner if local video
      const localBanner = document.getElementById('local-sync-banner');
      if (localBanner) {
        localBanner.classList.toggle('hidden', video.type !== 'local');
      }

      window.ui.showToast(`Now Playing: "${video.title}"`, 'info');
    });

    // Control mode changed (Host-only vs Collaborative)
    window.socketClient.on('control_mode_changed', ({ controlMode, changedBy }) => {
      if (this.currentRoom) this.currentRoom.controlMode = controlMode;
      this.updateRoomControlMode(controlMode);
      window.syncEngine.setRoomState({
        roomCode: this.currentRoom?.code,
        isHost: this.isHost,
        controlMode
      });
      window.ui.showToast(`Room mode: ${controlMode === 'host_only' ? 'Host-Only' : 'Collaborative'}`, 'info');
    });

    // Host transferred
    window.socketClient.on('host_changed', ({ newHostId, newHostNickname }) => {
      if (this.currentRoom) this.currentRoom.hostId = newHostId;
      this.isHost = newHostId === window.socketClient.getSocketId();
      this.updateHostControls(this.isHost);
      window.syncEngine.setRoomState({
        roomCode: this.currentRoom?.code,
        isHost: this.isHost,
        controlMode: this.currentRoom?.controlMode
      });
      window.ui.showToast(`${newHostNickname} is now the host 👑`, 'info');
    });

    // Members roster updated
    window.socketClient.on('members_updated', ({ members, hostId }) => {
      if (this.currentRoom) {
        this.currentRoom.members = members;
        this.currentRoom.hostId = hostId;
      }
      this.isHost = hostId === window.socketClient.getSocketId();
      this.updateHostControls(this.isHost);
      window.ui.updateMembersList(members, hostId);
    });

    // Kicked by host
    window.socketClient.on('kicked_notice', ({ message }) => {
      alert(message || 'You were kicked from the room.');
      this.leaveRoom();
    });

    // General error notice
    window.socketClient.on('error_notice', ({ message }) => {
      window.ui.showToast(message, 'warning');
    });
  }

  // Leave Room
  leaveRoom() {
    window.voiceChat.leaveVoice();
    window.socketClient.emit('leave_room');
    this.currentRoom = null;
    this.showLobbyView();
    this.refreshPublicRooms();
  }

  // Register PWA Service Worker
  registerPWA() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js').then((registration) => {
          console.log('[PWA] ServiceWorker registered with scope:', registration.scope);
        }).catch((err) => {
          console.warn('[PWA] ServiceWorker registration failed:', err);
        });
      });
    }

    // Capture install prompt for PWA install button
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      window.deferredPrompt = e;
      const installBtn = document.getElementById('pwa-install-btn');
      if (installBtn) {
        installBtn.classList.remove('hidden');
        installBtn.addEventListener('click', async () => {
          if (window.deferredPrompt) {
            window.deferredPrompt.prompt();
            const { outcome } = await window.deferredPrompt.userChoice;
            console.log('[PWA] User response to install:', outcome);
            window.deferredPrompt = null;
            installBtn.classList.add('hidden');
          }
        });
      }
    });
  }
}

// Global App Instance
window.app = new App();

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
