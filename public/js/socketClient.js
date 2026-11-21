/**
 * SocketClient - Real-Time Socket.IO Client Wrapper
 * Handles room connectivity, latency measurement (heartbeat ping), and event dispatching.
 */

class SocketClient {
  constructor() {
    this.socket = null;
    this.ping = 0;
    this.pingInterval = null;
    this.callbacks = new Map();
    this.connected = false;
  }

  connect() {
    if (this.socket) return this.socket;

    // Connect to current origin
    this.socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      this.connected = true;
      console.log('[Socket] Connected to server with ID:', this.socket.id);
      this.startHeartbeat();
      this.emitInternal('connect', this.socket.id);
    });

    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      console.warn('[Socket] Disconnected:', reason);
      this.stopHeartbeat();
      this.emitInternal('disconnect', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      this.emitInternal('connect_error', err);
    });

    // Pong response from server
    this.socket.on('heartbeat_pong', ({ clientTime, serverTime, masterTime, isPaused, playbackRate, currentVideoUrl }) => {
      const now = Date.now();
      const rtt = Math.max(1, now - clientTime);
      this.ping = Math.round(rtt / 2);

      // Report ping back to server for room participant list
      this.socket.emit('report_ping', { ping: this.ping });

      // Dispatch to sync engine for clock drift evaluation
      this.emitInternal('heartbeat_update', {
        ping: this.ping,
        serverTime,
        masterTime,
        isPaused,
        playbackRate,
        currentVideoUrl
      });
    });

    return this.socket;
  }

  startHeartbeat() {
    this.stopHeartbeat();
    // Heartbeat every 2.5 seconds
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('heartbeat_ping', { clientTime: Date.now() });
      }
    }, 2500);
    // Initial immediate ping
    if (this.socket && this.socket.connected) {
      this.socket.emit('heartbeat_ping', { clientTime: Date.now() });
    }
  }

  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  on(event, handler) {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, []);
      // Delegate to socket if connected
      if (this.socket) {
        this.socket.on(event, (...args) => {
          this.emitInternal(event, ...args);
        });
      }
    }
    this.callbacks.get(event).push(handler);
  }

  emitInternal(event, ...args) {
    const handlers = this.callbacks.get(event);
    if (handlers) {
      handlers.forEach((h) => {
        try {
          h(...args);
        } catch (e) {
          console.error(`Error in event handler for ${event}:`, e);
        }
      });
    }
  }

  emit(event, data, callback) {
    if (!this.socket) {
      console.warn('[Socket] Cannot emit, socket not initialized:', event);
      return;
    }
    this.socket.emit(event, data, callback);
  }

  getSocketId() {
    return this.socket?.id || null;
  }
}

window.socketClient = new SocketClient();
