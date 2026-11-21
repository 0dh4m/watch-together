/**
 * Subtitles & Closed Captions Engine
 * Supports:
 * 1. Parsing .srt and .vtt subtitle files
 * 2. Delay & sync offset adjustment (+/- 0.5s)
 * 3. Custom subtitle typography & styling (colors, sizes, backgrounds)
 * 4. Room subtitle synchronization via WebSockets
 */

class SubtitleManager {
  constructor() {
    this.cues = [];
    this.offsetSeconds = 0; // Delay adjustment (+/- seconds)
    this.container = null;
    this.activeCue = null;
    this.checkTimer = null;
    this.fontSize = 'text-lg'; // 'text-sm' | 'text-lg' | 'text-2xl'
    this.textColor = '#ffffff';
    this.hasBackground = true;
    this.isEnabled = true;
  }

  init({ containerId }) {
    this.container = document.getElementById(containerId);
    this.startTracker();
    this.bindSocketEvents();
  }

  bindSocketEvents() {
    window.socketClient.on('subtitles_synced', ({ subtitles }) => {
      if (subtitles && subtitles.content) {
        this.loadSubtitleText(subtitles.content, subtitles.format, subtitles.label, false);
      }
    });
  }

  startTracker() {
    if (this.checkTimer) clearInterval(this.checkTimer);
    this.checkTimer = setInterval(() => {
      this.updateActiveCue();
    }, 100);
  }

  // Parse SRT format
  parseSRT(data) {
    const cues = [];
    const normalized = data.replace(/\r\n|\r/g, '\n').trim();
    const blocks = normalized.split('\n\n');

    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines.length < 2) continue;

      let timeLineIndex = 1;
      // Some files have index numbers, some don't
      if (lines[0].includes('-->')) {
        timeLineIndex = 0;
      }

      const timeLine = lines[timeLineIndex];
      if (!timeLine || !timeLine.includes('-->')) continue;

      const [startStr, endStr] = timeLine.split('-->').map(s => s.trim());
      const start = this.timeToSeconds(startStr);
      const end = this.timeToSeconds(endStr);
      const text = lines.slice(timeLineIndex + 1).join('<br>').trim();

      if (!isNaN(start) && !isNaN(end) && text) {
        cues.push({ start, end, text });
      }
    }
    return cues;
  }

  // Parse VTT format
  parseVTT(data) {
    // Strip WEBVTT header
    const cleanData = data.replace(/^WEBVTT[^\n]*\n+/i, '');
    return this.parseSRT(cleanData);
  }

  timeToSeconds(timeStr) {
    if (!timeStr) return NaN;
    // Replace comma with dot for milliseconds: 00:01:20,500 -> 00:01:20.500
    const clean = timeStr.replace(',', '.');
    const parts = clean.split(':').map(parseFloat);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return parseFloat(clean);
  }

  loadSubtitleFile(file, broadcast = true) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const format = file.name.endsWith('.vtt') ? 'vtt' : 'srt';
      this.loadSubtitleText(content, format, file.name, broadcast);
    };
    reader.readAsText(file);
  }

  loadSubtitleText(content, format = 'srt', label = 'Custom Subtitles', broadcast = true) {
    if (format === 'vtt' || content.startsWith('WEBVTT')) {
      this.cues = this.parseVTT(content);
    } else {
      this.cues = this.parseSRT(content);
    }

    this.offsetSeconds = 0;
    this.updateOffsetDisplay();

    if (broadcast) {
      window.socketClient.emit('sync_subtitles', {
        content,
        format,
        label
      });
    }

    if (window.ui) {
      window.ui.showToast(`Loaded ${this.cues.length} subtitles cues (${label})`, 'success');
      const badge = document.getElementById('subtitles-active-badge');
      if (badge) badge.classList.remove('hidden');
    }
  }

  adjustOffset(deltaSeconds) {
    this.offsetSeconds += deltaSeconds;
    this.updateOffsetDisplay();
    if (window.ui) {
      window.ui.showToast(`Subtitle sync offset: ${this.offsetSeconds > 0 ? '+' : ''}${this.offsetSeconds.toFixed(1)}s`, 'info');
    }
  }

  resetOffset() {
    this.offsetSeconds = 0;
    this.updateOffsetDisplay();
  }

  updateOffsetDisplay() {
    const el = document.getElementById('subtitle-offset-val');
    if (el) {
      el.textContent = `${this.offsetSeconds > 0 ? '+' : ''}${this.offsetSeconds.toFixed(1)}s`;
    }
  }

  updateActiveCue() {
    if (!this.container || !this.isEnabled || this.cues.length === 0) {
      if (this.container && this.container.innerHTML !== '') {
        this.container.innerHTML = '';
      }
      return;
    }

    const currentMediaTime = window.unifiedPlayer.getCurrentTime();
    const effectiveTime = currentMediaTime + this.offsetSeconds;

    const matchedCue = this.cues.find(cue => effectiveTime >= cue.start && effectiveTime <= cue.end);

    if (matchedCue !== this.activeCue) {
      this.activeCue = matchedCue;
      if (matchedCue) {
        this.renderCue(matchedCue.text);
      } else {
        this.container.innerHTML = '';
      }
    }
  }

  renderCue(text) {
    const bgClass = this.hasBackground ? 'bg-black/85 px-4 py-1.5 rounded-xl backdrop-blur-sm' : '';
    this.container.innerHTML = `
      <div class="inline-block max-w-[85%] text-center ${this.fontSize} font-medium leading-snug tracking-wide shadow-2xl transition-all duration-150 ${bgClass}" style="color: ${this.textColor}; text-shadow: 0 2px 8px rgba(0,0,0,0.9);">
        ${text}
      </div>
    `;
  }

  setFontSize(sizeClass) {
    this.fontSize = sizeClass;
    if (this.activeCue) this.renderCue(this.activeCue.text);
  }

  setTextColor(colorHex) {
    this.textColor = colorHex;
    if (this.activeCue) this.renderCue(this.activeCue.text);
  }

  toggleBackground() {
    this.hasBackground = !this.hasBackground;
    if (this.activeCue) this.renderCue(this.activeCue.text);
  }

  toggleEnabled() {
    this.isEnabled = !this.isEnabled;
    if (!this.isEnabled && this.container) {
      this.container.innerHTML = '';
    }
    return this.isEnabled;
  }
}

window.subtitles = new SubtitleManager();
