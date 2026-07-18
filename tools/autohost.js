// 観戦fps計測用の自動ホスト。最初に接続してホスト権を取り、試合を開始する。
// 試合が終わったら（ロビーに戻ったら）また開始し、常に8v8が動いている状態を保つ。
const WebSocket = require('ws');

const URL = process.env.CB_URL || 'ws://localhost:8080';
let ws, retry = 0;

function connect() {
  ws = new WebSocket(URL);

  ws.on('open', () => { retry = 0; console.log('[autohost] connected'); });

  ws.on('message', (buf) => {
    let m; try { m = JSON.parse(buf.toString()); } catch { return; }
    if (m.type !== 'lobby') return;
    const isHost = m.host != null;
    console.log(`[autohost] lobby: started=${m.started} host=${m.host}`);
    // 待機ロビーに居る間は開始を送る（ホストでなければサーバ側で無視される）
    if (!m.started && isHost) {
      ws.send(JSON.stringify({ type: 'start' }));
      console.log('[autohost] sent start');
    }
  });

  ws.on('close', () => {
    console.log('[autohost] closed, retrying');
    if (retry++ < 20) setTimeout(connect, 1000);
  });
  ws.on('error', (e) => console.log('[autohost] error', e.message));
}

connect();
