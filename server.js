// Cover Battle — LAN multiplayer server (authoritative).
//
// Run on ONE PC on your Wi-Fi:
//     npm install        # installs the 'ws' WebSocket library
//     node server.js
// Then each phone/PC on the same Wi-Fi opens:  http://<that-PC-ip>:8080/netclient.html
//
// The server runs the real game engine (the same js/ files the single-player
// build uses) as the authority, fills empty slots with AI, lets humans drop in
// to any slot, and broadcasts compact snapshots ~30x/sec. Clients only send
// input and render what they receive.

const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const { loadGame, makeCanvas } = require("./tests/harness");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

// --- static file server (so phones can load the client) ---------------------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/netclient.html";
  const file = path.join(ROOT, path.normalize(rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

// --- game (authoritative) ---------------------------------------------------
const sb = loadGame();
let game;
let stage = 0;

function newMatch(idx) {
  stage = ((idx % sb.STAGES.length) + sb.STAGES.length) % sb.STAGES.length;
  game = new sb.Game(makeCanvas(), {
    onEnd: (win) => {
      broadcast({ type: "end", win });
      setTimeout(() => { newMatch(stage + 1); broadcastStatic(); }, 5000);
    },
  });
  game.serverMode = true;
  game.loadStage(stage);
  // Re-seat any still-connected players into the fresh match.
  for (const c of clients.values()) {
    if (c.team != null && c.slot != null) {
      const u = game.assignControl(c.team, c.slot);
      if (u) { u.name = c.name || u.name; c.unitIndex = game.units.indexOf(u); }
    }
  }
}

// --- websocket layer --------------------------------------------------------
const wss = new WebSocket.Server({ server });
const clients = new Map(); // ws -> { id, name, team, slot, unitIndex }
let nextId = 1;

function send(ws, obj) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }
function broadcast(obj) { const s = JSON.stringify(obj); for (const ws of clients.keys()) if (ws.readyState === WebSocket.OPEN) ws.send(s); }
function broadcastStatic() { broadcast({ type: "static", ...game.serializeStatic() }); broadcastLobby(); }
function broadcastLobby() { broadcast({ type: "lobby", roster: game.rosterState() }); }

wss.on("connection", (ws) => {
  const c = { id: nextId++, name: "", team: null, slot: null, unitIndex: -1 };
  clients.set(ws, c);
  send(ws, { type: "static", ...game.serializeStatic() });
  send(ws, { type: "lobby", roster: game.rosterState() });

  ws.on("message", (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.type === "pick") {
      // Release any previous slot, then take the requested one (if free).
      if (c.unitIndex >= 0 && game.units[c.unitIndex]) game.releaseControl(game.units[c.unitIndex]);
      const u = game.assignControl(m.team, m.slot);
      if (u) {
        c.team = m.team; c.slot = m.slot; c.name = (m.name || "Player").slice(0, 12);
        u.name = c.name;
        c.unitIndex = game.units.indexOf(u);
        send(ws, { type: "you", i: c.unitIndex, team: c.team });
        broadcastLobby();
      } else {
        send(ws, { type: "slotTaken" });
      }
    } else if (m.type === "input" && c.unitIndex >= 0) {
      const u = game.units[c.unitIndex];
      if (u && u.netInput) {
        const n = u.netInput;
        n.mx = m.mx || 0; n.my = m.my || 0;
        if (typeof m.aim === "number") n.aim = m.aim;
        n.shoot = !!m.shoot;
        if (m.bomb) n.bomb = true;
        if (m.dyn) n.dyn = true;
        if (m.slot) n.slot = m.slot;
        if (m.cycleW) n.cycleW = true;
      }
    }
  });

  ws.on("close", () => {
    if (c.unitIndex >= 0 && game.units[c.unitIndex]) game.releaseControl(game.units[c.unitIndex]);
    clients.delete(ws);
    broadcastLobby();
  });
});

// --- authoritative loop -----------------------------------------------------
newMatch(0);
const TICK = 33; // ~30 Hz
setInterval(() => {
  game._update(TICK);
  broadcast({ type: "snap", s: game.serialize() });
}, TICK);

server.listen(PORT, () => {
  console.log(`Cover Battle LAN server on http://localhost:${PORT}/netclient.html`);
  console.log("On the same Wi-Fi, others open  http://<this-PC-IP>:" + PORT + "/netclient.html");
});
