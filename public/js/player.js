/**
 * Unified Video Player Wrapper
 * Supports:
 * 1. YouTube (via YouTube IFrame Player API)
 * 2. Direct Video Links (.mp4, .webm, .mkv, .ogg)
 * 3. HLS Streams (.m3u8 via Hls.js)
 * 4. Local File Sync (zero-upload blob playback)
 */

class UnifiedPlayer {
  constructor() {
    this.currentType = null; // 'youtube' | 'direct' | 'hls' | 'local' | 'embed'
    this.currentUrl = null;
    this.ytPlayer = null;
    this.isYtReady = false;
    this.videoEl = null; // HTML5 video element
    this.embedEl = null; // Universal iframe embed element
    this.hlsInstance = null;
    this.localFile = null;
    this.volume = 1.0;
    this.playbackRate = 1.0;

    // Callbacks for sync engine
    this.onPlayCallback = null;
    this.onPauseCallback = null;
    this.onSeekCallback = null;
    this.onTimeUpdateCallback = null;
    this.onBufferingCallback = null;
    this.onEndedCallback = null;
    this.onErrorCallback = null;

    // Interval for tracking playback position
    this.timeUpdateTimer = null;
  }

  init({ videoElementId, ytContainerId, embedElementId = 'embed-player' }) {
    this.videoEl = document.getElementById(videoElementId);
    this.embedEl = document.getElementById(embedElementId);
    this.ytContainerId = ytContainerId;

    this.setupHtml5Listeners();
    this.setupYouTubeAPI();
    this.startTimeTracker();
  }

  // YouTube IFrame API initialization
  setupYouTubeAPI() {
    // Check if YT is already loaded
    if (window.YT && window.YT.Player) {
      this.initYouTubePlayer();
      return;
    }

    // Define global callback if not present
    const prevInit = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevInit) prevInit();
      this.initYouTubePlayer();
    };

    // Load iframe API script if not already present
    if (!document.getElementById('yt-iframe-script')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
  }

  initYouTubePlayer() {
    if (this.ytPlayer) return;

    this.ytPlayer = new window.YT.Player(this.ytContainerId, {
      height: '100%',
      width: '100%',
      playerVars: {
        autoplay: 0,
        controls: 0, // Custom controls for unified look
        rel: 0,
        modestbranding: 1,
        disablekb: 1,
        enablejsapi: 1,
        origin: window.location.origin
      },
      events: {
        onReady: (event) => {
          this.isYtReady = true;
          console.log('[Player] YouTube IFrame Player Ready');
          if (this.currentType === 'youtube' && this.currentUrl) {
            const videoId = this.extractYouTubeId(this.currentUrl);
            if (videoId) {
              this.ytPlayer.cueVideoById(videoId);
            }
          }
        },
        onStateChange: (event) => {
          this.handleYouTubeStateChange(event.data);
        },
        onError: (event) => {
          console.error('[Player] YouTube Player Error:', event.data);
          if (this.onErrorCallback) this.onErrorCallback('YouTube playback error: ' + event.data);
        }
      }
    });
  }

  handleYouTubeStateChange(state) {
    if (this.currentType !== 'youtube') return;

    // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
    if (state === window.YT.PlayerState.PLAYING) {
      if (this.onBufferingCallback) this.onBufferingCallback(false);
      if (this.onPlayCallback) this.onPlayCallback(this.getCurrentTime());
    } else if (state === window.YT.PlayerState.PAUSED) {
      if (this.onBufferingCallback) this.onBufferingCallback(false);
      if (this.onPauseCallback) this.onPauseCallback(this.getCurrentTime());
    } else if (state === window.YT.PlayerState.BUFFERING) {
      if (this.onBufferingCallback) this.onBufferingCallback(true);
    } else if (state === window.YT.PlayerState.ENDED) {
      if (this.onEndedCallback) this.onEndedCallback();
    }
  }

  setupHtml5Listeners() {
    if (!this.videoEl) return;

    this.videoEl.addEventListener('play', () => {
      if (this.currentType === 'youtube') return;
      if (this.onBufferingCallback) this.onBufferingCallback(false);
      if (this.onPlayCallback) this.onPlayCallback(this.videoEl.currentTime);
    });

    this.videoEl.addEventListener('pause', () => {
      if (this.currentType === 'youtube') return;
      if (this.onBufferingCallback) this.onBufferingCallback(false);
      if (this.onPauseCallback) this.onPauseCallback(this.videoEl.currentTime);
    });

    this.videoEl.addEventListener('seeking', () => {
      if (this.currentType === 'youtube') return;
      if (this.onBufferingCallback) this.onBufferingCallback(true);
    });

    this.videoEl.addEventListener('seeked', () => {
      if (this.currentType === 'youtube') return;
      if (this.onBufferingCallback) this.onBufferingCallback(false);
      if (this.onSeekCallback) this.onSeekCallback(this.videoEl.currentTime);
    });

    this.videoEl.addEventListener('waiting', () => {
      if (this.currentType === 'youtube') return;
      if (this.onBufferingCallback) this.onBufferingCallback(true);
    });

    this.videoEl.addEventListener('playing', () => {
      if (this.currentType === 'youtube') return;
      if (this.onBufferingCallback) this.onBufferingCallback(false);
    });

    this.videoEl.addEventListener('ended', () => {
      if (this.currentType === 'youtube') return;
      if (this.onEndedCallback) this.onEndedCallback();
    });

    this.videoEl.addEventListener('error', (e) => {
      if (this.currentType === 'youtube') return;
      console.warn('[Player] HTML5 video error:', this.videoEl.error);
      if (this.onErrorCallback) this.onErrorCallback('Media format or network error');
    });
  }

  startTimeTracker() {
    if (this.timeUpdateTimer) clearInterval(this.timeUpdateTimer);
    this.timeUpdateTimer = setInterval(() => {
      const cur = this.getCurrentTime();
      const dur = this.getDuration();
      if (this.onTimeUpdateCallback && (dur > 0 || cur > 0)) {
        this.onTimeUpdateCallback(cur, dur);
      }
    }, 250);
  }

  // URL parsing helper for YouTube
  extractYouTubeId(url) {
    if (!url) return null;
    const cleanUrl = url.trim();
    // Already an 11-char ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(cleanUrl)) return cleanUrl;

    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
    const match = cleanUrl.match(regex);
    return match ? match[1] : null;
  }

  // Extract embed URL or convert popular platforms (Vimeo, Twitch, Dailymotion, Streamable)
  extractEmbedUrl(input) {
    if (!input) return null;
    const clean = input.trim();

    // Check if user pasted an <iframe> snippet
    const iframeMatch = clean.match(/src=["']([^"']+)["']/i);
    if (iframeMatch) {
      return iframeMatch[1];
    }

    // Vimeo
    const vimeoMatch = clean.match(/(?:vimeo\.com\/)(\d+)/i);
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;
    }

    // Twitch Channel
    const twitchChannelMatch = clean.match(/(?:twitch\.tv\/)([a-zA-Z0-9_]+)/i);
    if (twitchChannelMatch && !clean.includes('/videos/')) {
      const parent = window.location.hostname || 'localhost';
      return `https://player.twitch.tv/?channel=${twitchChannelMatch[1]}&parent=${parent}&autoplay=true`;
    }
    // Twitch Video
    const twitchVideoMatch = clean.match(/(?:twitch\.tv\/videos\/)(\d+)/i);
    if (twitchVideoMatch) {
      const parent = window.location.hostname || 'localhost';
      return `https://player.twitch.tv/?video=${twitchVideoMatch[1]}&parent=${parent}&autoplay=true`;
    }

    // Dailymotion
    const dailyMatch = clean.match(/(?:dailymotion\.com\/video\/)([a-zA-Z0-9]+)/i);
    if (dailyMatch) {
      return `https://www.dailymotion.com/embed/video/${dailyMatch[1]}?autoplay=1`;
    }

    // Streamable
    const streamableMatch = clean.match(/(?:streamable\.com\/)([a-zA-Z0-9]+)/i);
    if (streamableMatch) {
      return `https://streamable.com/e/${streamableMatch[1]}?autoplay=1`;
    }

    return clean;
  }

  // Detect media type from URL
  detectType(url) {
    if (!url) return 'direct';
    const clean = url.trim().toLowerCase();
    if (clean.includes('youtube.com') || clean.includes('youtu.be')) {
      return 'youtube';
    }
    if (clean.includes('.m3u8')) {
      return 'hls';
    }
    if (clean.includes('vimeo.com') || clean.includes('twitch.tv') || clean.includes('dailymotion.com') || clean.includes('streamable.com') || clean.includes('/embed/') || clean.includes('<iframe')) {
      return 'embed';
    }
    return 'direct';
  }

  // Switch source seamlessly
  loadSource({ type, url, startTime = 0, file = null }) {
    this.currentType = type || this.detectType(url);
    this.currentUrl = url;
    this.localFile = file;

    const ytEl = document.getElementById(this.ytContainerId);
    const videoEl = this.videoEl;
    const embedEl = this.embedEl;

    // Destroy any previous HLS instance
    if (this.hlsInstance) {
      this.hlsInstance.destroy();
      this.hlsInstance = null;
    }

    // Embed Mode (Vimeo, Twitch, Dailymotion, Streamable, Web Embeds)
    if (this.currentType === 'embed') {
      if (ytEl) {
        if (this.isYtReady && this.ytPlayer && typeof this.ytPlayer.stopVideo === 'function') {
          this.ytPlayer.stopVideo();
        }
        ytEl.style.display = 'none';
      }
      if (videoEl) {
        videoEl.pause();
        videoEl.style.display = 'none';
        videoEl.src = '';
      }
      if (embedEl) {
        embedEl.style.display = 'block';
        embedEl.src = this.extractEmbedUrl(url);
      }
      return;
    }

    // Hide embed when not in embed mode
    if (embedEl) {
      embedEl.style.display = 'none';
      embedEl.src = '';
    }

    if (this.currentType === 'youtube') {
      // Show YouTube container, hide HTML5 video
      if (ytEl) ytEl.style.display = 'block';
      if (videoEl) {
        videoEl.pause();
        videoEl.style.display = 'none';
        videoEl.src = '';
      }

      const videoId = this.extractYouTubeId(url);
      if (this.isYtReady && this.ytPlayer && videoId) {
        this.ytPlayer.loadVideoById({
          videoId: videoId,
          startSeconds: startTime || 0
        });
        this.ytPlayer.pauseVideo();
      }
    } else {
      // Hide YouTube container, show HTML5 video
      if (ytEl) {
        if (this.isYtReady && this.ytPlayer && typeof this.ytPlayer.stopVideo === 'function') {
          this.ytPlayer.stopVideo();
        }
        ytEl.style.display = 'none';
      }
      if (videoEl) {
        videoEl.style.display = 'block';
      }

      if (this.currentType === 'local' && file) {
        // Zero-upload local blob URL
        const blobUrl = URL.createObjectURL(file);
        videoEl.src = blobUrl;
        videoEl.currentTime = startTime || 0;
        videoEl.load();
      } else if (this.currentType === 'hls') {
        // HLS adaptive stream
        if (window.Hls && window.Hls.isSupported()) {
          this.hlsInstance = new window.Hls({
            enableWorker: true,
            lowLatencyMode: true
          });
          this.hlsInstance.loadSource(url);
          this.hlsInstance.attachMedia(videoEl);
          this.hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
            if (startTime > 0) videoEl.currentTime = startTime;
          });
        } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
          // Native Safari HLS
          videoEl.src = url;
          if (startTime > 0) videoEl.currentTime = startTime;
        } else {
          videoEl.src = url;
        }
      } else {
        // Direct link (.mp4, .webm, .mkv)
        videoEl.src = url;
        videoEl.currentTime = startTime || 0;
        videoEl.load();
      }
    }
  }

  // Unified Play
  play() {
    if (this.currentType === 'youtube') {
      if (this.isYtReady && this.ytPlayer && typeof this.ytPlayer.playVideo === 'function') {
        this.ytPlayer.playVideo();
      }
    } else if (this.videoEl) {
      const promise = this.videoEl.play();
      if (promise !== undefined) {
        promise.catch((err) => {
          // Autoplay policy or interaction requirement
          console.warn('[Player] HTML5 play prevented:', err.message);
        });
      }
    }
  }

  // Unified Pause
  pause() {
    if (this.currentType === 'youtube') {
      if (this.isYtReady && this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
        this.ytPlayer.pauseVideo();
      }
    } else if (this.videoEl) {
      this.videoEl.pause();
    }
  }

  // Unified Seek
  seekTo(seconds) {
    const time = Math.max(0, seconds);
    if (this.currentType === 'youtube') {
      if (this.isYtReady && this.ytPlayer && typeof this.ytPlayer.seekTo === 'function') {
        this.ytPlayer.seekTo(time, true);
      }
    } else if (this.videoEl) {
      this.videoEl.currentTime = time;
    }
  }

  // Unified Current Time
  getCurrentTime() {
    if (this.currentType === 'youtube') {
      if (this.isYtReady && this.ytPlayer && typeof this.ytPlayer.getCurrentTime === 'function') {
        return this.ytPlayer.getCurrentTime() || 0;
      }
      return 0;
    } else if (this.videoEl) {
      return this.videoEl.currentTime || 0;
    }
    return 0;
  }

  // Unified Duration
  getDuration() {
    if (this.currentType === 'youtube') {
      if (this.isYtReady && this.ytPlayer && typeof this.ytPlayer.getDuration === 'function') {
        return this.ytPlayer.getDuration() || 0;
      }
      return 0;
    } else if (this.videoEl) {
      return this.videoEl.duration && !isNaN(this.videoEl.duration) ? this.videoEl.duration : 0;
    }
    return 0;
  }

  // Unified Playback Rate
  setPlaybackRate(rate) {
    const clamped = Math.min(2.0, Math.max(0.25, rate));
    this.playbackRate = clamped;
    if (this.currentType === 'youtube') {
      if (this.isYtReady && this.ytPlayer && typeof this.ytPlayer.setPlaybackRate === 'function') {
        this.ytPlayer.setPlaybackRate(clamped);
      }
    } else if (this.videoEl) {
      this.videoEl.playbackRate = clamped;
    }
  }

  getPlaybackRate() {
    return this.playbackRate;
  }

  // Unified Volume
  setVolume(vol) {
    const clamped = Math.min(1.0, Math.max(0, vol));
    this.volume = clamped;
    if (this.currentType === 'youtube') {
      if (this.isYtReady && this.ytPlayer && typeof this.ytPlayer.setVolume === 'function') {
        this.ytPlayer.setVolume(Math.round(clamped * 100));
      }
    } else if (this.videoEl) {
      this.videoEl.volume = clamped;
    }
  }

  getVolume() {
    return this.volume;
  }

  mute() {
    if (this.currentType === 'youtube') {
      if (this.isYtReady && this.ytPlayer && typeof this.ytPlayer.mute === 'function') {
        this.ytPlayer.mute();
      }
    } else if (this.videoEl) {
      this.videoEl.muted = true;
    }
  }

  unmute() {
    if (this.currentType === 'youtube') {
      if (this.isYtReady && this.ytPlayer && typeof this.ytPlayer.unMute === 'function') {
        this.ytPlayer.unMute();
      }
    } else if (this.videoEl) {
      this.videoEl.muted = false;
    }
  }

  isPaused() {
    if (this.currentType === 'youtube') {
      if (this.isYtReady && this.ytPlayer && typeof this.ytPlayer.getPlayerState === 'function') {
        const state = this.ytPlayer.getPlayerState();
        return state !== window.YT.PlayerState.PLAYING;
      }
      return true;
    } else if (this.videoEl) {
      return this.videoEl.paused;
    }
    return true;
  }
}

window.unifiedPlayer = new UnifiedPlayer();
