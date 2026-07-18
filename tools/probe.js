// 試合が実際に進行しているかをスナップショットで検証する（観戦と同じ経路）。
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8080');
const seen = [];

ws.on('message', (buf) => {
  let m; try { m = JSON.parse(buf.toString()); } catch { return; }
  const s = m.s;
  if (m.type !== 'snap' || !s || !s.u) return;
  seen.push({ t: Date.now(), u: s.u.map(x => ({ x: x.x, y: x.y, al: x.al, cl: x.cl, w: x.w, sw: x.sw })), b: (s.b || []).length });
});

setTimeout(() => {
  if (seen.length < 2) { console.log('snapshotが届かない: ' + seen.length); process.exit(1); }
  const a = seen[0], b = seen[seen.length - 1];
  let moved = 0, maxd = 0;
  for (let i = 0; i < Math.min(a.u.length, b.u.length); i++) {
    const d = Math.hypot(b.u[i].x - a.u[i].x, b.u[i].y - a.u[i].y);
    if (d > 1) moved++;
    if (d > maxd) maxd = d;
  }
  const alive = b.u.filter(x => x.al).length;
  const swinging = b.u.filter(x => x.sw > 0).length;
  const kinds = {};
  b.u.forEach(x => { kinds[x.cl] = (kinds[x.cl] || 0) + 1; });
  console.log(`snapshot数: ${seen.length} / 計測時間: ${((b.t - a.t) / 1000).toFixed(1)}秒`);
  console.log(`ユニット総数: ${b.u.length} / 生存: ${alive} / 移動した数: ${moved} / 最大移動距離: ${maxd.toFixed(1)}px`);
  console.log(`攻撃中(sw>0): ${swinging}`);
  console.log('兵種内訳: ' + JSON.stringify(kinds));
  process.exit(0);
}, 4000);
