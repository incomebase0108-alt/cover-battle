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
let selectedStage = 0; // ロビーでホストが選んだ次戦のステージ
let started = false; // 試合が開始済みか（待機ロビー中は false）
let hostId = null;   // 最初に接続した人がホスト（開始ボタンを押せる）
let difficulty = (sb.CONFIG && sb.CONFIG.difficulty) || "easy"; // AI難易度（ホストが選ぶ。既定はやさしい）

function newMatch(idx) {
  stage = ((idx % sb.STAGES.length) + sb.STAGES.length) % sb.STAGES.length;
  // 選択中の難易度を反映してから出撃させる（敵チームの skill に乗算される）。
  if (sb.CONFIG) sb.CONFIG.difficulty = difficulty;
  game = new sb.Game(makeCanvas(), {
    onEnd: (win) => {
      started = false; // 試合終了 → 待機ロビーに戻る（ホストが次を開始する）
      broadcast({ type: "end", win });
      setTimeout(() => { newMatch(stage + 1); broadcastStatic(); broadcastLobby(); }, 5000);
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
function broadcastLobby() { broadcast({ type: "lobby", roster: game.rosterState(), started, host: hostId, diff: difficulty, stage: selectedStage }); }

wss.on("connection", (ws) => {
  const c = { id: nextId++, name: "", team: null, slot: null, unitIndex: -1 };
  clients.set(ws, c);
  if (hostId === null) hostId = c.id; // 最初の接続者をホストに
  send(ws, { type: "hello", id: c.id });
  send(ws, { type: "static", ...game.serializeStatic() });
  send(ws, { type: "lobby", roster: game.rosterState(), started, host: hostId, diff: difficulty, stage: selectedStage });

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
    } else if (m.type === "difficulty") {
      // ホストだけが、待機ロビー中に AI 難易度（やさしい/ふつう/つよい）を変更できる。
      const valid = sb.DIFFICULTY_ORDER && sb.DIFFICULTY_ORDER.indexOf(m.level) >= 0;
      if (c.id === hostId && !started && valid) {
        difficulty = m.level;
        if (sb.CONFIG) sb.CONFIG.difficulty = difficulty;
        if (game && game.applyDifficultyToAi) game.applyDifficultyToAi(); // 待機中のAIにも即反映
        broadcastLobby();
      }
    } else if (m.type === "stage") {
      // ホストだけが、待機ロビー中にステージを選べる。
      if (c.id === hostId && !started && m.index >= 0 && m.index < sb.STAGES.length) {
        selectedStage = m.index;
        broadcastLobby();
      }
    } else if (m.type === "start") {
      // ホストだけが「新しい試合を最初から」開始できる。選択ステージで出撃。
      if (c.id === hostId && !started) {
        newMatch(selectedStage);
        started = true;
        broadcast({ type: "static", ...game.serializeStatic() });
        // 各プレイヤーに新試合での操作ユニット番号を通知し直す。
        for (const [cws, cc] of clients) {
          if (cc.unitIndex >= 0) send(cws, { type: "you", i: cc.unitIndex, team: cc.team });
        }
        broadcast({ type: "start" });
        broadcastLobby();
      }
    } else if (m.type === "input" && c.unitIndex >= 0) {
      const u = game.units[c.unitIndex];
      if (u && u.netInput) {
        const n = u.netInput;
        n.mx = m.mx || 0; n.my = m.my || 0;
        if (typeof m.aim === "number") n.aim = m.aim;
        n.shoot = !!m.shoot;
        if (m.bomb) n.bomb = true;
        if (m.ability) n.ability = true;
        if (m.slot) n.slot = m.slot;
        if (m.cycleW) n.cycleW = true;
      }
    }
  });

  ws.on("close", () => {
    if (c.unitIndex >= 0 && game.units[c.unitIndex]) game.releaseControl(game.units[c.unitIndex]);
    clients.delete(ws);
    // ホストが抜けたら、残っている誰かを新ホストにする。
    if (c.id === hostId) {
      const next = clients.values().next().value;
      hostId = next ? next.id : null;
    }
    broadcastLobby();
  });
});

// --- authoritative loop -----------------------------------------------------
// 物理更新は ~60Hz（単独プレイと同じ速度）。移動量が1更新あたり固定なので、
// ここを30Hzにするとゲーム全体が半速になる（＝「LANだと遅い」の原因）。
// スナップショット送信は ~30Hz に間引いて帯域を節約する。
newMatch(0);
const STEP = 16;       // physics step ≈60Hz（matches single-player）
const SNAP_EVERY = 33; // broadcast ≈30Hz
let sinceSnap = 0;
setInterval(() => {
  if (!started || game.over) return; // 待機ロビー中・試合終了後は進めない（途中参加にならない）
  game._update(STEP);
  sinceSnap += STEP;
  if (sinceSnap >= SNAP_EVERY) {
    sinceSnap = 0;
    broadcast({ type: "snap", s: game.serialize() });
  }
}, STEP);

server.listen(PORT, () => {
  console.log(`Cover Battle LAN server on http://localhost:${PORT}/netclient.html`);
  console.log("On the same Wi-Fi, others open  http://<this-PC-IP>:" + PORT + "/netclient.html");
});
