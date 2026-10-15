/**
 * MovieCatalog: Movie discovery, category filtering, fuzzy search, and playlist queueing
 */
export class MovieCatalog {
  constructor(socketSender) {
    this.send = socketSender;
    this.movies = [];
    this.filteredMovies = [];
    this.activeCategory = "All";
    this.searchQuery = "";

    this.gridContainer = document.getElementById("catalog-cards-grid");
    this.searchInput = document.getElementById("catalog-search-input");
    this.chipsContainer = document.getElementById("category-chips-row");

    this.init();
  }

  async init() {
    this.initSearchAndFilters();
    await this.fetchMovies();
  }

  async fetchMovies() {
    try {
      const res = await fetch("/api/movies");
      const data = await res.json();
      this.movies = data.movies || [];
      this.applyFilter();
    } catch (err) {
      console.error("Failed to load movie catalog:", err);
    }
  }

  initSearchAndFilters() {
    if (this.searchInput) {
      this.searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.applyFilter();
      });
    }

    if (this.chipsContainer) {
      this.chipsContainer.querySelectorAll(".cat-chip").forEach(chip => {
        chip.addEventListener("click", () => {
          this.chipsContainer.querySelectorAll(".cat-chip").forEach(c => c.classList.remove("active"));
          chip.classList.add("active");
          this.activeCategory = chip.dataset.category || chip.textContent.trim();
          this.applyFilter();
        });
      });
    }
  }

  applyFilter() {
    let list = this.movies;

    if (this.activeCategory && this.activeCategory !== "All") {
      list = list.filter(m => m.category === this.activeCategory || m.genres.includes(this.activeCategory));
    }

    if (this.searchQuery) {
      const q = this.searchQuery;
      // Fuzzy score calculation
      const scored = [];
      list.forEach(m => {
        let score = 0;
        const title = m.title.toLowerCase();
        const desc = m.description.toLowerCase();
        const dir = (m.director || "").toLowerCase();

        if (title.includes(q)) score += 20;
        if (title.startsWith(q)) score += 10;
        if (dir.includes(q)) score += 8;
        if (desc.includes(q)) score += 5;
        m.genres.forEach(g => {
          if (g.toLowerCase().includes(q)) score += 8;
        });

        // Simple character sequence fuzzy match if no exact substring
        if (score === 0) {
          let lastIdx = -1;
          let matchCount = 0;
          for (let i = 0; i < q.length; i++) {
            const idx = title.indexOf(q[i], lastIdx + 1);
            if (idx > lastIdx) {
              matchCount++;
              lastIdx = idx;
            }
          }
          if (matchCount >= Math.min(3, q.length)) {
            score += matchCount;
          }
        }

        if (score > 0) scored.push({ score, movie: m });
      });

      scored.sort((a, b) => b.score - a.score);
      list = scored.map(s => s.movie);
    }

    this.filteredMovies = list;
    this.render();
  }

  render() {
    if (!this.gridContainer) return;
    this.gridContainer.innerHTML = "";

    if (this.filteredMovies.length === 0) {
      this.gridContainer.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 24px; font-size: 0.85rem;">No movies found matching your search.</div>`;
      return;
    }

    this.filteredMovies.forEach(movie => {
      const card = document.createElement("div");
      card.className = "movie-card";

      card.innerHTML = `
        <img class="movie-card-thumb" src="${movie.poster}" alt="${movie.title}" loading="lazy" />
        <div class="movie-card-details">
          <div>
            <div class="movie-card-title">${this.escapeHtml(movie.title)} (${movie.year})</div>
            <div class="movie-card-genre">⭐ ${movie.rating} • ${movie.duration} • ${movie.genres.join(", ")}</div>
            <div class="movie-card-desc">${this.escapeHtml(movie.description)}</div>
          </div>
          <div class="movie-card-actions">
            <button class="btn-sm-primary btn-watch-now" data-url="${movie.stream_url}" data-title="${movie.title}">
              ▶ Watch in Party
            </button>
            <button class="btn-sm-outline btn-queue-add" data-url="${movie.stream_url}" data-title="${movie.title}" data-duration="${movie.duration}" data-thumb="${movie.poster}">
              + Queue
            </button>
          </div>
        </div>
      `;

      card.querySelector(".btn-watch-now").addEventListener("click", () => {
        this.send({
          type: "change_media",
          media_url: movie.stream_url,
          media_title: movie.title
        });
      });

      card.querySelector(".btn-queue-add").addEventListener("click", () => {
        this.send({
          type: "playlist_add",
          title: movie.title,
          url: movie.stream_url,
          duration: movie.duration,
          thumbnail: movie.poster
        });
      });

      this.gridContainer.appendChild(card);
    });
  }

  escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
