/**
 * Core Real-Time Synchronization Engine
 * Implements:
 * 1. Infinite loop / echo prevention between player events and socket emissions
 * 2. Smart drift correction against authoritative master clock (> 1.5s delta)
 * 3. Smart buffer sync (detects stall, notifies room, auto-pauses/resumes)
 * 4. Permission enforcement (Host-Only vs Collaborative)
 */

class SyncEngine {
  constructor() {
    this.player = null;
    this.socketClient = null;
    this.roomCode = null;
    this.isHost = false;
    this.controlMode = 'collaborative'; // 'collaborative' | 'host_only'

    // Loop & Echo prevention
    this.isRemoteAction = false;
    this.remoteActionTimeout = null;
    this.lastSeekTime = 0;
    this.lastEmittedTime = 0;
    this.isSeekingByUser = false;

    // Master clock state
    this.masterTime = 0;
    this.isServerPaused = true;
    this.serverPlaybackRate = 1;
    this.lastMasterUpdate = Date.now();
    this.clientLatency = 0;

    // Buffer state
    this.isLocalBuffering = false;
    this.bufferingDebounce = null;
    this.autoPauseOnBuffer = true;

    // Drift correction config
    this.DRIFT_THRESHOLD_SECONDS = 1.5; // Resync if drift exceeds 1.5s
    this.lastDriftCheck = 0;
  }

  init({ player, socketClient }) {
    this.player = player;
    this.socketClient = socketClient;

    this.bindPlayerEvents();
    this.bindSocketEvents();
  }

  setRoomState({ roomCode, isHost, controlMode, autoPauseOnBuffer }) {
    this.roomCode = roomCode;
    this.isHost = Boolean(isHost);
    this.controlMode = controlMode || 'collaborative';
    this.autoPauseOnBuffer = autoPauseOnBuffer !== false;
  }

  // Set remote action flag to suppress echoing back to server
  setRemoteActionFlag(durationMs = 600) {
    this.isRemoteAction = true;
    if (this.remoteActionTimeout) clearTimeout(this.remoteActionTimeout);
    this.remoteActionTimeout = setTimeout(() => {
      this.isRemoteAction = false;
    }, durationMs);
  }

  canControlPlayback() {
    if (this.controlMode === 'collaborative') return true;
    return this.isHost;
  }

  // 1. Bind Player Event Listeners
  bindPlayerEvents() {
    // When user or media starts playing
    this.player.onPlayCallback = (currentTime) => {
      if (this.isRemoteAction) {
        return; // Ignore playback triggered by remote sync
      }

      if (!this.canControlPlayback()) {
        // Revert to paused if user lacks permission
        this.setRemoteActionFlag();
        this.player.pause();
        if (window.ui) window.ui.showToast('Controls locked: Only host can play in Host-Only mode', 'warning');
        return;
      }

      console.log('[SyncEngine] Emitting sync_play at', currentTime.toFixed(2));
      this.socketClient.emit('sync_play', {
        currentTime: currentTime || this.player.getCurrentTime()
      });
    };

    // When user or media pauses
    this.player.onPauseCallback = (currentTime) => {
      if (this.isRemoteAction) {
        return;
      }

      if (!this.canControlPlayback()) {
        this.setRemoteActionFlag();
        this.player.play();
        if (window.ui) window.ui.showToast('Controls locked: Only host can pause in Host-Only mode', 'warning');
        return;
      }

      console.log('[SyncEngine] Emitting sync_pause at', currentTime.toFixed(2));
      this.socketClient.emit('sync_pause', {
        currentTime: currentTime || this.player.getCurrentTime()
      });
    };

    // When user completes a seek action
    this.player.onSeekCallback = (currentTime) => {
      if (this.isRemoteAction) {
        return;
      }

      if (!this.canControlPlayback()) {
        this.setRemoteActionFlag();
        this.player.seekTo(this.calculateEstimatedMasterTime());
        if (window.ui) window.ui.showToast('Controls locked: Only host can seek in Host-Only mode', 'warning');
        return;
      }

      const now = Date.now();
      // Throttle rapid seek emissions
      if (now - this.lastSeekTime > 300) {
        this.lastSeekTime = now;
        console.log('[SyncEngine] Emitting sync_seek to', currentTime.toFixed(2));
        this.socketClient.emit('sync_seek', {
          currentTime: currentTime
        });
      }
    };

    // Media buffering detector
    this.player.onBufferingCallback = (isBuffering) => {
      if (this.isLocalBuffering === isBuffering) return;

      if (this.bufferingDebounce) clearTimeout(this.bufferingDebounce);
      this.bufferingDebounce = setTimeout(() => {
        this.isLocalBuffering = isBuffering;
        this.socketClient.emit('buffer_state', { isBuffering });
      }, 200);
    };

    // Video ended -> check if queue has next item
    this.player.onEndedCallback = () => {
      if (this.canControlPlayback()) {
        console.log('[SyncEngine] Video ended, requesting next in queue');
        this.socketClient.emit('queue_play_next');
      }
    };
  }

  // 2. Bind Socket Events from Server
  bindSocketEvents() {
    // Remote play received
    this.socketClient.on('sync_play', ({ currentTime, serverTime, playbackRate, isAutoResume, nickname }) => {
      console.log('[SyncEngine] Received remote play at', currentTime, 'from', nickname);
      this.isServerPaused = false;
      this.masterTime = currentTime || 0;
      this.lastMasterUpdate = Date.now();
      if (playbackRate) {
        this.serverPlaybackRate = playbackRate;
        this.player.setPlaybackRate(playbackRate);
      }

      this.setRemoteActionFlag();

      // Check if current position needs correction before starting
      const clientCurrent = this.player.getCurrentTime();
      if (Math.abs(clientCurrent - currentTime) > 0.5) {
        this.player.seekTo(currentTime);
      }

      this.player.play();

      if (isAutoResume && window.ui) {
        window.ui.showToast('Buffer cleared. Video resumed!', 'info');
      }
    });

    // Remote pause received
    this.socketClient.on('sync_pause', ({ currentTime, isAutoPause, bufferingUser, nickname }) => {
      console.log('[SyncEngine] Received remote pause at', currentTime, 'isAutoPause:', isAutoPause);
      this.isServerPaused = true;
      this.masterTime = currentTime || this.player.getCurrentTime();
      this.lastMasterUpdate = Date.now();

      this.setRemoteActionFlag();
      this.player.pause();

      if (typeof currentTime === 'number' && !isNaN(currentTime)) {
        const clientCurrent = this.player.getCurrentTime();
        if (Math.abs(clientCurrent - currentTime) > 0.5) {
          this.player.seekTo(currentTime);
        }
      }

      if (isAutoPause && window.ui) {
        window.ui.showToast(`${bufferingUser || 'A friend'} is buffering... auto-paused`, 'warning');
      }
    });

    // Remote seek received
    this.socketClient.on('sync_seek', ({ currentTime, paused, nickname }) => {
      console.log('[SyncEngine] Received remote seek to', currentTime);
      this.masterTime = currentTime;
      this.lastMasterUpdate = Date.now();

      this.setRemoteActionFlag();
      this.player.seekTo(currentTime);

      if (paused) {
        this.player.pause();
      }
    });

    // Remote playback rate received
    this.socketClient.on('sync_rate', ({ playbackRate, currentTime }) => {
      console.log('[SyncEngine] Received remote speed change to', playbackRate);
      this.serverPlaybackRate = playbackRate;
      this.setRemoteActionFlag();
      this.player.setPlaybackRate(playbackRate);
      if (typeof currentTime === 'number') {
        this.player.seekTo(currentTime);
      }
    });

    // Heartbeat update -> compute drift against master clock
    this.socketClient.on('heartbeat_update', ({ ping, serverTime, masterTime, isPaused, playbackRate }) => {
      this.clientLatency = ping;
      this.isServerPaused = isPaused;
      this.serverPlaybackRate = playbackRate || 1;
      this.masterTime = masterTime;
      this.lastMasterUpdate = Date.now();

      this.evaluateDrift();
    });

    // Buffer notice from room
    this.socketClient.on('buffer_notice', ({ status, message, bufferingList }) => {
      if (window.ui) {
        window.ui.updateBufferPill(status === 'buffering', message);
      }
    });
  }

  // Calculate estimated current master timestamp taking into account elapsed time and rate
  calculateEstimatedMasterTime() {
    if (this.isServerPaused) {
      return this.masterTime;
    }
    const elapsedSeconds = (Date.now() - this.lastMasterUpdate) / 1000;
    return this.masterTime + elapsedSeconds * this.serverPlaybackRate;
  }

  // Smart Drift Correction Algorithm
  evaluateDrift() {
    // If user is actively seeking or remote action is active, skip drift check
    if (this.isRemoteAction || this.isSeekingByUser) return;

    // Do not check drift too frequently
    const now = Date.now();
    if (now - this.lastDriftCheck < 1800) return;
    this.lastDriftCheck = now;

    const clientTime = this.player.getCurrentTime();
    const expectedMasterTime = this.calculateEstimatedMasterTime();

    // Check pause state divergence
    const clientPaused = this.player.isPaused();
    if (clientPaused !== this.isServerPaused) {
      this.setRemoteActionFlag();
      if (this.isServerPaused) {
        this.player.pause();
        this.player.seekTo(expectedMasterTime);
      } else {
        this.player.seekTo(expectedMasterTime);
        this.player.play();
      }
      return;
    }

    // Check timestamp drift
    const driftDelta = Math.abs(clientTime - expectedMasterTime);
    if (driftDelta > this.DRIFT_THRESHOLD_SECONDS) {
      console.warn(`[SyncEngine] Drift detected: ${driftDelta.toFixed(2)}s > ${this.DRIFT_THRESHOLD_SECONDS}s. Resyncing...`);
      this.setRemoteActionFlag();
      this.player.seekTo(expectedMasterTime);

      if (!this.isServerPaused && this.player.isPaused()) {
        this.player.play();
      }

      if (window.ui) {
        window.ui.showToast(`Synced to master clock (drift was ${driftDelta.toFixed(1)}s)`, 'info');
      }
    }
  }

  // Direct manual seek helper for UI timeline scrubbing
  userSeekTo(targetSeconds) {
    this.isSeekingByUser = true;
    this.player.seekTo(targetSeconds);
    setTimeout(() => {
      this.isSeekingByUser = false;
      if (this.canControlPlayback()) {
        this.socketClient.emit('sync_seek', { currentTime: targetSeconds });
      }
    }, 150);
  }
}

window.syncEngine = new SyncEngine();
