import { SyncManager } from "./sync.js";
import { PlayerController } from "./player.js";
import { ChatManager } from "./chat.js";
import { MovieCatalog } from "./catalog.js";
import { PlaylistManager } from "./playlist.js";
import { PollManager } from "./polls.js";
import { TelemetryHUD } from "./telemetry.js";

class WatchPartyApp {
  constructor() {
    this.clientId = this.getOrCreateClientId();
    this.username = localStorage.getItem("wp_username") || `PartyFan-${Math.floor(100 + Math.random() * 900)}`;
    this.userColor = this.getOrCreateColor();
    this.roomCode = this.getRoomCodeFromUrl();
    this.isHost = false;
    this.hostOnlyMode = false;
    this.participants = [];

    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;

    // Component instances
    this.sync = null;
    this.player = null;
    this.chat = null;
    this.catalog = null;
    this.playlist = null;
    this.polls = null;
    this.telemetry = null;

    this.init();
  }

  getOrCreateClientId() {
    let id = sessionStorage.getItem("wp_client_id");
    if (!id) {
      id = "user_" + Math.random().toString(36).substring(2, 10);
      sessionStorage.setItem("wp_client_id", id);
    }
    return id;
  }

  getOrCreateColor() {
    const colors = ["#FF4D4D", "#FF9F43", "#FECA57", "#1DD1A1", "#48DBFB", "#54A0FF", "#8B5CF6", "#EC4899"];
    let col = localStorage.getItem("wp_user_color");
    if (!col) {
      col = colors[Math.floor(Math.random() * colors.length)];
      localStorage.setItem("wp_user_color", col);
    }
    return col;
  }

  getRoomCodeFromUrl() {
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2 && pathParts[0] === "room") {
      return pathParts[1].toUpperCase();
    }
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    if (roomParam) return roomParam.toUpperCase();

    // Default room code
    return "NEON-77";
  }

  init() {
    this.initUI();
    this.initWebSocket();
  }

  initUI() {
    // Set Room Tag
    const roomTag = document.getElementById("header-room-code");
    if (roomTag) roomTag.textContent = this.roomCode;

    // Copy Invite Link
    const btnCopy = document.getElementById("btn-copy-invite");
    if (btnCopy) {
      btnCopy.addEventListener("click", () => {
        const url = `${window.location.origin}/room/${this.roomCode}`;
        navigator.clipboard.writeText(url).then(() => {
          this.showToast("📋 Invite link copied to clipboard!");
        });
      });
    }

    // Change Username
    const userLabel = document.getElementById("header-username-label");
    if (userLabel) userLabel.textContent = this.username;

    const btnChangeName = document.getElementById("btn-change-username");
    if (btnChangeName) {
      btnChangeName.addEventListener("click", () => {
        const newName = prompt("Enter your display name:", this.username);
        if (newName && newName.trim()) {
          this.username = newName.trim();
          localStorage.setItem("wp_username", this.username);
          window.location.reload();
        }
      });
    }

    // Switch Tabs in Side Drawer
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.tab;
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        const panel = document.getElementById(`tab-${target}`);
        if (panel) panel.classList.add("active");
      });
    });

    // Host Lock Switch
    const hostLockSwitch = document.getElementById("host-lock-switch");
    if (hostLockSwitch) {
      hostLockSwitch.addEventListener("change", (e) => {
        if (!this.isHost) {
          e.target.checked = this.hostOnlyMode;
          this.showToast("⚠️ Only the host can toggle playback lock.");
          return;
        }
        this.sendWsMessage({
          type: "toggle_host_only",
          host_only: e.target.checked
        });
      });
    }

    // Transfer Host Dropdown
    const hostSelect = document.getElementById("select-transfer-host");
    const btnConfirmTransfer = document.getElementById("btn-confirm-transfer-host");
    if (btnConfirmTransfer && hostSelect) {
      btnConfirmTransfer.addEventListener("click", () => {
        if (!this.isHost) {
          this.showToast("⚠️ Only current host can transfer privileges.");
          return;
        }
        const targetId = hostSelect.value;
        if (!targetId) return;
        this.sendWsMessage({
          type: "transfer_host",
          target_id: targetId
        });
      });
    }

    // Video Element
    const videoEl = document.getElementById("video-element");
    const reactionCanvas = document.getElementById("reaction-canvas");

    // Initialize Sub-Managers (Player first, then SyncManager with unified player)
    this.player = new PlayerController(
      videoEl,
      (action, pos) => this.handleUserPlaybackAction(action, pos),
      () => this.handleMediaEnded()
    );
    this.sync = new SyncManager((msg) => this.sendWsMessage(msg), this.player);
    this.chat = new ChatManager((msg) => this.sendWsMessage(msg), reactionCanvas, this.clientId);
    this.catalog = new MovieCatalog((msg) => this.sendWsMessage(msg));
    this.playlist = new PlaylistManager((msg) => this.sendWsMessage(msg), this.clientId);
    this.polls = new PollManager((msg) => this.sendWsMessage(msg), this.clientId);
    this.telemetry = new TelemetryHUD(this.sync);

    this.sync.onStateChange = (state) => {
      this.player.setMovieTitle(state.media_title);
    };
  }

  initWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/${this.roomCode}?client_id=${this.clientId}&username=${encodeURIComponent(this.username)}&color=${encodeURIComponent(this.userColor)}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.showToast(`✨ Connected to room ${this.roomCode}`);
      this.sync.start();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleServerMessage(msg);
      } catch (err) {
        console.error("WebSocket message parse error:", err);
      }
    };

    this.ws.onclose = () => {
      this.sync.stop();
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.warn("WebSocket encountered error:", err);
    };
  }

  scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(5000, 1000 * Math.pow(1.5, this.reconnectAttempts) + Math.random() * 500);
      this.showToast(`🔄 Reconnecting in ${(delay/1000).toFixed(1)}s (attempt ${this.reconnectAttempts})...`);
      setTimeout(() => this.initWebSocket(), delay);
    } else {
      this.showToast("❌ Connection lost. Please refresh the page.");
    }
  }

  sendWsMessage(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  handleUserPlaybackAction(action, position) {
    if (this.hostOnlyMode && !this.isHost) {
      this.showToast("🔒 Host-Only Mode is enabled. Playback controls are restricted to the host.");
      return;
    }
    this.sendWsMessage({
      type: "playback_action",
      action: action,
      position: position,
      version: this.sync.authoritativeState.version
    });
  }

  handleMediaEnded() {
    if (this.isHost || !this.hostOnlyMode) {
      this.sendWsMessage({ type: "playlist_next" });
    }
  }

  handleServerMessage(msg) {
    const type = msg.type;

    if (type === "ntp_pong") {
      this.sync.handleNtpPong(msg);
    }
    else if (type === "playback_update") {
      this.sync.handlePlaybackUpdate(msg);
      if (msg.chat_message) this.chat.appendMessage(msg.chat_message);
      if (msg.playlist) this.playlist.updatePlaylist(msg.playlist, msg.current_playlist_index || 0);
    }
    else if (type === "snapshot") {
      const snap = msg.data;
      this.isHost = msg.is_host;
      this.hostOnlyMode = snap.host_only_mode;
      this.updateHostBadgeUI();
      if (this.player && snap.playback && snap.playback.media_url) {
        if (this.player.currentMediaUrl !== snap.playback.media_url) {
          this.player.loadMedia(
            snap.playback.media_url,
            snap.playback.media_title,
            snap.playback.state,
            snap.playback.position_seconds
          );
        }
      }
      this.sync.handlePlaybackUpdate({
        playback: snap.playback,
        server_transmit_time: snap.server_time
      });
      this.updateParticipants(snap.participants);
      this.playlist.updatePlaylist(snap.playlist, snap.current_playlist_index);
      if (snap.active_poll) this.polls.updatePoll(snap.active_poll);
      this.chat.loadRecentHistory(snap.recent_chat);
    }
    else if (type === "participant_joined") {
      this.updateParticipants(msg.participants);
      if (msg.chat_message) this.chat.appendMessage(msg.chat_message);
    }
    else if (type === "participant_left") {
      this.updateParticipants(msg.participants);
      if (msg.new_host_id && msg.new_host_id === this.clientId) {
        this.isHost = true;
        this.updateHostBadgeUI();
        this.showToast("👑 You are now the room host!");
      }
      if (msg.chat_message) this.chat.appendMessage(msg.chat_message);
    }
    else if (type === "host_transferred") {
      this.isHost = msg.new_host_id === this.clientId;
      this.updateHostBadgeUI();
      this.updateParticipants(msg.participants);
      if (msg.chat_message) this.chat.appendMessage(msg.chat_message);
      if (this.isHost) {
        this.showToast("👑 You have been promoted to Host!");
      }
    }
    else if (type === "host_only_toggled") {
      this.hostOnlyMode = msg.host_only_mode;
      const hostLockSwitch = document.getElementById("host-lock-switch");
      if (hostLockSwitch) hostLockSwitch.checked = this.hostOnlyMode;
      if (msg.chat_message) this.chat.appendMessage(msg.chat_message);
    }
    else if (type === "chat_message") {
      this.chat.appendMessage(msg.message);
    }
    else if (type === "danmaku") {
      this.player.renderDanmakuBullet(msg.text, msg.color || "#FFF");
    }
    else if (type === "reaction") {
      this.chat.triggerReactionBurst(msg.emoji);
      this.chat.playPopSound();
    }
    else if (type === "playlist_updated") {
      this.playlist.updatePlaylist(msg.playlist);
      if (msg.chat_message) this.chat.appendMessage(msg.chat_message);
    }
    else if (type === "poll_updated") {
      this.polls.updatePoll(msg.poll);
      if (msg.chat_message) this.chat.appendMessage(msg.chat_message);
    }
    else if (type === "action_rejected") {
      this.showToast(`⛔ ${msg.reason}`);
    }
  }

  updateHostBadgeUI() {
    const badge = document.getElementById("host-badge-indicator");
    const hostLockSwitch = document.getElementById("host-lock-switch");
    if (badge) {
      badge.style.display = this.isHost ? "inline-flex" : "none";
    }
    if (hostLockSwitch) {
      hostLockSwitch.disabled = !this.isHost;
    }
  }

  updateParticipants(participants) {
    this.participants = participants || [];
    const container = document.getElementById("avatar-stack-container");
    const countTag = document.getElementById("participant-count-tag");
    const hostSelect = document.getElementById("select-transfer-host");
    const listTable = document.getElementById("settings-participants-list");

    if (countTag) countTag.textContent = `${this.participants.length} watching`;

    if (container) {
      container.innerHTML = "";
      this.participants.slice(0, 5).forEach(p => {
        const div = document.createElement("div");
        div.className = `avatar-bubble ${p.is_host ? "is-host" : ""}`;
        div.style.backgroundColor = p.color || "#6366F1";
        div.textContent = (p.username || "U").substring(0, 2).toUpperCase();
        div.title = `${p.username}${p.is_host ? " (Host)" : ""}`;
        container.appendChild(div);
      });
      if (this.participants.length > 5) {
        const extra = document.createElement("div");
        extra.className = "avatar-bubble";
        extra.style.backgroundColor = "#334155";
        extra.textContent = `+${this.participants.length - 5}`;
        container.appendChild(extra);
      }
    }

    if (hostSelect) {
      hostSelect.innerHTML = `<option value="">Select a participant...</option>`;
      this.participants.filter(p => p.id !== this.clientId).forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = `${p.username} (${p.id.substring(0, 6)})`;
        hostSelect.appendChild(opt);
      });
    }

    if (listTable) {
      listTable.innerHTML = this.participants.map(p => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 6px 0; border-bottom: 1px solid var(--border-color); font-size: 0.8rem;">
          <div style="display:flex; align-items:center; gap: 8px;">
            <span style="width:10px;height:10px;border-radius:50%;background:${p.color}"></span>
            <span>${this.escapeHtml(p.username)} ${p.is_host ? "👑" : ""} ${p.id === this.clientId ? "(You)" : ""}</span>
          </div>
          <div style="font-family:monospace; color:var(--text-muted); font-size:0.75rem;">
            ${p.latency_ms}ms • drift: ${p.drift_ms}ms
          </div>
        </div>
      `).join("");
    }
  }

  showToast(text) {
    let toast = document.getElementById("wp-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "wp-toast";
      toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.95);
        color: #fff;
        padding: 10px 20px;
        border-radius: 9999px;
        border: 1px solid rgba(99, 102, 241, 0.5);
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        z-index: 200;
        font-size: 0.85rem;
        pointer-events: none;
        transition: opacity 0.3s;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.opacity = "1";
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.style.opacity = "0";
    }, 2800);
  }

  escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}

// Bootstrap application on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  window.watchPartyApp = new WatchPartyApp();
});
