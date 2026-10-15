/**
 * PollManager: Real-time group polls with live progress bars, timers, and creation modal
 */
export class PollManager {
  constructor(socketSender, myClientId) {
    this.send = socketSender;
    this.myClientId = myClientId;
    this.activePoll = null;

    this.container = document.getElementById("active-poll-container");
    this.btnOpenCreateModal = document.getElementById("btn-open-create-poll");
    this.modalCreatePoll = document.getElementById("modal-create-poll");
    this.btnCloseModal = document.getElementById("btn-close-poll-modal");
    this.btnSubmitPoll = document.getElementById("btn-submit-new-poll");

    this.pollQuestionInput = document.getElementById("poll-input-question");
    this.pollOptionsInput = document.getElementById("poll-input-options");
    this.pollDurationSelect = document.getElementById("poll-select-duration");

    this.timerInterval = null;
    this.init();
  }

  init() {
    if (this.btnOpenCreateModal) {
      this.btnOpenCreateModal.addEventListener("click", () => {
        this.modalCreatePoll.classList.add("active");
      });
    }

    if (this.btnCloseModal) {
      this.btnCloseModal.addEventListener("click", () => {
        this.modalCreatePoll.classList.remove("active");
      });
    }

    if (this.btnSubmitPoll) {
      this.btnSubmitPoll.addEventListener("click", () => {
        const question = this.pollQuestionInput.value.trim();
        const optionsRaw = this.pollOptionsInput.value.trim();
        const duration = parseInt(this.pollDurationSelect.value, 10) || 60;

        if (!question) {
          alert("Please enter a question.");
          return;
        }

        const options = optionsRaw.split("\n").map(s => s.trim()).filter(Boolean);
        if (options.length < 2) {
          alert("Please enter at least 2 options (one per line).");
          return;
        }

        this.send({
          type: "poll_create",
          question: question,
          options: options,
          duration_seconds: duration
        });

        this.modalCreatePoll.classList.remove("active");
        this.pollQuestionInput.value = "";
        this.pollOptionsInput.value = "";
      });
    }
  }

  updatePoll(poll) {
    this.activePoll = poll;
    this.render();
  }

  render() {
    if (!this.container) return;
    if (this.timerInterval) clearInterval(this.timerInterval);

    if (!this.activePoll) {
      this.container.innerHTML = `
        <div style="text-align: center; color: var(--text-dim); padding: 30px 10px; font-size: 0.85rem;">
          No active poll. Start one to see what everyone thinks!
        </div>
      `;
      return;
    }

    const poll = this.activePoll;
    let timeLeft = poll.time_left_seconds || 0;

    const renderCard = () => {
      this.container.innerHTML = `
        <div class="poll-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 0.75rem; color: var(--text-dim);">By ${this.escapeHtml(poll.created_by)}</span>
            <span style="font-size: 0.75rem; color: ${timeLeft > 0 ? "var(--accent-amber)" : "var(--accent-rose)"}; font-weight: 700; font-family: monospace;">
              ${timeLeft > 0 ? `⏳ ${timeLeft}s left` : "🔒 Closed"}
            </span>
          </div>
          <div class="poll-question">${this.escapeHtml(poll.question)}</div>
          <div class="poll-options-list">
            ${poll.options.map(opt => `
              <div class="poll-option-row ${timeLeft <= 0 ? 'disabled' : ''}" data-option-id="${opt.id}">
                <div class="poll-option-progress" style="width: ${opt.percentage || 0}%;"></div>
                <div class="poll-option-text">${this.escapeHtml(opt.text)}</div>
                <div class="poll-option-meta">${opt.percentage || 0}% (${opt.votes_count})</div>
              </div>
            `).join("")}
          </div>
          <div style="margin-top: 10px; font-size: 0.75rem; color: var(--text-dim); text-align: right;">
            Total Votes: ${poll.total_votes || 0}
          </div>
        </div>
      `;

      if (timeLeft > 0) {
        this.container.querySelectorAll(".poll-option-row").forEach(row => {
          row.addEventListener("click", () => {
            const optId = parseInt(row.dataset.optionId, 10);
            this.send({
              type: "poll_vote",
              option_id: optId
            });
          });
        });
      }
    };

    renderCard();

    if (timeLeft > 0) {
      this.timerInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
          clearInterval(this.timerInterval);
          timeLeft = 0;
        }
        renderCard();
      }, 1000);
    }
  }

  escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
