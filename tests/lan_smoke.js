// LAN サーバーの手動スモーク（テストランナー対象外）。
// ホストとして接続→ステージ選択→開始 が同期されるか確認する。
const WebSocket = require("ws");
const PORT = process.env.PORT || "8097";
const ws = new WebSocket("ws://localhost:" + PORT);
const target = 10; // 山城決戦（STAGES 最後）を要求
let requested = false, started = false, lobbyStage = null;
ws.on("message", (raw) => {
  const m = JSON.parse(raw);
  if (m.type === "static" && !started && !requested) {
    requested = true;
    ws.send(JSON.stringify({ type: "stage", index: target }));
  } else if (m.type === "lobby") {
    lobbyStage = m.stage;
    if (lobbyStage === target && !started) {
      started = true;
      ws.send(JSON.stringify({ type: "pick", team: "blue", slot: 0, name: "将" }));
      ws.send(JSON.stringify({ type: "start" }));
    }
  } else if (m.type === "static" && started) {
    const ok = lobbyStage === target && m.stage === target;
    console.log(JSON.stringify({ ok, target, lobbyStage, startStaticStage: m.stage }));
    ws.close();
    process.exit(ok ? 0 : 1);
  }
});
ws.on("error", (e) => { console.log(JSON.stringify({ ok: false, error: String(e) })); process.exit(1); });
setTimeout(() => { console.log(JSON.stringify({ ok: false, timeout: true, lobbyStage })); process.exit(1); }, 4000);
