/**
 * Integrated Peer-to-Peer WebRTC Voice Chat
 * Provides:
 * 1. Low-latency P2P mesh audio rooms using Socket.IO signaling
 * 2. Mute/Unmute & Push-to-Talk (Spacebar hold)
 * 3. Web Audio API Analyser for real-time speech level detection & glowing avatar ring
 * 4. Individual participant volume adjustments
 */

class VoiceChat {
  constructor() {
    this.socketClient = null;
    this.inVoice = false;
    this.isMuted = false;
    this.isPushToTalk = false;
    this.isSpacePressed = false;

    this.localStream = null;
    this.audioContext = null;
    this.analyser = null;
    this.speechCheckTimer = null;
    this.isSpeaking = false;
    this.silenceCounter = 0;

    /**
     * Map of remoteSocketId => { peerConnection, audioEl, volume }
     * @type {Map<string, Object>}
     */
    this.peers = new Map();

    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };
  }

  init({ socketClient }) {
    this.socketClient = socketClient;
    this.bindSocketEvents();
    this.setupPushToTalkListeners();
  }

  bindSocketEvents() {
    // Another peer joined voice channel -> create offer
    this.socketClient.on('webrtc_peer_joined', async ({ socketId, nickname }) => {
      if (!this.inVoice || !this.localStream) return;
      console.log('[VoiceChat] Remote peer joined voice:', nickname, socketId);
      await this.initiatePeerConnection(socketId, true);
    });

    // Remote peer left voice
    this.socketClient.on('webrtc_peer_left', ({ socketId }) => {
      this.closePeerConnection(socketId);
    });

    // Offer received
    this.socketClient.on('webrtc_offer', async ({ from, offer }) => {
      if (!this.inVoice) return;
      console.log('[VoiceChat] Received offer from', from);
      let peerObj = this.peers.get(from);
      if (!peerObj) {
        peerObj = await this.initiatePeerConnection(from, false);
      }
      try {
        await peerObj.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerObj.peerConnection.createAnswer();
        await peerObj.peerConnection.setLocalDescription(answer);

        this.socketClient.emit('webrtc_answer', {
          to: from,
          answer
        });
      } catch (err) {
        console.error('[VoiceChat] Error handling offer:', err);
      }
    });

    // Answer received
    this.socketClient.on('webrtc_answer', async ({ from, answer }) => {
      const peerObj = this.peers.get(from);
      if (peerObj && peerObj.peerConnection) {
        try {
          await peerObj.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('[VoiceChat] Error setting remote description from answer:', err);
        }
      }
    });

    // ICE Candidate received
    this.socketClient.on('webrtc_ice_candidate', async ({ from, candidate }) => {
      const peerObj = this.peers.get(from);
      if (peerObj && peerObj.peerConnection && candidate) {
        try {
          await peerObj.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn('[VoiceChat] Error adding ICE candidate:', err);
        }
      }
    });

    // Remote peer speaking status changed
    this.socketClient.on('speaking_state_changed', ({ socketId, isSpeaking }) => {
      if (window.ui) {
        window.ui.setParticipantSpeaking(socketId, isSpeaking);
      }
    });
  }

  // Join Voice Channel
  async joinVoice() {
    if (this.inVoice) return true;

    try {
      // Request mic permission
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      this.inVoice = true;
      this.isMuted = false;

      // Setup audio analyzer for speech detection
      this.setupAudioAnalyser(this.localStream);

      // If Push-To-Talk is on, mute track initially
      if (this.isPushToTalk) {
        this.setMicEnabled(false);
      } else {
        this.setMicEnabled(true);
      }

      // Notify room via socket
      this.socketClient.emit('voice_join');

      if (window.ui) {
        window.ui.updateVoiceUI(true, this.isMuted, this.isPushToTalk);
        window.ui.showToast('Joined voice channel', 'success');
      }
      return true;
    } catch (err) {
      console.error('[VoiceChat] Failed to access microphone:', err);
      if (window.ui) {
        window.ui.showToast('Microphone access denied or unavailable', 'error');
      }
      return false;
    }
  }

  // Leave Voice Channel
  leaveVoice() {
    if (!this.inVoice) return;

    this.inVoice = false;

    // Stop speaking detection
    if (this.speechCheckTimer) {
      clearInterval(this.speechCheckTimer);
      this.speechCheckTimer = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    // Stop all audio tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    // Close all peer connections
    for (const socketId of this.peers.keys()) {
      this.closePeerConnection(socketId);
    }
    this.peers.clear();

    // Signal room
    this.socketClient.emit('voice_leave');
    this.setSpeaking(false);

    if (window.ui) {
      window.ui.updateVoiceUI(false, false, this.isPushToTalk);
      window.ui.showToast('Left voice channel', 'info');
    }
  }

  // Create RTCPeerConnection for a remote peer
  async initiatePeerConnection(targetSocketId, isInitiator = false) {
    if (this.peers.has(targetSocketId)) {
      this.closePeerConnection(targetSocketId);
    }

    const pc = new RTCPeerConnection(this.rtcConfig);

    // Audio element to play remote stream
    const audioEl = new Audio();
    audioEl.autoplay = true;

    // Add local tracks
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    // Remote audio track received
    pc.ontrack = (event) => {
      console.log('[VoiceChat] Received remote audio stream from', targetSocketId);
      if (event.streams && event.streams[0]) {
        audioEl.srcObject = event.streams[0];
      }
    };

    // Send ICE candidates to remote peer via socket
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socketClient.emit('webrtc_ice_candidate', {
          to: targetSocketId,
          candidate: event.candidate
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.closePeerConnection(targetSocketId);
      }
    };

    const peerObj = {
      peerConnection: pc,
      audioEl,
      volume: 1.0
    };
    this.peers.set(targetSocketId, peerObj);

    // If caller, generate offer
    if (isInitiator) {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true
        });
        await pc.setLocalDescription(offer);

        this.socketClient.emit('webrtc_offer', {
          to: targetSocketId,
          offer
        });
      } catch (err) {
        console.error('[VoiceChat] Error creating offer:', err);
      }
    }

    return peerObj;
  }

  closePeerConnection(socketId) {
    const peerObj = this.peers.get(socketId);
    if (peerObj) {
      if (peerObj.peerConnection) {
        peerObj.peerConnection.close();
      }
      if (peerObj.audioEl) {
        peerObj.audioEl.srcObject = null;
      }
      this.peers.delete(socketId);
    }
  }

  // Adjust volume for an individual participant
  setPeerVolume(socketId, volumeRatio) {
    const peerObj = this.peers.get(socketId);
    if (peerObj && peerObj.audioEl) {
      const vol = Math.min(1.0, Math.max(0, volumeRatio));
      peerObj.volume = vol;
      peerObj.audioEl.volume = vol;
    }
  }

  // Toggle Mute
  toggleMute() {
    if (!this.inVoice) return;
    this.isMuted = !this.isMuted;
    this.setMicEnabled(!this.isMuted);

    if (window.ui) {
      window.ui.updateVoiceUI(this.inVoice, this.isMuted, this.isPushToTalk);
      window.ui.showToast(this.isMuted ? 'Microphone Muted' : 'Microphone Unmuted', 'info');
    }
  }

  // Toggle Push-to-Talk
  togglePushToTalk(enabled) {
    this.isPushToTalk = Boolean(enabled);
    if (this.inVoice) {
      if (this.isPushToTalk) {
        this.setMicEnabled(false);
      } else {
        this.setMicEnabled(!this.isMuted);
      }
      if (window.ui) {
        window.ui.updateVoiceUI(this.inVoice, this.isMuted, this.isPushToTalk);
      }
    }
  }

  setMicEnabled(enabled) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
    if (!enabled) {
      this.setSpeaking(false);
    }
  }

  // Push-to-Talk keyboard handlers
  setupPushToTalkListeners() {
    window.addEventListener('keydown', (e) => {
      // Spacebar hold for push-to-talk, only when not typing in chat or input
      if (e.code === 'Space' && this.inVoice && this.isPushToTalk && !this.isSpacePressed) {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag === 'input' || activeTag === 'textarea') return;

        e.preventDefault();
        this.isSpacePressed = true;
        this.setMicEnabled(true);
        if (window.ui) window.ui.updatePushToTalkIndicator(true);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && this.inVoice && this.isPushToTalk && this.isSpacePressed) {
        this.isSpacePressed = false;
        this.setMicEnabled(false);
        if (window.ui) window.ui.updatePushToTalkIndicator(false);
      }
    });
  }

  // Speech Detection via Web Audio API
  setupAudioAnalyser(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      this.speechCheckTimer = setInterval(() => {
        if (!this.inVoice || this.isMuted || (this.isPushToTalk && !this.isSpacePressed)) {
          if (this.isSpeaking) this.setSpeaking(false);
          return;
        }

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;

        // Visual speech threshold
        const speakingThreshold = 18;
        if (average > speakingThreshold) {
          this.silenceCounter = 0;
          if (!this.isSpeaking) {
            this.setSpeaking(true);
          }
        } else {
          this.silenceCounter++;
          // 3 checks of silence (~300ms) before turning off speaking indicator
          if (this.silenceCounter >= 3 && this.isSpeaking) {
            this.setSpeaking(false);
          }
        }
      }, 100);
    } catch (e) {
      console.warn('[VoiceChat] Web Audio API analyser not supported:', e);
    }
  }

  setSpeaking(speaking) {
    this.isSpeaking = speaking;
    this.socketClient.emit('voice_speaking_state', { isSpeaking: speaking });
    if (window.ui) {
      window.ui.setMySpeakingStatus(speaking);
    }
  }
}

window.voiceChat = new VoiceChat();
