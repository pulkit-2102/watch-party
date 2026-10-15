/**
 * Real-Time Synchronization Engine (NTP-style clock sync + Dual-mode drift corrector)
 * Supports unified player (HTML5 Video & YouTube IFrame API)
 */
export class SyncManager {
  constructor(socketSender, playerController) {
    this.send = socketSender;
    this.player = playerController;

    // Clock synchronization
    this.clockOffset = 0.0; // server_time - client_time in seconds
    this.rtt = 0.0;         // round trip time in ms
    this.rttHistory = [];
    this.offsetHistory = [];

    // Authoritative playback state from server
    this.authoritativeState = {
      media_url: "",
      media_title: "",
      state: "paused",
      position_seconds: 0.0,
      playback_rate: 1.0,
      server_timestamp: Date.now() / 1000,
      version: 0,
      updated_by: "system"
    };

    // Telemetry & metrics
    this.measuredDriftMs = 0.0;
    this.propagationLatencies = [];
    this.p50Latency = 0.0;
    this.p95Latency = 0.0;
    this.correctionCount = { slew: 0, seek: 0 };
    this.syntheticLatencyMs = 0; // for live testing / demo

    // Interval timers
    this.ntpTimer = null;
    this.driftCheckTimer = null;
    this.isSlewing = false;

    // Event hooks
    this.onDriftUpdate = null;
    this.onStateChange = null;
  }

  start() {
    // Initial rapid NTP sync
    this.sendNtpPing();
    setTimeout(() => this.sendNtpPing(), 400);
    setTimeout(() => this.sendNtpPing(), 800);

    // Continuous NTP sync loop every 2.5s
    this.ntpTimer = setInterval(() => this.sendNtpPing(), 2500);

    // Drift monitor loop every 300ms
    this.driftCheckTimer = setInterval(() => this.evaluateAndCorrectDrift(), 300);
  }

  stop() {
    if (this.ntpTimer) clearInterval(this.ntpTimer);
    if (this.driftCheckTimer) clearInterval(this.driftCheckTimer);
  }

  sendNtpPing() {
    const t0 = (Date.now() + this.syntheticLatencyMs) / 1000;
    this.send({
      type: "ntp_ping",
      t0: t0
    });
  }

  handleNtpPong(msg) {
    const t3 = (Date.now() + this.syntheticLatencyMs) / 1000;
    const t0 = msg.t0;
    const t1 = msg.t1;
    const t2 = msg.t2;

    const roundTripTime = Math.max(0.0001, (t3 - t0) - (t2 - t1));
    const offset = ((t1 - t0) + (t2 - t3)) / 2;

    this.rtt = roundTripTime * 1000; // in ms
    this.rttHistory.push(this.rtt);
    if (this.rttHistory.length > 20) this.rttHistory.shift();

    this.offsetHistory.push(offset);
    if (this.offsetHistory.length > 10) this.offsetHistory.shift();

    // Median filter for offset to resist network jitter
    const sortedOffsets = [...this.offsetHistory].sort((a, b) => a - b);
    const medianOffset = sortedOffsets[Math.floor(sortedOffsets.length / 2)];
    this.clockOffset = medianOffset;

    // Report telemetry to server
    this.send({
      type: "telemetry_report",
      latency_ms: this.rtt,
      client_position: this.player ? this.player.getCurrentTime() : 0,
      drift_ms: this.measuredDriftMs
    });
  }

  getEstimatedServerTime() {
    const localSec = (Date.now() + this.syntheticLatencyMs) / 1000;
    return localSec + this.clockOffset;
  }

  getAuthoritativePosition() {
    if (this.authoritativeState.state !== "playing") {
      return this.authoritativeState.position_seconds;
    }
    const nowServer = this.getEstimatedServerTime();
    const elapsed = Math.max(0, nowServer - this.authoritativeState.server_timestamp);
    return this.authoritativeState.position_seconds + (elapsed * this.authoritativeState.playback_rate);
  }

  handlePlaybackUpdate(msg) {
    const newPlayback = msg.playback;
    const transmitTime = msg.server_transmit_time;

    // Measure propagation latency
    if (transmitTime) {
      const nowEstServer = this.getEstimatedServerTime();
      const propMs = Math.max(0, (nowEstServer - transmitTime) * 1000);
      this.recordPropagationLatency(propMs);
    }

    const previousUrl = this.authoritativeState ? this.authoritativeState.media_url : "";
    this.authoritativeState = newPlayback;

    // Target position calculation
    const targetPos = this.getAuthoritativePosition();

    // Synchronize media source if URL changed or player hasn't loaded it
    if (this.player && newPlayback.media_url) {
      if (previousUrl !== newPlayback.media_url || this.player.currentMediaUrl !== newPlayback.media_url) {
        this.player.loadMedia(
          newPlayback.media_url,
          newPlayback.media_title,
          newPlayback.state,
          targetPos
        );
      }
    }

    // Apply target playback state
    if (this.player) {
      if (newPlayback.state === "playing") {
        const cur = this.player.getCurrentTime();
        if (Math.abs(cur - targetPos) > 0.4) {
          this.player.seekTo(targetPos);
        }
        this.player.play();
      } else if (newPlayback.state === "paused") {
        this.player.pause();
        const cur = this.player.getCurrentTime();
        if (Math.abs(cur - targetPos) > 0.3) {
          this.player.seekTo(targetPos);
        }
        setTimeout(() => {
          if (this.authoritativeState.state === "paused") {
            this.player.pause();
          }
        }, 60);
      }
    }

    if (this.onStateChange) {
      this.onStateChange(this.authoritativeState);
    }
  }

  recordPropagationLatency(ms) {
    this.propagationLatencies.push(ms);
    if (this.propagationLatencies.length > 50) this.propagationLatencies.shift();

    const sorted = [...this.propagationLatencies].sort((a, b) => a - b);
    this.p50Latency = sorted[Math.floor(sorted.length * 0.50)] || 0;
    this.p95Latency = sorted[Math.floor(sorted.length * 0.95)] || 0;
  }

  evaluateAndCorrectDrift() {
    if (!this.player) return;

    // IMPORTANT: If room is paused, drift does NOT accumulate!
    // Do NOT call seekTo or slew while paused, as that unpauses YouTube!
    if (this.authoritativeState.state !== "playing") {
      this.isSlewing = false;
      if (!this.player.isPaused()) {
        this.player.pause();
      }
      return;
    }

    // If room is playing and player is paused (e.g. initial load or recovery), trigger play!
    if (this.player.isPaused()) {
      this.player.play();
    }

    const targetPos = this.getAuthoritativePosition();
    const clientPos = this.player.getCurrentTime();
    const driftSec = clientPos - targetPos;
    const driftMs = driftSec * 1000;
    const absDriftMs = Math.abs(driftMs);

    this.measuredDriftMs = driftMs;
    const baseRate = this.authoritativeState.playback_rate || 1.0;

    // Status:
    // 1. In Sync: < 80ms
    if (absDriftMs < 80) {
      if (this.isSlewing) {
        this.player.setPlaybackRate(baseRate);
        this.isSlewing = false;
      }
      if (this.onDriftUpdate) this.onDriftUpdate(driftMs, "synced", baseRate);
      return;
    }

    // 2. Soft Slew: 80ms - 500ms
    if (absDriftMs <= 500) {
      this.isSlewing = true;
      this.correctionCount.slew++;
      const adjustedRate = driftMs < 0 ? baseRate * 1.05 : baseRate * 0.95;
      this.player.setPlaybackRate(adjustedRate);
      if (this.onDriftUpdate) this.onDriftUpdate(driftMs, "slewing", adjustedRate);
      return;
    }

    // 3. Hard Seek: > 500ms
    this.isSlewing = false;
    this.correctionCount.seek++;
    this.player.setPlaybackRate(baseRate);
    this.player.seekTo(targetPos);
    if (this.onDriftUpdate) this.onDriftUpdate(driftMs, "hard_seek", baseRate);
  }
}
