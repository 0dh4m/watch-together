# 🍿 Watch Together — Synced Media Streaming & WebRTC Mesh Voice PWA

<div align="center">

[![Author](https://img.shields.io/badge/Author-0dh4m-2563eb?style=flat-square&logo=github&logoColor=white)](https://github.com/0dh4m)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Watch%20Together-0284c7?style=flat-square&logo=google-chrome&logoColor=white)](https://0dh4m.github.io/demos/watch-together/index.html)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P%20Voice%20Mesh-38bdf8?style=flat-square)](https://github.com/0dh4m/watch-together)
[![Socket.IO](https://img.shields.io/badge/Real--Time-Socket.IO%20v4-6366f1?style=flat-square)](https://github.com/0dh4m/watch-together)
[![License](https://img.shields.io/badge/License-MIT-slate?style=flat-square)](LICENSE)

</div>

**Watch Together** is a real-time, progressive web application (PWA) for synchronized media playback across distributed clients. It combines sub-second clock drift compensation (<1.5s delta), WebRTC P2P mesh voice rooms, dynamic queue management, live WebSocket chat, and floating reaction physics.

> **Live demo:** the hosted demo is a browser-side simulator. The full synchronized experience requires the Node.js server below.

---

## ⚡ Core Architectural Capabilities

### 1. Sub-Second Synchronization Engine (`syncEngine.js`)
- Continuously measures round-trip time (RTT) and host clock drift.
- Applies subtle playback rate adjustments (`video.playbackRate = 1.0 + (Δt * 0.05)`) for micro-drifts under 1.5 seconds, avoiding abrupt audio cuts.
- Issues atomic timestamp seeks only when drift exceeds the 1.5s threshold.

### 2. Low-Latency WebRTC Voice Chat (`voiceChat.js`)
- Full-mesh peer-to-peer audio architecture using public STUN servers. TURN is not bundled; add a TURN server if you need connectivity across restrictive NATs.
- Built-in dynamic gain control, acoustic echo cancellation (AEC), and noise suppression via Web Audio API nodes.

### 3. High-Performance Floating Reaction Physics
- Canvas-based particle physics engine rendering emoji reactions (🍿, 🔥, ❤️, 👏) at 60 FPS with zero layout thrashing.

### 4. Multi-Source Streaming
- Supports direct MP4/WebM video streams, HLS/m3u8 live playlists, YouTube video IDs, and user screen sharing.

---

## 🛠️ Tech Stack & Directory Structure

```text
├── server/
│   ├── index.js              # Express HTTP & WebSocket server entry
│   ├── socketHandlers.js     # Real-time sync, room join & chat events
│   ├── rooms.js              # In-memory room registry with persistence
│   ├── db.js                 # SQLite persistent storage (node:sqlite)
│   └── routes/api.js         # RESTful room metadata API
├── public/
│   ├── index.html            # PWA UI layout
│   ├── css/style.css         # Custom responsive styling
│   ├── js/
│   │   ├── syncEngine.js     # Clock compensation & drift math
│   │   ├── voiceChat.js      # WebRTC RTCPeerConnection mesh
│   │   ├── player.js         # Video player abstraction & controls
│   │   ├── chat.js           # Live WebSocket room messaging
│   │   ├── queue.js          # Shared media playlist queue
│   │   ├── polls.js          # Room polls
│   │   ├── screenShare.js    # Screen-sharing capture
│   │   ├── socketClient.js   # Socket.IO client wrapper
│   │   ├── subtitles.js      # Subtitle tracks
│   │   ├── sfx.js            # Web Audio synthesized sound FX
│   │   ├── i18n.js           # English / French UI strings
│   │   └── ui.js             # Shared UI helpers
│   ├── manifest.json         # Progressive Web App manifest
│   └── service-worker.js     # Offline shell caching
├── scripts/generate-icons.js # PWA icon generator
└── package.json
```

---

## 🚀 Live Demo & Getting Started

Experience the interactive simulator:
👉 **[Launch Watch Together Demo](https://0dh4m.github.io/demos/watch-together/index.html)**

### Requirements
- **Node.js 22+** (the server uses the built-in `node:sqlite` module).

### Running Locally
```bash
git clone https://github.com/0dh4m/watch-together.git
cd watch-together
npm install
npm start
# Open http://localhost:3000 in your browser
```

---

## 👨‍💻 Author

**Adham Cherkaoui Eddeqaqi (`0dh4m`)**
- 📍 Rabat / Salé, Morocco
- ✉️ `0dh4mm@gmail.com`
- 🌐 [0dh4m.github.io](https://0dh4m.github.io/)

---

## 📄 License

MIT — see [LICENSE](LICENSE).
