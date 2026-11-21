/**
 * Live Text Chat, Reply Threads & Floating Screen Reactions
 */

class ChatManager {
  constructor() {
    this.socketClient = null;
    this.chatContainer = null;
    this.messagesList = null;
    this.chatInput = null;
    this.replyBanner = null;
    this.replyTarget = null;
    this.reactionsOverlay = null;
    this.reactionsEnabled = true;

    // Typing indicator state
    this.typingTimeout = null;
    this.isTyping = false;
    this.activeTypers = new Map(); // socketId => nickname

    // Available reaction emojis
    this.reactions = ['😂', '❤️', '🔥', '😱', '👏', '💀', '🎉', '🍿'];
  }

  init({ socketClient, messagesListId, chatInputId, replyBannerId, reactionsOverlayId }) {
    this.socketClient = socketClient;
    this.messagesList = document.getElementById(messagesListId);
    this.chatInput = document.getElementById(chatInputId);
    this.replyBanner = document.getElementById(replyBannerId);
    this.reactionsOverlay = document.getElementById(reactionsOverlayId);

    this.bindSocketEvents();
    this.setupInputHandlers();
  }

  bindSocketEvents() {
    // New incoming chat message
    this.socketClient.on('new_message', (msg) => {
      this.appendMessage(msg);
      if (window.sfx) {
        if (msg.isSystem) {
          if (msg.text.includes('joined')) window.sfx.playJoinChime();
          else if (msg.text.includes('left')) window.sfx.playLeaveChime();
        } else {
          window.sfx.playMessagePop();
        }
      }
    });

    // New floating reaction
    this.socketClient.on('new_reaction', ({ emoji, sender }) => {
      if (this.reactionsEnabled) {
        this.spawnFloatingReaction(emoji, sender);
      }
      if (window.sfx) window.sfx.playReactionChime();
    });

    // Typing status
    this.socketClient.on('user_typing', ({ socketId, nickname, isTyping }) => {
      if (isTyping) {
        this.activeTypers.set(socketId, nickname);
      } else {
        this.activeTypers.delete(socketId);
      }
      this.renderTypingIndicator();
    });
  }

  setupInputHandlers() {
    if (!this.chatInput) return;

    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
        this.stopTyping();
      }
    });

    this.chatInput.addEventListener('input', () => {
      this.handleTyping();
    });
  }

  handleTyping() {
    if (!this.isTyping) {
      this.isTyping = true;
      this.socketClient.emit('typing_state', { isTyping: true });
    }

    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.stopTyping();
    }, 1800);
  }

  stopTyping() {
    if (this.isTyping) {
      this.isTyping = false;
      this.socketClient.emit('typing_state', { isTyping: false });
    }
  }

  renderTypingIndicator() {
    let indicatorEl = document.getElementById('chat-typing-indicator');
    if (!indicatorEl) {
      indicatorEl = document.createElement('div');
      indicatorEl.id = 'chat-typing-indicator';
      indicatorEl.className = 'text-[11px] text-zinc-400 italic px-3 py-1 flex items-center gap-1.5 transition-all';
      if (this.messagesList && this.messagesList.parentNode) {
        this.messagesList.parentNode.insertBefore(indicatorEl, this.messagesList.nextSibling);
      }
    }

    if (this.activeTypers.size === 0) {
      indicatorEl.innerHTML = '';
      indicatorEl.classList.add('hidden');
    } else {
      indicatorEl.classList.remove('hidden');
      const names = Array.from(this.activeTypers.values()).join(', ');
      indicatorEl.innerHTML = `
        <span class="inline-flex gap-1 items-center mr-1">
          <span class="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style="animation-delay: 0.15s"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style="animation-delay: 0.3s"></span>
        </span>
        <span>${this.escapeHtml(names)} ${this.activeTypers.size === 1 ? 'is' : 'are'} typing...</span>
      `;
    }
  }

  // Quick timestamp insertion into chat
  insertCurrentTimestamp() {
    if (!this.chatInput) return;
    const current = window.unifiedPlayer.getCurrentTime();
    const formatted = window.ui.formatDuration(current);
    this.chatInput.value += ` [${formatted}] `;
    this.chatInput.focus();
  }

  // Parse clickable timestamps in chat text
  formatMessageBody(text) {
    const escaped = this.escapeHtml(text);
    // Regex for mm:ss or hh:mm:ss
    const timestampRegex = /\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/g;

    return escaped.replace(timestampRegex, (match, h, m, s) => {
      let seconds = 0;
      if (h) {
        seconds = parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10);
      } else {
        seconds = parseInt(m, 10) * 60 + parseInt(s, 10);
      }

      return `<button onclick="syncEngine.userSeekTo(${seconds})" class="inline-flex items-center gap-1 font-mono text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 px-1.5 py-0.5 rounded text-[11px] font-semibold border border-cyan-500/20 transition cursor-pointer" title="Click to jump to ${match}"><i class="fa-solid fa-play text-[8px]"></i>${match}</button>`;
    });
  }

  sendMessage() {
    if (!this.chatInput) return;
    const text = this.chatInput.value.trim();
    if (!text) return;

    this.socketClient.emit('send_message', {
      text,
      replyTo: this.replyTarget
    });

    this.chatInput.value = '';
    this.clearReply();
  }

  setReply(msg) {
    this.replyTarget = {
      id: msg.id,
      nickname: msg.nickname,
      text: msg.text.slice(0, 80)
    };

    if (this.replyBanner) {
      this.replyBanner.innerHTML = `
        <div class="flex items-center justify-between text-xs text-zinc-300 py-1.5 px-3 bg-zinc-800/80 rounded border-l-2 border-violet-500">
          <div class="truncate">
            <span class="text-violet-400 font-medium">Replying to @${this.escapeHtml(msg.nickname)}:</span>
            <span class="italic text-zinc-400 ml-1">"${this.escapeHtml(this.replyTarget.text)}"</span>
          </div>
          <button onclick="chatManager.clearReply()" class="ml-2 text-zinc-400 hover:text-white transition">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      `;
      this.replyBanner.classList.remove('hidden');
    }
    if (this.chatInput) {
      this.chatInput.focus();
    }
  }

  clearReply() {
    this.replyTarget = null;
    if (this.replyBanner) {
      this.replyBanner.classList.add('hidden');
      this.replyBanner.innerHTML = '';
    }
  }

  loadHistory(messages) {
    if (!this.messagesList) return;
    this.messagesList.innerHTML = '';
    if (Array.isArray(messages)) {
      messages.forEach(m => this.appendMessage(m, false));
      this.scrollToBottom();
    }
  }

  appendMessage(msg, autoScroll = true) {
    if (!this.messagesList) return;

    const div = document.createElement('div');
    const timeStr = this.formatTime(msg.createdAt);

    if (msg.isSystem) {
      // System notification style
      div.className = 'flex justify-center my-1.5 text-center';
      div.innerHTML = `
        <span class="inline-flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-800/60 backdrop-blur-sm px-3 py-1 rounded-full border border-white/5">
          <i class="fa-solid fa-circle-info text-cyan-400 text-[10px]"></i>
          <span>${this.escapeHtml(msg.text)}</span>
          <span class="text-[10px] text-zinc-500 ml-1">${timeStr}</span>
        </span>
      `;
    } else {
      // User message style
      const isMe = msg.userId === (window.app?.currentUser?.id || window.socketClient.getSocketId());
      const avatarSrc = this.getAvatarSvg(msg.avatar);

      div.className = `flex items-start gap-2.5 my-2 group ${isMe ? 'flex-row-reverse' : ''}`;
      
      div.innerHTML = `
        <div class="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm shadow-md border border-white/10 ${this.getAvatarBg(msg.avatar)}">
          ${avatarSrc}
        </div>
        <div class="flex flex-col max-w-[80%] ${isMe ? 'items-end' : 'items-start'}">
          <div class="flex items-center gap-1.5 mb-0.5 text-xs">
            <span class="font-medium ${isMe ? 'text-violet-400' : 'text-cyan-400'}">${this.escapeHtml(msg.nickname)}</span>
            <span class="text-[10px] text-zinc-500">${timeStr}</span>
          </div>

          ${msg.replyTo ? `
            <div class="text-[11px] text-zinc-400 bg-zinc-900/70 border-l-2 border-violet-500/80 px-2 py-0.5 mb-1 rounded">
              <span class="font-medium text-violet-300">@${this.escapeHtml(msg.replyTo.nickname)}:</span> ${this.escapeHtml(msg.replyTo.text)}
            </div>
          ` : ''}

          <div class="relative px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${isMe ? 'bg-violet-600 text-white rounded-tr-none' : 'bg-zinc-800/90 text-zinc-100 rounded-tl-none border border-white/5'}">
            <p class="break-words select-text">${this.formatMessageBody(msg.text)}</p>
          </div>

          <button onclick='chatManager.setReply(${JSON.stringify(msg)})' class="opacity-0 group-hover:opacity-100 text-[10px] text-zinc-400 hover:text-violet-300 mt-0.5 transition flex items-center gap-1">
            <i class="fa-solid fa-reply"></i> Reply
          </button>
        </div>
      `;
    }

    this.messagesList.appendChild(div);
    if (autoScroll) {
      this.scrollToBottom();
    }
  }

  scrollToBottom() {
    if (!this.messagesList) return;
    this.messagesList.scrollTop = this.messagesList.scrollHeight;
  }

  // Floating Reactions Spawner
  sendReaction(emoji) {
    this.socketClient.emit('send_reaction', { emoji });
    // Also trigger locally immediately for responsive feel
    if (this.reactionsEnabled) {
      this.spawnFloatingReaction(emoji, 'You');
    }
  }

  spawnFloatingReaction(emoji, sender) {
    if (!this.reactionsOverlay) return;

    const el = document.createElement('div');
    el.className = 'floating-reaction';
    el.textContent = emoji;

    // Randomize initial horizontal position (15% to 85%)
    const leftPercent = 15 + Math.random() * 70;
    el.style.left = `${leftPercent}%`;

    // Randomize drift amount (-50px to 50px)
    const driftPx = (Math.random() - 0.5) * 100;
    el.style.setProperty('--drift', `${driftPx}px`);

    // Randomize slight tilt rotation (-20deg to 20deg)
    const rotDeg = (Math.random() - 0.5) * 40;
    el.style.setProperty('--rot', `${rotDeg}deg`);

    this.reactionsOverlay.appendChild(el);

    // Remove from DOM after animation completes (3.2 seconds)
    setTimeout(() => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }, 3200);
  }

  toggleReactions() {
    this.reactionsEnabled = !this.reactionsEnabled;
    if (window.ui) {
      window.ui.showToast(this.reactionsEnabled ? 'Floating reactions enabled' : 'Floating reactions hidden', 'info');
      const btn = document.getElementById('btn-toggle-reactions');
      if (btn) {
        btn.classList.toggle('text-violet-400', this.reactionsEnabled);
        btn.classList.toggle('text-zinc-500', !this.reactionsEnabled);
      }
    }
  }

  formatTime(ts) {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

  getAvatarSvg(avatarKey) {
    const icons = {
      'neon-cat': '🐱',
      'cyber-fox': '🦊',
      'cosmic-owl': '🦉',
      'panda-zen': '🐼',
      'neon-wolf': '🐺',
      'pixel-bot': '🤖',
      'astro-monkey': '🐒',
      'dragon-fire': '🐲',
      'ninja-star': '🥷',
      'alien-ufo': '👽',
      'ghost-chill': '👻',
      'system': '⚡'
    };
    return icons[avatarKey] || '🎬';
  }

  getAvatarBg(avatarKey) {
    const backgrounds = {
      'neon-cat': 'bg-pink-500/20 text-pink-400',
      'cyber-fox': 'bg-orange-500/20 text-orange-400',
      'cosmic-owl': 'bg-indigo-500/20 text-indigo-400',
      'panda-zen': 'bg-emerald-500/20 text-emerald-400',
      'neon-wolf': 'bg-cyan-500/20 text-cyan-400',
      'pixel-bot': 'bg-purple-500/20 text-purple-400',
      'astro-monkey': 'bg-amber-500/20 text-amber-400',
      'dragon-fire': 'bg-red-500/20 text-red-400',
      'ninja-star': 'bg-zinc-700/50 text-zinc-300',
      'alien-ufo': 'bg-lime-500/20 text-lime-400',
      'ghost-chill': 'bg-teal-500/20 text-teal-400',
      'system': 'bg-violet-500/30 text-violet-300'
    };
    return backgrounds[avatarKey] || 'bg-violet-500/20 text-violet-400';
  }
}

window.chatManager = new ChatManager();
