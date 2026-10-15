/**
 * ChatManager: Live chat feed, emoji reaction canvas particle bursts, and Web Audio sound synthesizer
 */
export class ChatManager {
  constructor(socketSender, canvasElement, myClientId) {
    this.send = socketSender;
    this.canvas = canvasElement;
    this.myClientId = myClientId;
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;

    this.chatContainer = document.getElementById("chat-messages-container");
    this.chatInput = document.getElementById("chat-input-box");
    this.btnSendChat = document.getElementById("btn-send-chat");
    this.danmakuInput = document.getElementById("danmaku-input");
    this.btnSendDanmaku = document.getElementById("btn-send-danmaku");

    this.particles = [];
    this.audioCtx = null;
    this.soundEnabled = true;

    this.initCanvas();
    this.initInputs();
    this.startParticleLoop();
  }

  initCanvas() {
    if (!this.canvas) return;
    const resize = () => {
      this.canvas.width = this.canvas.parentElement.clientWidth;
      this.canvas.height = this.canvas.parentElement.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);
  }

  initInputs() {
    // Regular chat send
    const doSendChat = () => {
      const text = this.chatInput.value.trim();
      if (!text) return;
      this.send({ type: "chat_message", text: text });
      this.chatInput.value = "";
    };

    this.btnSendChat.addEventListener("click", doSendChat);
    this.chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        doSendChat();
      }
    });

    // Danmaku bullet send
    const doSendDanmaku = () => {
      const text = this.danmakuInput.value.trim();
      if (!text) return;
      this.send({ type: "danmaku", text: text });
      this.danmakuInput.value = "";
    };

    if (this.btnSendDanmaku && this.danmakuInput) {
      this.btnSendDanmaku.addEventListener("click", doSendDanmaku);
      this.danmakuInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          doSendDanmaku();
        }
      });
    }

    // Emoji reaction buttons
    document.querySelectorAll(".emoji-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const emoji = btn.dataset.emoji || btn.textContent.trim();
        this.send({ type: "reaction", emoji: emoji });
        this.triggerReactionBurst(emoji);
        this.playPopSound();
      });
    });
  }

  appendMessage(msg) {
    if (!this.chatContainer) return;

    if (msg.type === "system") {
      const sysDiv = document.createElement("div");
      sysDiv.className = "chat-system-card";
      sysDiv.textContent = msg.text;
      this.chatContainer.appendChild(sysDiv);
    } else {
      const isOwn = msg.client_id === this.myClientId;
      const bubble = document.createElement("div");
      bubble.className = `chat-bubble ${isOwn ? "own" : ""}`;

      const timeStr = new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      bubble.innerHTML = `
        <div class="chat-sender-row">
          <span class="chat-sender-name" style="color: ${msg.color || '#CBD5E1'}">${this.escapeHtml(msg.username)}</span>
          <span class="chat-time">${timeStr}</span>
        </div>
        <div class="chat-body-text">${this.escapeHtml(msg.text)}</div>
      `;
      this.chatContainer.appendChild(bubble);
    }

    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  loadRecentHistory(messages) {
    if (!this.chatContainer || !messages) return;
    this.chatContainer.innerHTML = "";
    messages.forEach(msg => this.appendMessage(msg));
  }

  escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Particle physics for emoji burst
  triggerReactionBurst(emoji) {
    if (!this.canvas) return;
    const startX = this.canvas.width * (0.3 + Math.random() * 0.4);
    const startY = this.canvas.height - 20;

    for (let i = 0; i < 7; i++) {
      this.particles.push({
        emoji: emoji,
        x: startX + (Math.random() - 0.5) * 60,
        y: startY,
        vx: (Math.random() - 0.5) * 4,
        vy: -6 - Math.random() * 6,
        size: 24 + Math.random() * 16,
        alpha: 1.0,
        rotation: (Math.random() - 0.5) * 0.5,
        angularVelocity: (Math.random() - 0.5) * 0.05
      });
    }
  }

  startParticleLoop() {
    if (!this.ctx) return;
    const render = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08; // upward buoyancy / gentle arc
        p.alpha -= 0.012;
        p.rotation += p.angularVelocity;

        this.ctx.save();
        this.ctx.globalAlpha = Math.max(0, p.alpha);
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate(p.rotation);
        this.ctx.font = `${p.size}px serif`;
        this.ctx.textAlign = "center";
        this.ctx.fillText(p.emoji, 0, 0);
        this.ctx.restore();

        if (p.alpha <= 0 || p.y < -50) {
          this.particles.splice(i, 1);
        }
      }

      requestAnimationFrame(render);
    };
    render();
  }

  // Web Audio synthesizer for crisp feedback
  playPopSound() {
    if (!this.soundEnabled) return;
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioCtx.state === "suspended") {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(440, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, this.audioCtx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.09);
    } catch (e) {}
  }
}
