/**
 * Live Room Polls & Audience Voting System
 */

class PollManager {
  constructor() {
    this.currentPoll = null;
    this.container = null;
  }

  init({ containerId }) {
    this.container = document.getElementById(containerId);
    this.bindSocketEvents();
  }

  bindSocketEvents() {
    window.socketClient.on('poll_created', ({ poll }) => {
      this.currentPoll = poll;
      this.render();
      if (window.sfx) window.sfx.playReactionChime();
      if (window.ui) window.ui.showToast(`New Live Poll: "${poll.question}"`, 'info');
    });

    window.socketClient.on('poll_updated', ({ poll }) => {
      this.currentPoll = poll;
      this.render();
      if (window.sfx) window.sfx.playVoteTick();
    });

    window.socketClient.on('poll_ended', ({ poll }) => {
      this.currentPoll = poll;
      this.render();
      if (window.ui) window.ui.showToast('Poll has ended', 'info');
    });
  }

  createPoll(question, options) {
    if (!question || !options || options.length < 2) {
      if (window.ui) window.ui.showToast('Please provide a question and at least 2 options', 'warning');
      return;
    }

    window.socketClient.emit('poll_create', {
      question,
      options
    });

    if (window.ui) {
      window.ui.closeModal('modal-create-poll');
    }
  }

  vote(optionIndex) {
    if (!this.currentPoll || this.currentPoll.closed) return;
    window.socketClient.emit('poll_vote', {
      pollId: this.currentPoll.id,
      optionIndex
    });
  }

  endPoll() {
    if (!this.currentPoll) return;
    window.socketClient.emit('poll_end', {
      pollId: this.currentPoll.id
    });
  }

  dismissPoll() {
    this.currentPoll = null;
    if (this.container) {
      this.container.classList.add('hidden');
      this.container.innerHTML = '';
    }
  }

  render() {
    if (!this.container) return;

    if (!this.currentPoll) {
      this.container.classList.add('hidden');
      this.container.innerHTML = '';
      return;
    }

    const poll = this.currentPoll;
    this.container.classList.remove('hidden');

    const myId = window.app?.currentUser?.id || window.socketClient.getSocketId();
    const isHost = window.app?.isHost;

    // Calculate total votes
    let totalVotes = 0;
    poll.options.forEach(opt => {
      totalVotes += (opt.voters ? opt.voters.length : 0);
    });

    let optionsHtml = '';
    poll.options.forEach((opt, idx) => {
      const voteCount = opt.voters ? opt.voters.length : 0;
      const percent = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
      const isMyVote = opt.voters && opt.voters.includes(myId);

      optionsHtml += `
        <button onclick="pollManager.vote(${idx})" ${poll.closed ? 'disabled' : ''} class="relative w-full text-left p-2.5 rounded-xl border ${isMyVote ? 'border-cyan-500 bg-cyan-500/10' : 'border-white/5 bg-zinc-900/70 hover:border-violet-500/40'} overflow-hidden transition group">
          <!-- Animated Progress Fill -->
          <div class="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-600/30 to-cyan-500/20 rounded-xl transition-all duration-500" style="width: ${percent}%;"></div>

          <div class="relative z-10 flex items-center justify-between text-xs">
            <div class="flex items-center gap-2">
              <span class="w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${isMyVote ? 'bg-cyan-500 text-zinc-950 font-bold' : 'border border-white/20 text-zinc-400'}">
                ${isMyVote ? '✓' : idx + 1}
              </span>
              <span class="font-medium text-zinc-200">${this.escapeHtml(opt.text)}</span>
            </div>
            <span class="font-mono text-zinc-400 font-semibold">${percent}% <span class="text-[10px] text-zinc-500">(${voteCount})</span></span>
          </div>
        </button>
      `;
    });

    this.container.innerHTML = `
      <div class="glass-panel p-3.5 rounded-2xl border border-violet-500/30 space-y-2.5 shadow-2xl relative">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-1.5 text-[10px] text-violet-400 font-semibold uppercase tracking-wider">
              <i class="fa-solid fa-square-poll-vertical"></i>
              <span>Live Poll ${poll.closed ? '(Ended)' : ''}</span>
            </div>
            <h4 class="text-xs font-bold text-zinc-100 mt-0.5">${this.escapeHtml(poll.question)}</h4>
          </div>

          <div class="flex items-center gap-1.5 flex-shrink-0">
            ${isHost && !poll.closed ? `
              <button onclick="pollManager.endPoll()" class="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 transition">
                Close
              </button>
            ` : ''}
            <button onclick="pollManager.dismissPoll()" class="text-zinc-500 hover:text-zinc-300 text-xs px-1" title="Dismiss">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <div class="space-y-1.5">
          ${optionsHtml}
        </div>

        <div class="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-white/5">
          <span>Total Votes: ${totalVotes}</span>
          <span>By @${this.escapeHtml(poll.createdByName || 'Friend')}</span>
        </div>
      </div>
    `;
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

window.pollManager = new PollManager();
