/**
 * Shared Playlist Queue Controller
 * Supports:
 * 1. Adding YouTube, Direct, HLS, and Local video items
 * 2. Drag & Drop reordering + touch-friendly up/down buttons
 * 3. Immediate play ("Play Now") and deletion
 * 4. Auto-advance when video ends
 */

class QueueManager {
  constructor() {
    this.socketClient = null;
    this.queueContainer = null;
    this.queueItems = [];
    this.draggedIndex = null;
  }

  init({ socketClient, queueContainerId }) {
    this.socketClient = socketClient;
    this.queueContainer = document.getElementById(queueContainerId);

    this.bindSocketEvents();
  }

  bindSocketEvents() {
    this.socketClient.on('queue_updated', ({ queue }) => {
      this.queueItems = queue || [];
      this.render();
      if (window.ui) {
        window.ui.updateQueueBadge(this.queueItems.length);
      }
    });
  }

  setQueue(queue) {
    this.queueItems = queue || [];
    this.render();
    if (window.ui) {
      window.ui.updateQueueBadge(this.queueItems.length);
    }
  }

  addToQueue({ title, url, type, duration = 0 }) {
    if (!url) return;
    this.socketClient.emit('queue_add', {
      item: { title, url, type, duration }
    }, (res) => {
      if (res && res.success && window.ui) {
        window.ui.showToast(`Added "${title}" to queue`, 'success');
      }
    });
  }

  removeFromQueue(itemId) {
    this.socketClient.emit('queue_remove', { itemId });
  }

  playNow(itemId) {
    const item = this.queueItems.find(q => q.id === itemId);
    if (!item) return;

    // Change video immediately
    this.socketClient.emit('change_video', {
      type: item.type,
      url: item.url,
      title: item.title,
      duration: item.duration
    });

    // Remove from queue
    this.removeFromQueue(itemId);

    // Trigger play
    setTimeout(() => {
      this.socketClient.emit('sync_play', { currentTime: 0 });
    }, 400);
  }

  moveItem(oldIndex, newIndex) {
    if (newIndex < 0 || newIndex >= this.queueItems.length) return;
    this.socketClient.emit('queue_reorder', { oldIndex, newIndex });
  }

  playNext() {
    this.socketClient.emit('queue_play_next');
  }

  render() {
    if (!this.queueContainer) return;

    if (this.queueItems.length === 0) {
      this.queueContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12 text-center text-zinc-500">
          <i class="fa-solid fa-list-ul text-3xl mb-3 text-zinc-600"></i>
          <p class="text-sm font-medium text-zinc-400">Queue is empty</p>
          <p class="text-xs text-zinc-500 mt-1 max-w-[200px]">Add videos, movies, or streams to watch next!</p>
          <button onclick="ui.openAddMediaModal(true)" class="mt-4 px-3.5 py-1.5 bg-violet-600/30 hover:bg-violet-600/50 text-violet-300 text-xs rounded-lg border border-violet-500/30 transition">
            <i class="fa-solid fa-plus mr-1"></i> Add Video to Queue
          </button>
        </div>
      `;
      return;
    }

    this.queueContainer.innerHTML = '';
    this.queueItems.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = 'queue-item glass-panel-hover p-2.5 rounded-lg border border-white/5 bg-zinc-900/60 flex items-center justify-between gap-3 text-xs mb-2 transition select-none';
      el.draggable = true;
      el.dataset.index = index;

      // Source icon badge
      let sourceIcon = 'fa-youtube text-red-500';
      if (item.type === 'direct') sourceIcon = 'fa-file-video text-blue-400';
      if (item.type === 'hls') sourceIcon = 'fa-tower-broadcast text-emerald-400';
      if (item.type === 'local') sourceIcon = 'fa-hard-drive text-amber-400';

      el.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <div class="cursor-grab text-zinc-500 hover:text-zinc-300 px-1 py-2">
            <i class="fa-solid fa-grip-vertical"></i>
          </div>
          <div class="w-7 h-7 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0">
            <i class="fa-brands ${sourceIcon}"></i>
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-zinc-200 font-medium truncate" title="${this.escapeHtml(item.title)}">${index + 1}. ${this.escapeHtml(item.title)}</p>
            <p class="text-[10px] text-zinc-500 truncate">Added by @${this.escapeHtml(item.addedByName || 'Friend')}</p>
          </div>
        </div>

        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button onclick="queueManager.moveItem(${index}, ${index - 1})" class="p-1 text-zinc-500 hover:text-zinc-300 ${index === 0 ? 'opacity-30 cursor-not-allowed' : ''}" title="Move Up">
            <i class="fa-solid fa-chevron-up text-[10px]"></i>
          </button>
          <button onclick="queueManager.moveItem(${index}, ${index + 1})" class="p-1 text-zinc-500 hover:text-zinc-300 ${index === this.queueItems.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}" title="Move Down">
            <i class="fa-solid fa-chevron-down text-[10px]"></i>
          </button>
          <button onclick="queueManager.playNow('${item.id}')" class="px-2 py-1 bg-violet-600/40 hover:bg-violet-600 text-violet-200 hover:text-white rounded text-[11px] transition flex items-center gap-1" title="Play Now">
            <i class="fa-solid fa-play text-[9px]"></i> Play
          </button>
          <button onclick="queueManager.removeFromQueue('${item.id}')" class="p-1 text-zinc-500 hover:text-rose-400 transition" title="Remove">
            <i class="fa-solid fa-trash-can text-[11px]"></i>
          </button>
        </div>
      `;

      // Drag and Drop listeners
      el.addEventListener('dragstart', (e) => {
        this.draggedIndex = index;
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        document.querySelectorAll('.queue-item').forEach(i => i.classList.remove('drag-over'));
      });

      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drag-over');
      });

      el.addEventListener('dragleave', () => {
        el.classList.remove('drag-over');
      });

      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        if (this.draggedIndex !== null && this.draggedIndex !== index) {
          this.moveItem(this.draggedIndex, index);
        }
      });

      this.queueContainer.appendChild(el);
    });
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

window.queueManager = new QueueManager();
