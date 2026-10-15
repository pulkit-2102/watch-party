# 🎬 WatchParty — Real-Time Synchronized Video & Shared Discovery

A production-grade, real-time synchronized video co-watching web application. Watch videos together with frame-accurate synchronization, NTP-style clock drift detection & correction, full YouTube IFrame Player integration, Japanese-style Danmaku bullet comments, live emoji reactions, interactive polls, and a collaborative playlist.

---

## 🌟 Key Highlights & Engineering Features

### 1. ⏱️ NTP Clock Sync & Dual-Mode Drift Corrector
- **4-Timestamp NTP Exchange**: Continuous round-trip exchanges ($t_0, t_1, t_2, t_3$) compute network round-trip time ($\text{RTT}$) and client-to-server clock offset ($\theta$) with median filtering to resist network jitter.
- **Dual-Threshold Drift Corrector**:
  - **$< 80\text{ ms}$ (In-Sync Zone)**: Preserves silky smooth native playback without jarring corrections.
  - **$80\text{ ms} - 500\text{ ms}$ (Soft Slew)**: Imperceptibly slews playback rate ($1.05\times$ or $0.95\times$) to align clocks smoothly without audio pitch warping.
  - **$> 500\text{ ms}$ (Hard Seek)**: Millisecond-accurate instantaneous seek.
- **Monotonic Version Resolution**: Resolves concurrent seek/pause race conditions and enforces Host-Only permissions.
- **Atomic Late Joins & Auto-Reconnection**: Late joiners immediately receive a full state `snapshot` locking onto the exact playing frame; auto-reconnect handles network hiccups with exponential backoff and jitter.

### 2. 📺 Unified Streaming Player (Local HD Movies & YouTube)
- **Local HD Movie Catalog**: Bundled open-access HD movies and trailers served with HTTP 206 Partial Content range requests — zero 403 Forbidden cloud errors.
- **Full YouTube Support**: Paste any YouTube link or video ID via the **+ Custom Link** modal with live thumbnail preview.
- **Multi-Tab YouTube Sync & Autoplay Recovery**: Synchronizes playback state and seek positions across any number of tabs, with automatic fallback for browser autoplay restrictions.

### 3. 💬 Rich Real-Time Multi-User Interactivity
- **Danmaku Flying Comments**: Live bullet comments stream horizontally across video screens with speed variation and staggered collision-free lanes.
- **Emoji Reaction Bursts**: Canvas particle physics engine rendering animated emoji bursts (❤️, 🔥, 👏, 😂, 🍿, 😱, 🚀) paired with Web Audio sound effects.
- **Interactive Group Polls**: Real-time polling with live animated vote distributions and duration countdown timers.
- **Collaborative Playlist Queue**: Add custom streams or catalog movies to a shared queue with dynamic upvoting to determine what plays next.
- **Host Privileges**: Room creation (`NEON-77`), one-click invite link sharing, Host-Only lock switch, and seamless host transfer.
- **Diagnostics HUD & Synthetic Lag Injector**: Live telemetry readout of RTT, clock offset, drift (ms), P95 latency, and a slider to inject simulated network jitter (+0 to +600ms) to inspect drift correction live.

---

## 📊 Benchmark & Latency Verification

Verified under automated concurrent load with **12 concurrent WebSocket participants** firing 30 synchronized playback mutations (`tests/benchmark_load.py`):

| Metric / Constraint | Requirement | Measured Result | Status |
| :--- | :--- | :--- | :--- |
| **Concurrent Users per Room** | $\ge 10$ users | **12 active users** | **PASS ✅** |
| **Control Propagation Latency (P95)** | $\le 250\text{ ms}$ | **3.47 ms** | **PASS ✅ (~70x faster)** |
| **P50 (Median) Propagation Latency** | - | **1.69 ms** | **PASS ✅** |
| **P99 Propagation Latency** | - | **4.16 ms** | **PASS ✅** |
| **Playback Drift (P95)** | $\le 500\text{ ms}$ | **3.19 ms** | **PASS ✅ (~150x tighter)** |
| **Late Join Frame Alignment** | Exact frame | **Verified (< 100ms)** | **PASS ✅** |
| **Automated Unit Tests** | 100% pass | **11 / 11 passed (0.001s)** | **PASS ✅** |

> Complete benchmark methodology and latency distribution histograms are available in [`docs/LATENCY_AND_TEST_REPORT.md`](docs/LATENCY_AND_TEST_REPORT.md).

---

## 🏗️ Architecture & Project Structure

```
watch-party/
├── run.py                       # Server runner (Uvicorn / FastAPI entry point)
├── requirements.txt             # Python dependencies
├── .gitignore                   # Git exclusion rules
├── README.md                    # Documentation & guide
├── server/
│   ├── main.py                  # FastAPI WebSocket & REST endpoints
│   ├── rooms.py                 # In-memory room manager, state machine & playlist
│   ├── sync_engine.py           # NTP math, clock offset & drift calculations
│   └── movies_data.py           # Catalog data & fuzzy search engine
├── static/
│   ├── index.html               # Studio dark-mode UI with theater & PiP modes
│   ├── css/
│   │   └── styles.css           # Glassmorphism aesthetic & ambilight effects
│   ├── js/
│   │   ├── app.js               # Main application coordinator
│   │   ├── player.js            # Unified player adapter (HTML5 Video + YouTube API)
│   │   ├── sync.js              # Real-time NTP ping & drift corrector loop
│   │   ├── catalog.js           # Movie discovery with fuzzy search
│   │   ├── playlist.js          # Shared queue with upvoting & custom link modal
│   │   ├── chat.js              # Chat messages & emoji particle burst system
│   │   ├── polls.js             # Group polls system
│   │   └── telemetry.js         # HUD latency and synthetic jitter injector
│   └── media/                   # Local HD sample video files
├── tests/
│   ├── test_sync_engine.py      # Unit tests for clock offset & drift logic
│   ├── test_room_manager.py     # Unit tests for room manager, host transfer & queue
│   ├── test_multitab_youtube.py # Multi-tab YouTube sync integration test
│   └── benchmark_load.py        # Automated 12-user concurrency benchmark
└── docs/
    └── LATENCY_AND_TEST_REPORT.md # Full benchmark & latency analysis report
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Python 3.10+ (tested on Python 3.14)
- Git (optional, for cloning)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/<YOUR-USERNAME>/watch-party.git
cd watch-party

# Install dependencies
pip install -r requirements.txt
```

### 3. Run the Server
```bash
python run.py
```
Open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** in your browser.

---

## 👥 Multi-User Testing

### On the Same Laptop (Multiple Tabs)
1. Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in **Tab 1** (creates room `NEON-77`).
2. Open [http://127.0.0.1:8000/room/NEON-77](http://127.0.0.1:8000/room/NEON-77) in **Tab 2** (joins as participant).
3. Play, pause, or seek in either tab to watch instant synchronization.

### On Another Laptop / Phone (Same Wi-Fi Network)
1. Ensure both devices are connected to the same Wi-Fi.
2. Find the host laptop's IP address (e.g. `172.16.249.76` or `192.168.1.X`).
3. On the other laptop or phone, navigate to:
   ```
   http://<HOST-IP>:8000
   ```
   *(e.g., `http://172.16.249.76:8000/room/NEON-77`)*

---

## 🧪 Running Automated Tests

```bash
# Run unit tests
python -m unittest discover tests

# Run multi-tab YouTube sync integration test
python tests/test_multitab_youtube.py

# Run concurrency benchmark (12 users, latency & drift measurement)
python tests/benchmark_load.py
```

---

## 📜 License
MIT License. Built for real-time collaborative entertainment.
