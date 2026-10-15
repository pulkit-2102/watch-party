/**
 * PlayerController: Unified player supporting both HTML5 video and YouTube IFrame API
 */
export function extractYouTubeId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) {
    return match[2];
  }
  if (url.startsWith("youtube:")) return url.substring(8);
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  return null;
}

export class PlayerController {
  constructor(videoElement, onUserPlaybackAction, onMediaEnded) {
    this.video = videoElement;
    this.onUserPlaybackAction = onUserPlaybackAction;
    this.onMediaEnded = onMediaEnded;

    // UI elements
    this.appContainer = document.getElementById("app-container");
    this.playerWrapper = document.getElementById("player-wrapper");
    this.ytContainer = document.getElementById("youtube-player-container");
    this.btnPlayPause = document.getElementById("btn-play-pause");
    this.iconPlay = document.getElementById("icon-play");
    this.iconPause = document.getElementById("icon-pause");
    this.btnSkipBack = document.getElementById("btn-skip-backward");
    this.btnSkipForward = document.getElementById("btn-skip-forward");
    this.progressBar = document.getElementById("progress-bar-container");
    this.progressPlayed = document.getElementById("progress-played-bar");
    this.progressBuffer = document.getElementById("progress-buffer-bar");
    this.scrubberHandle = document.getElementById("progress-scrubber-handle");
    this.timeDisplay = document.getElementById("time-display");
    this.volumeSlider = document.getElementById("volume-slider");
    this.btnMute = document.getElementById("btn-mute");
    this.btnFullscreen = document.getElementById("btn-fullscreen");
    this.btnTheater = document.getElementById("btn-theater");
    this.btnPip = document.getElementById("btn-pip");
    this.btnSpeedToggle = document.getElementById("btn-speed-toggle");
    this.btnToggleDanmaku = document.getElementById("btn-toggle-danmaku");
    this.danmakuContainer = document.getElementById("danmaku-container");
    this.movieTitleHeader = document.getElementById("movie-title-header");
    this.centerPlayOverlay = document.getElementById("center-play-overlay");
    this.btnGiantPlay = document.getElementById("btn-giant-play");

    // YouTube State
    this.isYouTube = false;
    this.ytPlayer = null;
    this.ytReady = false;
    this.pendingYtVideoId = null;
    this.pendingStartPos = null;
    this.isProgrammaticAction = false;
    this.currentMediaUrl = "";
    this.currentMediaTitle = "";
    this.targetPlaybackState = "paused";
    this.targetPosition = 0;
    this.autoplayMuted = false;

    this.isScrubbing = false;
    this.danmakuLanes = 6;
    this.currentLane = 0;
    this.danmakuEnabled = true;
    this.speedIndex = 1;
    this.availableSpeeds = [0.75, 1.0, 1.25, 1.5, 2.0];

    // Initially paused
    this.playerWrapper.classList.add("paused");

    this.initYouTubeAPI();
    this.initEventListeners();
    this.startUnifiedProgressLoop();
  }

  initYouTubeAPI() {
    const setupPlayer = () => {
      if (window.YT && window.YT.Player) {
        this.ytPlayer = new window.YT.Player("youtube-player", {
          height: "100%",
          width: "100%",
          playerVars: {
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            enablejsapi: 1,
            playsinline: 1,
            origin: window.location.origin
          },
          events: {
            onReady: () => {
              this.ytReady = true;
              if (this.pendingYtVideoId) {
                const vid = this.pendingYtVideoId;
                const pos = this.pendingStartPos || 0;
                this.pendingYtVideoId = null;
                this.pendingStartPos = null;
                if (this.targetPlaybackState === "playing") {
                  this.loadAndPlayYouTube(vid, pos);
                } else {
                  this.cueYouTube(vid, pos);
                }
              }
            },
            onStateChange: (event) => {
              if (this.isProgrammaticAction) return;

              if (event.data === window.YT.PlayerState.PLAYING) {
                this.setPlayState(true);
                // If room was paused and user directly clicked play inside YouTube player
                if (this.targetPlaybackState === "paused") {
                  this.targetPlaybackState = "playing";
                  this.onUserPlaybackAction("play", this.getCurrentTime());
                }
              } else if (event.data === window.YT.PlayerState.PAUSED) {
                this.setPlayState(false);
                // If room was playing, check if user clicked pause inside YouTube iframe
                if (this.targetPlaybackState === "playing") {
                  const isIframeFocused = document.activeElement && (document.activeElement.id === "youtube-player" || document.activeElement.tagName === "IFRAME");
                  if (isIframeFocused) {
                    this.targetPlaybackState = "paused";
                    this.onUserPlaybackAction("pause", this.getCurrentTime());
                  } else {
                    // Autoplay restriction or buffering pause: recover without disrupting other tabs
                    this.handleAutoplayBlocked();
                  }
                }
              } else if (event.data === window.YT.PlayerState.ENDED) {
                if (this.onMediaEnded) this.onMediaEnded();
              }
            }
          }
        });
      } else {
        setTimeout(setupPlayer, 200);
      }
    };

    if (window.YT && window.YT.Player) {
      setupPlayer();
    } else {
      window.onYouTubeIframeAPIReady = setupPlayer;
      setTimeout(setupPlayer, 1000);
    }
  }

  initEventListeners() {
    // Play/Pause toggle from control bar
    this.btnPlayPause.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = this.playerWrapper.classList.contains("paused") ? "play" : "pause";
      this.onUserPlaybackAction(action, this.getCurrentTime());
    });

    // Center big play overlay click
    if (this.centerPlayOverlay) {
      this.centerPlayOverlay.addEventListener("click", () => {
        this.onUserPlaybackAction("play", this.getCurrentTime());
      });
    }

    // Clicking the video element itself toggles playback (when not YouTube)
    this.video.addEventListener("click", () => {
      if (!this.isYouTube) {
        const action = this.video.paused ? "play" : "pause";
        this.onUserPlaybackAction(action, this.video.currentTime);
      }
    });

    // Skip backward 10s
    if (this.btnSkipBack) {
      this.btnSkipBack.addEventListener("click", (e) => {
        e.stopPropagation();
        const target = Math.max(0, this.getCurrentTime() - 10);
        this.onUserPlaybackAction("seek", target);
      });
    }

    // Skip forward 10s
    if (this.btnSkipForward) {
      this.btnSkipForward.addEventListener("click", (e) => {
        e.stopPropagation();
        const maxDur = this.getDuration() || 9999;
        const target = Math.min(maxDur, this.getCurrentTime() + 10);
        this.onUserPlaybackAction("seek", target);
      });
    }

    // Speed toggle button
    if (this.btnSpeedToggle) {
      this.btnSpeedToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        this.speedIndex = (this.speedIndex + 1) % this.availableSpeeds.length;
        const rate = this.availableSpeeds[this.speedIndex];
        this.setPlaybackRate(rate);
        this.btnSpeedToggle.textContent = `${rate}x`;
      });
    }

    // Danmaku Toggle
    if (this.btnToggleDanmaku) {
      this.btnToggleDanmaku.addEventListener("click", (e) => {
        e.stopPropagation();
        this.danmakuEnabled = !this.danmakuEnabled;
        if (this.danmakuContainer) {
          this.danmakuContainer.style.display = this.danmakuEnabled ? "block" : "none";
        }
        this.btnToggleDanmaku.classList.toggle("active", this.danmakuEnabled);
      });
    }

    // Picture-in-Picture
    if (this.btnPip) {
      this.btnPip.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
          } else if (document.pictureInPictureEnabled && !this.isYouTube) {
            await this.video.requestPictureInPicture();
          }
        } catch (err) {
          console.warn("PiP not supported or failed:", err);
        }
      });
    }

    // Theater Mode
    if (this.btnTheater) {
      this.btnTheater.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.appContainer) {
          this.appContainer.classList.toggle("theater-mode");
          this.btnTheater.classList.toggle("active", this.appContainer.classList.contains("theater-mode"));
        }
      });
    }

    // Timeline Scrubber
    this.progressBar.addEventListener("click", (e) => {
      e.stopPropagation();
      const rect = this.progressBar.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const targetTime = pos * (this.getDuration() || 0);
      this.onUserPlaybackAction("seek", targetTime);
    });

    // Native video events
    this.video.addEventListener("play", () => this.setPlayState(true));
    this.video.addEventListener("pause", () => this.setPlayState(false));
    this.video.addEventListener("ended", () => {
      if (this.onMediaEnded) this.onMediaEnded();
    });

    // Volume control
    this.volumeSlider.addEventListener("input", (e) => {
      const vol = parseFloat(e.target.value);
      this.setVolume(vol);
    });

    this.btnMute.addEventListener("click", (e) => {
      e.stopPropagation();
      const isMuted = this.video.muted || (this.isYouTube && this.ytPlayer && this.ytPlayer.isMuted && this.ytPlayer.isMuted());
      if (isMuted) {
        this.setVolume(0.8);
        this.volumeSlider.value = 0.8;
      } else {
        this.setVolume(0);
        this.volumeSlider.value = 0;
      }
    });

    // Fullscreen
    this.btnFullscreen.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!document.fullscreenElement) {
        this.playerWrapper.requestFullscreen().catch(err => console.warn(err));
      } else {
        document.exitFullscreen().catch(err => console.warn(err));
      }
    });

    // Keyboard Shortcuts
    document.addEventListener("keydown", (e) => {
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        const action = this.isPaused() ? "play" : "pause";
        this.onUserPlaybackAction(action, this.getCurrentTime());
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        const target = Math.max(0, this.getCurrentTime() - 5);
        this.onUserPlaybackAction("seek", target);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        const target = Math.min(this.getDuration() || 9999, this.getCurrentTime() + 5);
        this.onUserPlaybackAction("seek", target);
      }
    });
  }

  // Unified Media Switching
  loadMedia(url, title, targetState = "paused", targetPos = 0) {
    if (!url) return;
    this.currentMediaUrl = url;
    this.currentMediaTitle = title;
    this.targetPlaybackState = targetState;
    this.targetPosition = targetPos;
    this.setMovieTitle(title);

    const ytId = extractYouTubeId(url);

    if (ytId) {
      this.isYouTube = true;
      if (this.ytContainer) this.ytContainer.classList.add("active");
      this.video.style.display = "none";
      this.video.pause();

      if (this.ytReady && this.ytPlayer) {
        if (targetState === "playing") {
          this.loadAndPlayYouTube(ytId, targetPos);
        } else {
          this.cueYouTube(ytId, targetPos);
        }
      } else {
        this.pendingYtVideoId = ytId;
        this.pendingStartPos = targetPos;
      }
    } else {
      this.isYouTube = false;
      if (this.ytContainer) this.ytContainer.classList.remove("active");
      this.video.style.display = "block";
      if (this.ytReady && this.ytPlayer && this.ytPlayer.pauseVideo) {
        try { this.ytPlayer.pauseVideo(); } catch (e) {}
      }

      const targetUrl = new URL(url, window.location.href).href;
      const currentSrc = this.video.currentSrc || this.video.src;
      if (currentSrc !== targetUrl) {
        this.video.src = url;
        this.video.load();
      }
      if (targetPos > 0) {
        this.video.currentTime = targetPos;
      }
      if (targetState === "playing") {
        this.video.play().catch(e => {
          console.warn("Autoplay policy for video:", e);
          this.handleAutoplayBlocked();
        });
        this.setPlayState(true);
      } else {
        this.video.pause();
        this.setPlayState(false);
      }
    }
  }

  loadAndPlayYouTube(videoId, startSeconds = 0) {
    this.isProgrammaticAction = true;
    this.targetPlaybackState = "playing";
    this.targetPosition = startSeconds;
    try {
      if (this.ytPlayer && this.ytPlayer.loadVideoById) {
        this.ytPlayer.loadVideoById({
          videoId: videoId,
          startSeconds: Math.max(0, startSeconds || 0)
        });
        this.ytPlayer.playVideo();
      }
    } catch (e) {
      console.warn("YouTube loadAndPlay error:", e);
    }
    this.setPlayState(true);
    setTimeout(() => {
      if (this.targetPlaybackState === "playing" && this.isPaused()) {
        this.handleAutoplayBlocked();
      }
      this.isProgrammaticAction = false;
    }, 900);
  }

  cueYouTube(videoId, startSeconds = 0) {
    this.isProgrammaticAction = true;
    this.targetPlaybackState = "paused";
    this.targetPosition = startSeconds;
    try {
      if (this.ytPlayer && this.ytPlayer.cueVideoById) {
        this.ytPlayer.cueVideoById({
          videoId: videoId,
          startSeconds: Math.max(0, startSeconds || 0)
        });
      }
    } catch (e) {
      console.warn("YouTube cue error:", e);
    }
    this.setPlayState(false);
    setTimeout(() => { this.isProgrammaticAction = false; }, 400);
  }

  // Autoplay recovery for background tabs & strict browser policies
  handleAutoplayBlocked() {
    if (this.autoplayMuted) return;
    console.log("Autoplay policy restricted unmuted playback - enabling muted sync fallback");
    if (this.isYouTube && this.ytPlayer) {
      try {
        this.ytPlayer.mute();
        this.ytPlayer.playVideo();
        this.autoplayMuted = true;
        this.showAutoplayBanner();
      } catch (e) {}
    } else if (this.video) {
      this.video.muted = true;
      this.video.play().then(() => {
        this.autoplayMuted = true;
        this.showAutoplayBanner();
      }).catch(e => console.warn(e));
    }
  }

  showAutoplayBanner() {
    let banner = document.getElementById("autoplay-unmute-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "autoplay-unmute-banner";
      banner.className = "autoplay-unmute-banner";
      banner.innerHTML = `<span style="font-size:1.1rem">🔊</span> <span>Click anywhere to unmute live stream</span>`;
      if (this.playerWrapper) this.playerWrapper.appendChild(banner);
    }
    banner.classList.add("visible");

    const unmuteOnClick = () => {
      this.unmuteStream();
      document.removeEventListener("click", unmuteOnClick);
      document.removeEventListener("keydown", unmuteOnClick);
    };
    document.addEventListener("click", unmuteOnClick);
    document.addEventListener("keydown", unmuteOnClick);
  }

  unmuteStream() {
    this.autoplayMuted = false;
    const banner = document.getElementById("autoplay-unmute-banner");
    if (banner) banner.classList.remove("visible");

    const targetVol = parseFloat(this.volumeSlider ? this.volumeSlider.value : "0.8") || 0.8;
    this.setVolume(targetVol);
  }

  // Unified Player Actions
  getCurrentTime() {
    if (this.isYouTube && this.ytPlayer && this.ytPlayer.getCurrentTime) {
      try { return this.ytPlayer.getCurrentTime() || 0; } catch (e) { return 0; }
    }
    return this.video.currentTime || 0;
  }

  getDuration() {
    if (this.isYouTube && this.ytPlayer && this.ytPlayer.getDuration) {
      try { return this.ytPlayer.getDuration() || 0; } catch (e) { return 0; }
    }
    return this.video.duration || 0;
  }

  isPaused() {
    if (this.isYouTube && this.ytPlayer && this.ytPlayer.getPlayerState) {
      try {
        const state = this.ytPlayer.getPlayerState();
        return state === window.YT.PlayerState.PAUSED || state === window.YT.PlayerState.CUED || state === -1 || this.playerWrapper.classList.contains("paused");
      } catch (e) {
        return this.playerWrapper.classList.contains("paused");
      }
    }
    return this.video.paused || this.playerWrapper.classList.contains("paused");
  }

  play() {
    this.targetPlaybackState = "playing";
    this.isProgrammaticAction = true;
    if (this.isYouTube && this.ytPlayer && this.ytPlayer.playVideo) {
      try { this.ytPlayer.playVideo(); } catch (e) {}
    } else {
      this.video.play().catch(e => {
        console.warn("Autoplay policy:", e);
        this.handleAutoplayBlocked();
      });
    }
    this.setPlayState(true);
    setTimeout(() => {
      if (this.targetPlaybackState === "playing" && this.isPaused()) {
        this.handleAutoplayBlocked();
      }
      this.isProgrammaticAction = false;
    }, 800);
  }

  pause() {
    this.targetPlaybackState = "paused";
    this.isProgrammaticAction = true;
    if (this.isYouTube && this.ytPlayer && this.ytPlayer.pauseVideo) {
      try {
        this.ytPlayer.pauseVideo();
      } catch (e) {}
    } else {
      this.video.pause();
    }
    this.setPlayState(false);
    setTimeout(() => { this.isProgrammaticAction = false; }, 400);
  }

  seekTo(seconds) {
    this.targetPosition = seconds;
    this.isProgrammaticAction = true;
    if (this.isYouTube && this.ytPlayer && this.ytPlayer.seekTo) {
      try {
        this.ytPlayer.seekTo(seconds, true);
        if (this.targetPlaybackState === "paused") {
          this.ytPlayer.pauseVideo();
          setTimeout(() => {
            if (this.targetPlaybackState === "paused") {
              this.ytPlayer.pauseVideo();
            }
          }, 80);
        } else if (this.targetPlaybackState === "playing") {
          this.ytPlayer.playVideo();
        }
      } catch (e) {}
    } else {
      if (this.video.readyState >= 1) {
        this.video.currentTime = seconds;
      }
    }
    setTimeout(() => { this.isProgrammaticAction = false; }, 500);
  }

  setPlaybackRate(rate) {
    if (this.isYouTube && this.ytPlayer && this.ytPlayer.setPlaybackRate) {
      try { this.ytPlayer.setPlaybackRate(rate); } catch (e) {}
    } else {
      this.video.playbackRate = rate;
    }
  }

  setVolume(vol) {
    if (this.isYouTube && this.ytPlayer && this.ytPlayer.setVolume) {
      try {
        this.ytPlayer.setVolume(vol * 100);
        if (vol === 0) this.ytPlayer.mute(); else this.ytPlayer.unMute();
      } catch (e) {}
    } else {
      this.video.volume = vol;
      this.video.muted = vol === 0;
    }
  }

  setPlayState(isPlaying) {
    if (isPlaying) {
      this.iconPlay.style.display = "none";
      this.iconPause.style.display = "block";
      this.playerWrapper.classList.remove("paused");
    } else {
      this.iconPlay.style.display = "block";
      this.iconPause.style.display = "none";
      this.playerWrapper.classList.add("paused");
    }
  }

  startUnifiedProgressLoop() {
    setInterval(() => {
      const cur = this.getCurrentTime();
      const dur = this.getDuration();
      if (!dur) return;

      const pct = (cur / dur) * 100;
      this.progressPlayed.style.width = `${pct}%`;
      this.scrubberHandle.style.left = `${pct}%`;

      const curStr = this.formatTime(cur);
      const durStr = this.formatTime(dur);
      this.timeDisplay.textContent = `${curStr} / ${durStr}`;
    }, 250);
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
  }

  // Danmaku flying bullet comment
  renderDanmakuBullet(text, color = "#FFF") {
    if (!this.danmakuContainer || !this.danmakuEnabled) return;
    const bullet = document.createElement("div");
    bullet.className = "danmaku-bullet";
    bullet.textContent = text;
    bullet.style.color = color;

    const laneHeightPercent = 80 / this.danmakuLanes;
    const topPos = (this.currentLane * laneHeightPercent) + 5;
    this.currentLane = (this.currentLane + 1) % this.danmakuLanes;
    bullet.style.top = `${topPos}%`;

    const duration = 6 + Math.random() * 2;
    bullet.style.animationDuration = `${duration}s`;

    this.danmakuContainer.appendChild(bullet);

    bullet.addEventListener("animationend", () => {
      bullet.remove();
    });
  }

  setMovieTitle(title) {
    if (this.movieTitleHeader) {
      this.movieTitleHeader.textContent = title;
    }
  }
}
