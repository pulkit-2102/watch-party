import { extractYouTubeId } from "./player.js";

/**
 * PlaylistManager: Collaborative shared queue with upvoting, auto-next, and YouTube stream modal
 */
export class PlaylistManager {
  constructor(socketSender, myClientId) {
    this.send = socketSender;
    this.myClientId = myClientId;
    this.items = [];
    this.currentIndex = 0;

    // Elements
    this.container = document.getElementById("playlist-list-container");
    this.btnPlayNext = document.getElementById("btn-play-next-queue");
    this.btnAddCustomUrl = document.getElementById("btn-add-custom-stream");

    // Modal elements
    this.modalCustom = document.getElementById("modal-custom-link");
    this.inputUrl = document.getElementById("custom-link-url");
    this.inputTitle = document.getElementById("custom-link-title");
    this.previewBox = document.getElementById("custom-link-preview");
    this.previewImg = document.getElementById("yt-preview-img");
    this.previewBadge = document.getElementById("preview-type-badge");
    this.previewTitle = document.getElementById("preview-title-text");
    this.previewId = document.getElementById("preview-id-text");
    this.btnCloseModal = document.getElementById("btn-close-custom-modal");
    this.btnPlayNow = document.getElementById("btn-play-in-room-action");
    this.btnAddToQueue = document.getElementById("btn-add-to-queue-action");

    this.init();
  }

  init() {
    if (this.btnPlayNext) {
      this.btnPlayNext.addEventListener("click", () => {
        this.send({ type: "playlist_next" });
      });
    }

    if (this.btnAddCustomUrl && this.modalCustom) {
      this.btnAddCustomUrl.addEventListener("click", () => {
        this.openCustomModal();
      });
    }

    if (this.btnCloseModal) {
      this.btnCloseModal.addEventListener("click", () => {
        this.closeCustomModal();
      });
    }

    if (this.inputUrl) {
      this.inputUrl.addEventListener("input", () => this.handleUrlInput());
    }

    // Play in room immediately
    if (this.btnPlayNow) {
      this.btnPlayNow.addEventListener("click", () => {
        const url = this.inputUrl.value.trim();
        if (!url) return;

        const ytId = extractYouTubeId(url);
        let finalUrl = url;
        let finalTitle = this.inputTitle.value.trim();

        if (ytId) {
          finalUrl = `https://www.youtube.com/watch?v=${ytId}`;
          if (!finalTitle) finalTitle = `YouTube Video (${ytId})`;
        } else {
          if (!finalTitle) finalTitle = "Custom Video Stream";
        }

        this.send({
          type: "change_media",
          media_url: finalUrl,
          media_title: finalTitle
        });

        this.closeCustomModal();
      });
    }

    // Add to shared queue
    if (this.btnAddToQueue) {
      this.btnAddToQueue.addEventListener("click", () => {
        const url = this.inputUrl.value.trim();
        if (!url) return;

        const ytId = extractYouTubeId(url);
        let finalUrl = url;
        let finalTitle = this.inputTitle.value.trim();
        let finalThumb = "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80";

        if (ytId) {
          finalUrl = `https://www.youtube.com/watch?v=${ytId}`;
          finalThumb = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
          if (!finalTitle) finalTitle = `YouTube Video (${ytId})`;
        } else {
          if (!finalTitle) finalTitle = "Custom Video Stream";
        }

        this.send({
          type: "playlist_add",
          title: finalTitle,
          url: finalUrl,
          duration: ytId ? "YouTube" : "Stream",
          thumbnail: finalThumb
        });

        this.closeCustomModal();
      });
    }
  }

  openCustomModal() {
    if (!this.modalCustom) return;
    this.modalCustom.classList.add("active");
    this.inputUrl.value = "";
    this.inputTitle.value = "";
    this.previewBox.style.display = "none";
    this.inputUrl.focus();
  }

  closeCustomModal() {
    if (!this.modalCustom) return;
    this.modalCustom.classList.remove("active");
  }

  handleUrlInput() {
    const raw = this.inputUrl.value.trim();
    const ytId = extractYouTubeId(raw);

    if (ytId) {
      this.previewBox.style.display = "block";
      this.previewImg.src = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
      this.previewBadge.textContent = "▶ YouTube Video";
      this.previewBadge.style.background = "#FF0000";
      this.previewTitle.textContent = this.inputTitle.value.trim() || `YouTube (${ytId})`;
      this.previewId.textContent = `YouTube Video ID: ${ytId}`;
    } else if (raw.endsWith(".mp4") || raw.endsWith(".webm") || raw.startsWith("http")) {
      this.previewBox.style.display = "block";
      this.previewImg.src = "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80";
      this.previewBadge.textContent = "🌐 Direct Stream";
      this.previewBadge.style.background = "#6366F1";
      this.previewTitle.textContent = this.inputTitle.value.trim() || "Web Stream";
      this.previewId.textContent = raw.substring(0, 45) + "...";
    } else {
      this.previewBox.style.display = "none";
    }
  }

  updatePlaylist(items, currentIndex = 0) {
    this.items = items || [];
    this.currentIndex = currentIndex;
    this.render();
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = "";

    if (this.items.length === 0) {
      this.container.innerHTML = `<div style="text-align: center; color: var(--text-tertiary); padding: 20px; font-size: 0.8rem;">The queue is currently empty. Add movies from Catalog or paste any YouTube link!</div>`;
      return;
    }

    this.items.forEach((item, idx) => {
      const isPlaying = idx === this.currentIndex;
      const hasUpvoted = (item.upvotes || []).includes(this.myClientId);
      const isYt = !!extractYouTubeId(item.url);

      const card = document.createElement("div");
      card.className = `playlist-item-card ${isPlaying ? "now-playing" : ""}`;

      card.innerHTML = `
        <div class="playlist-item-info">
          <div class="playlist-item-title">
            ${isPlaying ? "▶ " : ""}${this.escapeHtml(item.title)}
            ${isYt ? '<span style="font-size: 0.65rem; background: #FF0000; color: #fff; padding: 1px 4px; border-radius: 3px; margin-left: 5px;">YouTube</span>' : ''}
          </div>
          <div class="playlist-item-sub">${item.duration} • Added by ${this.escapeHtml(item.added_by)}</div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="btn-upvote ${hasUpvoted ? "upvoted" : ""}" data-id="${item.id}">
            ▲ ${item.upvotes_count || 0}
          </button>
        </div>
      `;

      card.querySelector(".btn-upvote").addEventListener("click", () => {
        this.send({
          type: "playlist_upvote",
          item_id: item.id
        });
      });

      this.container.appendChild(card);
    });
  }

  escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
