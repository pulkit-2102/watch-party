/**
 * TelemetryHUD: Live network diagnostics, drift meters, P95 metrics, and synthetic latency injector
 */
export class TelemetryHUD {
  constructor(syncManager) {
    this.sync = syncManager;

    // UI elements
    this.rttDisplay = document.getElementById("metric-rtt");
    this.offsetDisplay = document.getElementById("metric-offset");
    this.driftDisplay = document.getElementById("metric-drift");
    this.p50Display = document.getElementById("metric-p50");
    this.p95Display = document.getElementById("metric-p95");
    this.slewCountDisplay = document.getElementById("metric-slew-count");
    this.seekCountDisplay = document.getElementById("metric-seek-count");
    this.driftMeterFill = document.getElementById("drift-meter-fill");
    this.headerLatencyPill = document.getElementById("header-latency-pill");
    this.headerLatencyVal = document.getElementById("header-latency-val");
    this.videoSyncBadge = document.getElementById("video-sync-badge");

    // Synthetic latency injector slider
    this.simLatencySlider = document.getElementById("sim-latency-slider");
    this.simLatencyVal = document.getElementById("sim-latency-val");

    this.init();
  }

  init() {
    if (this.simLatencySlider && this.simLatencyVal) {
      this.simLatencySlider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        this.simLatencyVal.textContent = `+${val}ms`;
        this.sync.syntheticLatencyMs = val;
      });
    }

    // Refresh telemetry display every 250ms
    setInterval(() => this.updateDisplay(), 250);
  }

  updateDisplay() {
    const rtt = Math.round(this.sync.rtt);
    const offset = Math.round(this.sync.clockOffset * 1000);
    const drift = Math.round(this.sync.measuredDriftMs);
    const absDrift = Math.abs(drift);
    const p50 = Math.round(this.sync.p50Latency);
    const p95 = Math.round(this.sync.p95Latency);

    if (this.rttDisplay) this.rttDisplay.textContent = `${rtt} ms`;
    if (this.offsetDisplay) this.offsetDisplay.textContent = `${offset > 0 ? "+" : ""}${offset} ms`;
    if (this.p50Display) this.p50Display.textContent = `${p50} ms`;
    if (this.p95Display) this.p95Display.textContent = `${p95} ms`;
    if (this.slewCountDisplay) this.slewCountDisplay.textContent = this.sync.correctionCount.slew;
    if (this.seekCountDisplay) this.seekCountDisplay.textContent = this.sync.correctionCount.seek;

    if (this.driftDisplay) {
      this.driftDisplay.textContent = `${drift > 0 ? "+" : ""}${drift} ms`;
      if (absDrift < 80) {
        this.driftDisplay.className = "metric-value";
      } else if (absDrift <= 500) {
        this.driftDisplay.className = "metric-value warning";
      } else {
        this.driftDisplay.className = "metric-value danger";
      }
    }

    // Update Header Pill
    if (this.headerLatencyVal) {
      this.headerLatencyVal.textContent = `${rtt}ms`;
      if (rtt > 150) {
        this.headerLatencyPill.classList.add("warning");
      } else {
        this.headerLatencyPill.classList.remove("warning");
      }
    }

    // Drift meter bar (center is 50%, range is -500ms to +500ms)
    if (this.driftMeterFill) {
      const clamped = Math.max(-500, Math.min(500, drift));
      const halfWidth = (Math.abs(clamped) / 500) * 50; // percentage
      if (clamped < 0) {
        // Behind: fills left of center
        this.driftMeterFill.style.left = `${50 - halfWidth}%`;
        this.driftMeterFill.style.width = `${halfWidth}%`;
        this.driftMeterFill.style.background = absDrift < 80 ? "var(--accent-emerald)" : "var(--accent-amber)";
      } else {
        // Ahead: fills right of center
        this.driftMeterFill.style.left = `50%`;
        this.driftMeterFill.style.width = `${halfWidth}%`;
        this.driftMeterFill.style.background = absDrift < 80 ? "var(--accent-emerald)" : "var(--accent-amber)";
      }
      if (absDrift > 500) {
        this.driftMeterFill.style.background = "var(--accent-rose)";
      }
    }

    // Video floating sync status badge
    if (this.videoSyncBadge) {
      if (absDrift < 80) {
        this.videoSyncBadge.className = "sync-status-indicator synced";
        this.videoSyncBadge.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:var(--accent-emerald);box-shadow:0 0 6px var(--accent-emerald)"></span> IN SYNC (${drift}ms)`;
      } else if (absDrift <= 500) {
        this.videoSyncBadge.className = "sync-status-indicator slewing";
        const rate = this.sync.video.playbackRate.toFixed(2);
        this.videoSyncBadge.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:var(--accent-amber);box-shadow:0 0 6px var(--accent-amber)"></span> SLEWING (${rate}x | ${drift}ms)`;
      } else {
        this.videoSyncBadge.className = "sync-status-indicator drift";
        this.videoSyncBadge.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:var(--accent-rose);box-shadow:0 0 6px var(--accent-rose)"></span> SEEKING (${drift}ms)`;
      }
    }
  }
}
