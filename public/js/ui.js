/**
 * UI Controller & Interactivity Manager
 * Handles Dark Cinema Glassmorphism UI components, modals, controls, and toasts.
 */

class UIManager {
  constructor() {
    this.theaterMode = false;
    this.ambilightEnabled = localStorage.getItem('wt_ambilight') !== 'false';
    this.currentTab = 'chat'; // 'chat' | 'queue' | 'voice'
    this.isMuted = false;
    this.activeModal = null;
    this.membersMap = new Map();
  }

  init() {
    this.setupCustomControls();
    this.setupTabs();
    this.setupModals();
    this.setupAvatarPicker();
  }

  toggleAmbilight() {
    this.ambilightEnabled = !this.ambilightEnabled;
    localStorage.setItem('wt_ambilight', this.ambilightEnabled);
    const glow = document.getElementById('player-ambilight-glow');
    if (glow) {
      glow.style.display = this.ambilightEnabled ? 'block' : 'none';
    }
    const btn = document.getElementById('btn-ambilight');
    if (btn) {
      btn.classList.toggle('text-violet-400', this.ambilightEnabled);
      btn.classList.toggle('text-zinc-400', !this.ambilightEnabled);
    }
    this.showToast(this.ambilightEnabled ? 'Ambilight Glow enabled ✨' : 'Ambilight Glow disabled', 'info');
  }

  updateScreenShareNotice(isActive, sharerName) {
    const banner = document.getElementById('screen-share-active-banner');
    const text = document.getElementById('screen-share-sharer-name');
    if (banner) {
      banner.classList.toggle('hidden', !isActive);
      if (text && sharerName) text.textContent = sharerName;
    }
  }

  openCreatePollModal() {
    this.openModal('modal-create-poll');
  }

  openSubtitlesModal() {
    this.openModal('modal-subtitles');
  }

  openSyncDiagnosticsModal() {
    const modal = document.getElementById('modal-sync-diagnostics');
    if (!modal) return;

    const ping = window.socketClient.ping || 0;
    const clientTime = window.unifiedPlayer.getCurrentTime();
    const masterTime = window.syncEngine.calculateEstimatedMasterTime();
    const drift = Math.abs(clientTime - masterTime);
    const isPaused = window.unifiedPlayer.isPaused();
    const rate = window.unifiedPlayer.getPlaybackRate();

    document.getElementById('diag-ping').textContent = `${ping} ms`;
    document.getElementById('diag-drift').textContent = `${drift.toFixed(3)} s (${drift < 0.5 ? 'Optimal' : drift < 1.5 ? 'Good' : 'Needs Sync'})`;
    document.getElementById('diag-status').textContent = isPaused ? 'Paused' : 'Playing';
    document.getElementById('diag-rate').textContent = `${rate}x`;
    document.getElementById('diag-peer-count').textContent = `${(window.app?.currentRoom?.members || []).length} participants`;

    this.openModal('modal-sync-diagnostics');
  }

  // Toast Notification System
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const icons = {
      success: 'fa-circle-check text-emerald-400',
      error: 'fa-circle-exclamation text-rose-400',
      warning: 'fa-triangle-exclamation text-amber-400',
      info: 'fa-circle-info text-cyan-400'
    };

    const borders = {
      success: 'border-emerald-500/30',
      error: 'border-rose-500/30',
      warning: 'border-amber-500/30',
      info: 'border-cyan-500/30'
    };

    toast.className = `flex items-center gap-2.5 px-4 py-3 rounded-xl bg-zinc-900/95 backdrop-blur-md border ${borders[type] || borders.info} text-zinc-100 text-xs shadow-2xl transition-all duration-300 transform translate-y-2 opacity-0 select-none`;
    toast.innerHTML = `
      <i class="fa-solid ${icons[type] || icons.info} text-sm"></i>
      <span class="font-medium">${this.escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });

    // Auto dismiss after 3.5s
    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3500);
  }

  // Setup Custom Video Player Controls
  setupCustomControls() {
    const playPauseBtn = document.getElementById('btn-play-pause');
    const scrubContainer = document.getElementById('scrub-container');
    const volumeSlider = document.getElementById('volume-slider');
    const muteBtn = document.getElementById('btn-mute');
    const speedSelect = document.getElementById('speed-select');
    const fullscreenBtn = document.getElementById('btn-fullscreen');
    const theaterBtn = document.getElementById('btn-theater');
    const pipBtn = document.getElementById('btn-pip');

    // Play / Pause
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => {
        if (!window.syncEngine.canControlPlayback()) {
          this.showToast('Only host can control playback in Host-Only mode', 'warning');
          return;
        }

        if (window.unifiedPlayer.isPaused()) {
          window.unifiedPlayer.play();
        } else {
          window.unifiedPlayer.pause();
        }
      });
    }

    // Scrubbing timeline
    if (scrubContainer) {
      let isDraggingScrub = false;

      const handleScrub = (e) => {
        const rect = scrubContainer.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const duration = window.unifiedPlayer.getDuration();
        if (duration > 0) {
          const targetTime = pos * duration;
          this.updateScrubProgress(targetTime, duration);
          window.syncEngine.userSeekTo(targetTime);
        }
      };

      scrubContainer.addEventListener('mousedown', (e) => {
        isDraggingScrub = true;
        handleScrub(e);
      });

      window.addEventListener('mousemove', (e) => {
        if (isDraggingScrub) handleScrub(e);
      });

      window.addEventListener('mouseup', () => {
        if (isDraggingScrub) isDraggingScrub = false;
      });

      // Mobile touch scrub
      scrubContainer.addEventListener('touchstart', (e) => {
        isDraggingScrub = true;
        handleScrub(e);
      }, { passive: true });

      window.addEventListener('touchmove', (e) => {
        if (isDraggingScrub) handleScrub(e);
      }, { passive: true });

      window.addEventListener('touchend', () => {
        isDraggingScrub = false;
      });
    }

    // Volume Slider
    if (volumeSlider) {
      volumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        window.unifiedPlayer.setVolume(val);
        this.updateVolumeIcon(val);
      });
    }

    // Mute button
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        this.isMuted = !this.isMuted;
        if (this.isMuted) {
          window.unifiedPlayer.mute();
          this.updateVolumeIcon(0);
        } else {
          window.unifiedPlayer.unmute();
          const vol = volumeSlider ? parseFloat(volumeSlider.value) : 1.0;
          this.updateVolumeIcon(vol);
        }
      });
    }

    // Playback Speed
    if (speedSelect) {
      speedSelect.addEventListener('change', (e) => {
        const rate = parseFloat(e.target.value);
        if (!window.syncEngine.canControlPlayback()) {
          this.showToast('Only host can change playback speed', 'warning');
          speedSelect.value = window.unifiedPlayer.getPlaybackRate();
          return;
        }
        window.unifiedPlayer.setPlaybackRate(rate);
        window.socketClient.emit('sync_rate', { playbackRate: rate });
      });
    }

    // Fullscreen
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => {
        const playerArea = document.getElementById('player-stage');
        if (!document.fullscreenElement) {
          if (playerArea?.requestFullscreen) {
            playerArea.requestFullscreen();
          } else if (playerArea?.webkitRequestFullscreen) {
            playerArea.webkitRequestFullscreen();
          }
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen();
          }
        }
      });
    }

    // Theater Mode
    if (theaterBtn) {
      theaterBtn.addEventListener('click', () => {
        this.toggleTheaterMode();
      });
    }

    // Picture-in-Picture
    if (pipBtn) {
      pipBtn.addEventListener('click', async () => {
        const videoEl = document.getElementById('html5-video');
        if (videoEl && document.pictureInPictureEnabled && videoEl.style.display !== 'none') {
          try {
            if (document.pictureInPictureElement) {
              await document.exitPictureInPicture();
            } else {
              await videoEl.requestPictureInPicture();
            }
          } catch (err) {
            this.showToast('Picture-in-picture not available for this media', 'warning');
          }
        } else {
          this.showToast('Picture-in-picture is supported for direct & stream videos', 'info');
        }
      });
    }

    // Bind player time updates to scrub bar
    window.unifiedPlayer.onTimeUpdateCallback = (current, duration) => {
      this.updateScrubProgress(current, duration);
      this.updatePlayPauseIcon(!window.unifiedPlayer.isPaused());
    };
  }

  updatePlayPauseIcon(isPlaying) {
    const btn = document.getElementById('btn-play-pause');
    if (!btn) return;
    btn.innerHTML = isPlaying
      ? '<i class="fa-solid fa-pause text-base"></i>'
      : '<i class="fa-solid fa-play text-base ml-0.5"></i>';
  }

  updateVolumeIcon(vol) {
    const icon = document.getElementById('mute-icon');
    if (!icon) return;
    if (vol === 0 || this.isMuted) {
      icon.className = 'fa-solid fa-volume-xmark text-sm text-zinc-400';
    } else if (vol < 0.5) {
      icon.className = 'fa-solid fa-volume-low text-sm text-zinc-200';
    } else {
      icon.className = 'fa-solid fa-volume-high text-sm text-zinc-200';
    }
  }

  updateScrubProgress(currentTime, duration) {
    const progressBar = document.getElementById('scrub-progress');
    const thumb = document.getElementById('scrub-thumb');
    const timeDisplay = document.getElementById('time-display');

    if (duration > 0) {
      const percent = Math.min(100, Math.max(0, (currentTime / duration) * 100));
      if (progressBar) progressBar.style.width = `${percent}%`;
      if (thumb) thumb.style.left = `${percent}%`;
    }

    if (timeDisplay) {
      timeDisplay.textContent = `${this.formatDuration(currentTime)} / ${this.formatDuration(duration)}`;
    }
  }

  toggleTheaterMode() {
    this.theaterMode = !this.theaterMode;
    const roomContainer = document.getElementById('room-view');
    const theaterBtn = document.getElementById('btn-theater');

    if (roomContainer) {
      roomContainer.classList.toggle('theater-mode-active', this.theaterMode);
    }
    if (theaterBtn) {
      theaterBtn.classList.toggle('text-violet-400', this.theaterMode);
      theaterBtn.classList.toggle('text-zinc-400', !this.theaterMode);
    }

    this.showToast(this.theaterMode ? 'Theater Mode enabled' : 'Theater Mode disabled', 'info');
  }

  // Mobile Tabs System (Chat, Queue, Voice)
  setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-nav-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });
  }

  switchTab(tabName) {
    this.currentTab = tabName;

    // Update buttons
    document.querySelectorAll('.tab-nav-btn').forEach((btn) => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle('text-violet-400', isActive);
      btn.classList.toggle('border-violet-500', isActive);
      btn.classList.toggle('text-zinc-400', !isActive);
      btn.classList.toggle('border-transparent', !isActive);
    });

    // Update tab panels
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      if (panel.id === `tab-panel-${tabName}`) {
        panel.classList.remove('hidden');
      } else {
        panel.classList.add('hidden');
      }
    });

    if (tabName === 'chat' && window.chatManager) {
      window.chatManager.scrollToBottom();
    }
  }

  updateQueueBadge(count) {
    const badge = document.getElementById('queue-badge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // Participants & Speaking Roster
  updateMembersList(members, hostId) {
    const container = document.getElementById('members-list');
    const countBadge = document.getElementById('members-count-badge');
    if (countBadge) countBadge.textContent = members.length;
    if (!container) return;

    container.innerHTML = '';
    const myId = window.socketClient.getSocketId();
    const isMeHost = hostId === myId;

    members.forEach((member) => {
      const isMe = member.socketId === myId;
      const isHost = member.socketId === hostId;

      const card = document.createElement('div');
      card.id = `member-card-${member.socketId}`;
      card.className = 'glass-panel p-2.5 rounded-xl border border-white/5 flex items-center justify-between gap-3 text-xs mb-2 transition';

      // Ping color
      let pingColor = 'text-emerald-400';
      if (member.ping > 150) pingColor = 'text-rose-400';
      else if (member.ping > 80) pingColor = 'text-amber-400';

      card.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="relative">
            <div id="avatar-${member.socketId}" class="w-9 h-9 rounded-full flex items-center justify-center text-sm shadow-md border border-white/10 ${window.chatManager.getAvatarBg(member.avatar)} transition-all duration-200">
              ${window.chatManager.getAvatarSvg(member.avatar)}
            </div>
            ${member.inVoice ? `
              <div class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-cyan-500 border-2 border-zinc-950 flex items-center justify-center text-[8px] text-zinc-950">
                <i class="fa-solid fa-microphone"></i>
              </div>
            ` : ''}
          </div>

          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="font-medium text-zinc-200 truncate ${isMe ? 'text-violet-300' : ''}">${this.escapeHtml(member.nickname)}</span>
              ${isHost ? '<span title="Room Host">👑</span>' : ''}
              ${isMe ? '<span class="text-[9px] px-1 py-0.2 bg-violet-500/20 text-violet-300 rounded">You</span>' : ''}
            </div>
            <div class="flex items-center gap-2 text-[10px] text-zinc-500">
              <span class="${pingColor}">● ${member.ping || 18}ms</span>
              ${member.isBuffering ? '<span class="text-amber-400 font-medium animate-pulse">Buffering...</span>' : ''}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          ${!isMe && member.inVoice ? `
            <div class="flex items-center gap-1" title="Friend Volume">
              <i class="fa-solid fa-volume-low text-[10px] text-zinc-500"></i>
              <input type="range" min="0" max="1" step="0.05" value="1" oninput="voiceChat.setPeerVolume('${member.socketId}', this.value)" class="w-14 custom-slider">
            </div>
          ` : ''}

          ${isMeHost && !isMe ? `
            <div class="relative group">
              <button class="p-1.5 text-zinc-500 hover:text-white rounded transition">
                <i class="fa-solid fa-ellipsis-vertical"></i>
              </button>
              <div class="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col bg-zinc-900 border border-white/10 rounded-lg shadow-2xl py-1 z-30 min-w-[120px]">
                <button onclick="socketClient.emit('transfer_host', { targetSocketId: '${member.socketId}' })" class="px-3 py-1.5 text-left text-zinc-300 hover:bg-zinc-800 text-[11px] flex items-center gap-1.5">
                  <i class="fa-solid fa-crown text-amber-400"></i> Make Host
                </button>
                <button onclick="socketClient.emit('kick_member', { targetSocketId: '${member.socketId}' })" class="px-3 py-1.5 text-left text-rose-400 hover:bg-zinc-800 text-[11px] flex items-center gap-1.5">
                  <i class="fa-solid fa-user-xmark"></i> Kick
                </button>
              </div>
            </div>
          ` : ''}
        </div>
      `;

      container.appendChild(card);
    });
  }

  setParticipantSpeaking(socketId, isSpeaking) {
    const avatarEl = document.getElementById(`avatar-${socketId}`);
    if (avatarEl) {
      if (isSpeaking) {
        avatarEl.classList.add('speaking-glow');
      } else {
        avatarEl.classList.remove('speaking-glow');
      }
    }
  }

  setMySpeakingStatus(isSpeaking) {
    const myId = window.socketClient.getSocketId();
    if (myId) {
      this.setParticipantSpeaking(myId, isSpeaking);
    }
  }

  // Voice Controls UI
  updateVoiceUI(inVoice, isMuted, isPushToTalk) {
    const joinBtn = document.getElementById('btn-voice-toggle');
    const muteBtn = document.getElementById('btn-voice-mute');
    const pttToggle = document.getElementById('btn-voice-ptt');
    const pttNotice = document.getElementById('ptt-instruction');

    if (joinBtn) {
      if (inVoice) {
        joinBtn.innerHTML = '<i class="fa-solid fa-phone-slash mr-1.5"></i> Leave Voice';
        joinBtn.className = 'px-3.5 py-1.5 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 border border-rose-500/30 text-xs font-medium transition';
      } else {
        joinBtn.innerHTML = '<i class="fa-solid fa-microphone mr-1.5"></i> Join Voice Room';
        joinBtn.className = 'px-3.5 py-1.5 rounded-lg bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-500/30 text-xs font-medium transition';
      }
    }

    if (muteBtn) {
      muteBtn.style.display = inVoice ? 'inline-flex' : 'none';
      if (isMuted) {
        muteBtn.innerHTML = '<i class="fa-solid fa-microphone-slash mr-1"></i> Unmute';
        muteBtn.className = 'px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs transition';
      } else {
        muteBtn.innerHTML = '<i class="fa-solid fa-microphone mr-1"></i> Mute';
        muteBtn.className = 'px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 border border-white/10 text-xs transition';
      }
    }

    if (pttToggle) {
      pttToggle.style.display = inVoice ? 'inline-flex' : 'none';
      pttToggle.classList.toggle('bg-violet-600/40', isPushToTalk);
      pttToggle.classList.toggle('text-violet-300', isPushToTalk);
    }

    if (pttNotice) {
      pttNotice.style.display = (inVoice && isPushToTalk) ? 'block' : 'none';
    }
  }

  updatePushToTalkIndicator(isPressed) {
    const indicator = document.getElementById('ptt-indicator');
    if (indicator) {
      indicator.classList.toggle('text-cyan-400', isPressed);
      indicator.classList.toggle('font-bold', isPressed);
      indicator.textContent = isPressed ? 'TRANSMITTING (Speaking...)' : 'Press & Hold SPACEBAR to Speak';
    }
  }

  updateBufferPill(isBuffering, message) {
    const pill = document.getElementById('buffer-pill');
    const text = document.getElementById('buffer-pill-text');
    if (!pill) return;

    if (isBuffering) {
      if (text) text.textContent = message || 'Syncing buffer with friends...';
      pill.classList.remove('hidden');
    } else {
      pill.classList.add('hidden');
    }
  }

  // Modals & Popups
  setupModals() {
    // Media source tabs inside "Change Video / Queue" modal
    const sourceTabs = document.querySelectorAll('.media-source-tab');
    sourceTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const source = tab.dataset.source;
        sourceTabs.forEach(t => {
          t.classList.toggle('bg-violet-600', t.dataset.source === source);
          t.classList.toggle('text-white', t.dataset.source === source);
          t.classList.toggle('text-zinc-400', t.dataset.source !== source);
        });

        document.querySelectorAll('.media-input-panel').forEach(p => {
          p.classList.toggle('hidden', p.id !== `source-panel-${source}`);
        });

        const submitBtn = document.getElementById('btn-submit-media');
        if (submitBtn) {
          submitBtn.style.display = (source === 'platforms' || source === 'catalog') ? 'none' : 'inline-flex';
        }
      });
    });

    // File input handler for Local Sync (Zero-Upload)
    const localFileInput = document.getElementById('local-file-input');
    if (localFileInput) {
      localFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const info = document.getElementById('local-file-info');
          if (info) {
            info.textContent = `Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
            info.classList.remove('hidden');
          }
        }
      });
    }
  }

  openAddMediaModal(isQueueMode = false) {
    const modal = document.getElementById('modal-add-media');
    const modalTitle = document.getElementById('add-media-modal-title');
    const submitBtn = document.getElementById('btn-submit-media');

    if (modalTitle) {
      modalTitle.textContent = isQueueMode ? 'Add Video to Playlist Queue' : 'Change Video for Room';
    }
    if (submitBtn) {
      submitBtn.dataset.isQueue = isQueueMode ? 'true' : 'false';
      submitBtn.textContent = isQueueMode ? 'Add to Queue' : 'Load Video';
    }

    if (modal) {
      modal.classList.remove('hidden');
      this.activeModal = modal;
    }
  }

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
      this.activeModal = modal;
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('hidden');
      this.activeModal = null;
    }
  }

  // Submit media form handler
  submitMedia() {
    const submitBtn = document.getElementById('btn-submit-media');
    const isQueue = submitBtn?.dataset.isQueue === 'true';

    // Find active source tab
    const activeTab = document.querySelector('.media-source-tab.bg-violet-600');
    const source = activeTab ? activeTab.dataset.source : 'youtube';

    let mediaData = { type: source, url: '', title: '', duration: 0 };

    if (source === 'youtube') {
      const url = document.getElementById('input-yt-url')?.value.trim();
      if (!url) {
        this.showToast('Please enter a YouTube video URL', 'warning');
        return;
      }
      mediaData.url = url;
      mediaData.title = document.getElementById('input-yt-title')?.value.trim() || 'YouTube Video';
    } else if (source === 'direct') {
      const url = document.getElementById('input-direct-url')?.value.trim();
      if (!url) {
        this.showToast('Please enter a direct video URL (.mp4, .webm, etc.)', 'warning');
        return;
      }
      mediaData.url = url;
      mediaData.title = document.getElementById('input-direct-title')?.value.trim() || 'Direct Video Stream';
    } else if (source === 'hls') {
      const url = document.getElementById('input-hls-url')?.value.trim();
      if (!url) {
        this.showToast('Please enter an HLS .m3u8 stream link', 'warning');
        return;
      }
      mediaData.url = url;
      mediaData.title = document.getElementById('input-hls-title')?.value.trim() || 'HLS Live Stream';
    } else if (source === 'embed') {
      const url = document.getElementById('input-embed-url')?.value.trim();
      if (!url) {
        this.showToast('Please enter an embed URL or iframe code', 'warning');
        return;
      }
      mediaData.type = 'embed';
      mediaData.url = url;
      mediaData.title = document.getElementById('input-embed-title')?.value.trim() || 'Web Video Stream';
    } else if (source === 'platforms') {
      this.closeModal('modal-add-media');
      window.screenShare.startScreenShare();
      return;
    } else if (source === 'local') {
      const fileInput = document.getElementById('local-file-input');
      const file = fileInput?.files[0];
      if (!file) {
        this.showToast('Please select a local video file from your device', 'warning');
        return;
      }
      mediaData.type = 'local';
      mediaData.url = 'local://' + file.name;
      mediaData.title = `[Local] ${file.name}`;
      mediaData.file = file;
    }

    if (isQueue) {
      window.queueManager.addToQueue(mediaData);
    } else {
      // Direct load
      if (mediaData.type === 'local') {
        window.unifiedPlayer.loadSource({
          type: 'local',
          url: mediaData.url,
          file: mediaData.file
        });
      }

      window.socketClient.emit('change_video', {
        type: mediaData.type,
        url: mediaData.url,
        title: mediaData.title,
        duration: 0
      });
    }

    this.closeModal('modal-add-media');
  }

  playSampleMovie(url, title, type = 'direct') {
    this.closeModal('modal-add-media');
    window.socketClient.emit('change_video', {
      type,
      url,
      title,
      duration: 0
    });
    setTimeout(() => {
      window.socketClient.emit('sync_play', { currentTime: 0 });
    }, 400);
    this.showToast(`Loading: ${title}`, 'info');
  }

  // Setup Avatar Picker
  setupAvatarPicker() {
    const avatars = [
      { key: 'neon-cat', name: 'Neon Cat', icon: '🐱' },
      { key: 'cyber-fox', name: 'Cyber Fox', icon: '🦊' },
      { key: 'cosmic-owl', name: 'Cosmic Owl', icon: '🦉' },
      { key: 'panda-zen', name: 'Zen Panda', icon: '🐼' },
      { key: 'neon-wolf', name: 'Neon Wolf', icon: '🐺' },
      { key: 'pixel-bot', name: 'Pixel Bot', icon: '🤖' },
      { key: 'astro-monkey', name: 'Astro Ape', icon: '🐒' },
      { key: 'dragon-fire', name: 'Dragon', icon: '🐲' },
      { key: 'ninja-star', name: 'Ninja', icon: '🥷' },
      { key: 'alien-ufo', name: 'Alien DJ', icon: '👽' },
      { key: 'ghost-chill', name: 'Ghost Chill', icon: '👻' }
    ];

    const grid = document.getElementById('avatar-grid');
    if (!grid) return;

    grid.innerHTML = '';
    avatars.forEach((av) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'p-3 rounded-2xl bg-zinc-800/60 hover:bg-violet-600/20 border border-white/5 hover:border-violet-500/50 flex flex-col items-center justify-center gap-1.5 transition';
      btn.innerHTML = `
        <span class="text-2xl">${av.icon}</span>
        <span class="text-[10px] text-zinc-400">${av.name}</span>
      `;
      btn.addEventListener('click', () => {
        window.app.updateAvatar(av.key);
        this.closeModal('modal-avatar-picker');
      });
      grid.appendChild(btn);
    });
  }

  // 1-Click Copy Invite Link
  copyInviteLink(roomCode) {
    const inviteUrl = `${window.location.origin}/?room=${roomCode}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(inviteUrl).then(() => {
        this.showToast('Invite link copied to clipboard! 📋', 'success');
      }).catch(() => {
        this.fallbackCopy(inviteUrl);
      });
    } else {
      this.fallbackCopy(inviteUrl);
    }
  }

  fallbackCopy(text) {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand('copy');
      this.showToast('Invite link copied to clipboard! 📋', 'success');
    } catch (e) {
      prompt('Copy this invite link:', text);
    }
    document.body.removeChild(input);
  }

  formatDuration(seconds) {
    if (!seconds || isNaN(seconds) || seconds <= 0) return '00:00';
    const totalSecs = Math.floor(seconds);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    const pad = (n) => (n < 10 ? '0' + n : n);
    if (hrs > 0) {
      return `${hrs}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

window.ui = new UIManager();
