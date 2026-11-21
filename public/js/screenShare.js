/**
 * WebRTC Screen Sharing & Tab Broadcasting
 * Allows host or participants to share their full screen, window, or tab with system audio
 */

class ScreenShareManager {
  constructor() {
    this.screenStream = null;
    this.isSharing = false;
    this.activeSharerSocketId = null;
  }

  init() {
    this.bindSocketEvents();
  }

  bindSocketEvents() {
    window.socketClient.on('screen_share_started', ({ socketId, nickname }) => {
      this.activeSharerSocketId = socketId;
      if (window.ui) {
        window.ui.showToast(`🖥️ ${nickname} started sharing their screen!`, 'info');
        window.ui.updateScreenShareNotice(true, nickname);
      }
    });

    window.socketClient.on('screen_share_stopped', ({ socketId }) => {
      if (this.activeSharerSocketId === socketId) {
        this.activeSharerSocketId = null;
        if (window.ui) {
          window.ui.showToast('Screen sharing ended', 'info');
          window.ui.updateScreenShareNotice(false);
        }
      }
    });
  }

  async startScreenShare() {
    if (this.isSharing) return;

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'browser'
        },
        audio: true
      });

      this.isSharing = true;

      // Handle user stopping share via browser native banner
      this.screenStream.getVideoTracks()[0].onended = () => {
        this.stopScreenShare();
      };

      // Play locally on the unified player video element
      const videoEl = document.getElementById('html5-video');
      const ytEl = document.getElementById('yt-player');
      if (ytEl) ytEl.style.display = 'none';
      if (videoEl) {
        videoEl.style.display = 'block';
        videoEl.srcObject = this.screenStream;
        videoEl.play().catch(() => {});
      }

      // Broadcast to room
      window.socketClient.emit('screen_share_started');

      if (window.ui) {
        window.ui.showToast('Screen sharing is live!', 'success');
        window.ui.updateScreenShareNotice(true, 'You');
        const btn = document.getElementById('btn-screen-share');
        if (btn) {
          btn.classList.add('bg-rose-600/30', 'text-rose-300', 'border-rose-500/40');
          btn.innerHTML = '<i class="fa-solid fa-desktop text-[11px] mr-1"></i> Stop Screen';
        }
      }
    } catch (err) {
      console.warn('[ScreenShare] Cancelled or error:', err);
    }
  }

  stopScreenShare() {
    if (!this.isSharing) return;

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }

    const videoEl = document.getElementById('html5-video');
    if (videoEl && videoEl.srcObject) {
      videoEl.srcObject = null;
    }

    this.isSharing = false;
    window.socketClient.emit('screen_share_stopped');

    if (window.ui) {
      window.ui.showToast('Screen sharing stopped', 'info');
      window.ui.updateScreenShareNotice(false);
      const btn = document.getElementById('btn-screen-share');
      if (btn) {
        btn.classList.remove('bg-rose-600/30', 'text-rose-300', 'border-rose-500/40');
        btn.innerHTML = '<i class="fa-solid fa-desktop text-[11px] mr-1"></i> Share Screen';
      }
    }
  }

  toggle() {
    if (this.isSharing) {
      this.stopScreenShare();
    } else {
      this.startScreenShare();
    }
  }
}

window.screenShare = new ScreenShareManager();
