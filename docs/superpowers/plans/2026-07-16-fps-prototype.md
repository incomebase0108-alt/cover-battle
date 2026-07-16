# スマホfps検証プロトタイプ（棒人間8体×城下マップ） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 戦国城下マップで棒人間8体（1体ジョイスティック操作＋7体AI徘徊）を動かし、スマホ実機で fps と負荷源（影/密度/アニメ）を測れるページを `prototype/3d/` に作る。

**Architecture:** machi-maker の citygen.js（無改変コピー）で街データを実行時生成し、viewer.js を縮めた ProtoViewer が InstancedMesh で描画。棒人間・AI徘徊・ジョイスティック・fps HUD は新規の小さいモジュール。main.js が組み立てて requestAnimationFrame ループを回す。

**Tech Stack:** Three.js r128（CDN）、素の JavaScript（ビルドなし）、配信は既存 server.js（port 8080、無改変）。

## Global Constraints

- スペック: `docs/superpowers/specs/2026-07-16-fps-prototype-design.md`
- cover-battle 本体（`js/`・`server.js`・`index.html`・`netclient.html`）には一切触れない。全ファイル `prototype/3d/` 配下に新規作成。
- Three.js は r128 を CDN 読込（machi-maker と同じ）: `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`
- 自動テストは書かない（スペックで決定済み）。代わりに各タスク末尾で Node スモーク実行 or Edge ヘッドレススクショで動作確認する。
- Node 検証で使うモジュールは `if (typeof module !== 'undefined' && module.exports) module.exports = X;` の行を末尾に置く（machi-maker の慣例と同じ）。
- Edge ヘッドレスの罠（過去に確立済みの回避策）:
  - `--virtual-time-budget` は requestAnimationFrame を進めない → main.js は **街生成直後に1フレームを同期描画**しておく（これでロード時スクショに街が写る）。
  - swiftshader で `--screenshot` が白落ちすることがある → その時は一時コピーに toDataURL 注入で回収。
- **rAF モンキーパッチ検証の具体手順**（Task 5/6 の「時間経過あり」確認で使う）: `prototype/3d/index.html` をスクラッチ領域に一時コピーし、`<script src="citygen.js">` の**前**に次の1行ブロックを差し込み、コピー内の `src="..."` 相対参照を `file:///C:/dev/cover-battle/prototype/3d/` の絶対URLに置換してから Edge ヘッドレスで開く:

  ```html
  <script>
  // ヘッドレスの --virtual-time-budget は rAF を進めないため setTimeout 駆動に差し替える
  window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16);
  // 検証結果の吐き出し: 5秒相当後に座標とHUDを console へ
  setTimeout(() => {
    const P = window.__proto;
    console.log('PROTO_DUMP', JSON.stringify({
      units: P ? P.units.map(u => [Math.round(u.x), Math.round(u.z)]) : null,
      fps: document.getElementById('fpsval').textContent,
    }));
  }, 5000);
  </script>
  ```

  実行は `--enable-logging=stderr --v=0` を付けて stderr から `PROTO_DUMP` 行を拾う（`--virtual-time-budget=9000` でタイマーごと早送りされる）。
- コミットはタスクごと。メッセージは日本語で `proto:` プレフィックス。

---

### Task 1: 足場（citygen.js コピー＋index.html＋街データ生成の確認）

**Files:**
- Create: `prototype/3d/citygen.js`（`C:\dev\machi-maker\js\citygen.js` の無改変コピー）
- Create: `prototype/3d/index.html`

**Interfaces:**
- Produces: `CityGen.generate(opts)` → 街データ、`CityGen.buildPrims(data)` → `{prims:[{t,x,y,z,sx,sy,sz,ry,c}...], bounds:{cx,cz,r}}`（後続タスクはこれを描画する）
- Produces: `index.html` の DOM — `#stage`（描画先）、`#hud` `#fpsval` `#minfps`（fps表示）、`#btnShadow` `#btnDensity` `#btnAnim`（トグル）、`#nowebgl`（WebGL不可時表示）

- [ ] **Step 1: citygen.js をコピー**

```bash
mkdir -p /c/dev/cover-battle/prototype/3d
cp /c/dev/machi-maker/js/citygen.js /c/dev/cover-battle/prototype/3d/citygen.js
```

- [ ] **Step 2: Node で街生成をスモーク確認**

```bash
cd /c/dev/cover-battle && node -e "
const CityGen = require('./prototype/3d/citygen.js');
const d = CityGen.generate({seed:1234,era:'sengoku',avenueW:8,streetW:3.5,blocks:5,maxFloors:2,density:0.9,treeAmt:0.5,signals:0,poles:0,marks:0,konbini:0,parks:1,river:1,station:0,police:0,hospital:0,shrine:1,fortTemple:1,well:1,gate:1,ditch:1});
const b = CityGen.buildPrims(d);
console.log('prims=', b.prims.length, 'bounds=', JSON.stringify(b.bounds));
if (b.prims.length < 300) throw new Error('街が小さすぎる');
"
```

Expected: `prims= <数百〜数千> bounds= {"cx":...,"cz":...,"r":...}` が出て例外なし。

- [ ] **Step 3: index.html を作成**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>3D負荷検証プロトタイプ — cover-battle</title>
<style>
  html,body{margin:0;height:100%;overflow:hidden;touch-action:none;font-family:sans-serif;-webkit-user-select:none;user-select:none;}
  #stage{position:fixed;inset:0;}
  #hud{position:fixed;top:8px;right:8px;background:rgba(0,0,0,.55);color:#fff;padding:6px 10px;border-radius:8px;font-size:15px;z-index:10;text-align:right;line-height:1.4;}
  #toggles{position:fixed;top:8px;left:8px;display:flex;gap:6px;z-index:10;}
  #toggles button{padding:9px 11px;border:0;border-radius:8px;background:rgba(0,0,0,.55);color:#fff;font-size:13px;}
  #nowebgl{display:none;position:fixed;inset:0;background:#fff;color:#c00;padding:40px;font-size:18px;z-index:99;}
</style>
</head>
<body>
<div id="stage"></div>
<div id="toggles">
  <button id="btnShadow">影:OFF</button>
  <button id="btnDensity">密度:中</button>
  <button id="btnAnim">アニメ:ON</button>
</div>
<div id="hud">FPS <span id="fpsval">--</span><br><span id="minfps">最低 --</span></div>
<div id="nowebgl">WebGL が使えません。この端末では検証できません。</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="citygen.js"></script>
<script src="proto-viewer.js"></script>
<script src="stickman.js"></script>
<script src="bots.js"></script>
<script src="joystick.js"></script>
<script src="main.js"></script>
</body>
</html>
```

（proto-viewer.js 等はまだ無い＝404 になるが、この段階では index.html の構造確認まで）

- [ ] **Step 4: コミット**

```bash
cd /c/dev/cover-battle && git add prototype/3d/ && git commit -m "proto: 3D負荷検証の足場(citygen.jsコピー＋index.html)"
```

---

### Task 2: ProtoViewer（InstancedMesh 描画層＋影対応）

**Files:**
- Create: `prototype/3d/proto-viewer.js`

**Interfaces:**
- Consumes: `CityGen.buildPrims()` の返値（Task 1）
- Produces: `ProtoViewer.init(stageEl)` / `ProtoViewer.showCity(built)` / `ProtoViewer.setShadow(on:boolean)` / `ProtoViewer.render()` / `ProtoViewer.resize()` / getter `ProtoViewer.scene` `ProtoViewer.camera` `ProtoViewer.renderer`

- [ ] **Step 1: proto-viewer.js を作成**

machi-maker viewer.js の InstancedMesh 部分を土台に、配置モード・GLB・自動回転を除去し影対応を追加したもの:

```javascript
// proto-viewer.js — machi-maker viewer.js を検証用に縮めた描画層
// InstancedMesh のまとめ方は viewer.js と同じ。配置モード/GLB/自動回転は除去し、影対応を追加。
const ProtoViewer = (function () {
  'use strict';
  let scene, camera, renderer, group, stageEl, sun;
  let boxGeo, prismGeo, cylGeo, sphereGeo;

  function makeGeos() {
    boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const s = new THREE.Shape();
    s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.closePath();
    prismGeo = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
    prismGeo.translate(0, 0, -0.5);
    cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
    sphereGeo = new THREE.SphereGeometry(0.5, 12, 9);
  }

  function init(stage) {
    stageEl = stage;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfd7e8);
    camera = new THREE.PerspectiveCamera(60, 1, 0.5, 4000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    stage.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.52));
    sun = new THREE.DirectionalLight(0xfff2dc, 0.78);
    sun.position.set(120, 180, 80);
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);
    scene.add(sun.target);
    const fill = new THREE.DirectionalLight(0xd8e4ee, 0.28);
    fill.position.set(-90, 60, -110);
    scene.add(fill);
    makeGeos();
    window.addEventListener('resize', resize);
    resize();
  }

  function showCity(built) {
    if (group) { scene.remove(group); disposeGroup(group); }
    group = new THREE.Group();
    const byKey = new Map();
    for (const p of built.prims) {
      if (p.t === 'mesh') continue; // 城の焼き込みメッシュは今回は使わない（sengoku生成物はプリミティブのみ）
      const key = p.t + '|' + p.c;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(p);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(),
      v = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const [key, list] of byKey) {
      const [t, c] = key.split('|');
      const geo = t === 'prism' ? prismGeo : (t === 'cyl' ? cylGeo : (t === 'sphere' ? sphereGeo : boxGeo));
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: c }), list.length);
      list.forEach((p, i) => {
        e.set(0, p.ry || 0, 0); q.setFromEuler(e);
        v.set(p.x, p.y, p.z); sc.set(p.sx, p.sy, p.sz);
        m.compose(v, q, sc); mesh.setMatrixAt(i, m);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    scene.add(group);
    // 影カメラを街の範囲に合わせる
    const b = built.bounds;
    sun.position.set(b.cx + 120, 180, b.cz + 80);
    sun.target.position.set(b.cx, 0, b.cz);
    sun.shadow.camera.left = -b.r * 1.2;
    sun.shadow.camera.right = b.r * 1.2;
    sun.shadow.camera.top = b.r * 1.2;
    sun.shadow.camera.bottom = -b.r * 1.2;
    sun.shadow.camera.far = 500;
    sun.shadow.camera.updateProjectionMatrix();
  }

  function disposeGroup(g) {
    g.traverse(o => { if (o.isMesh) { o.material.dispose(); } });
  }

  function setShadow(on) {
    renderer.shadowMap.enabled = on;
    sun.castShadow = on;
    // shadowMap.enabled の切替はマテリアル再コンパイルが要る
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }

  function resize() {
    const r = stageEl.getBoundingClientRect();
    renderer.setSize(r.width, r.height);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }

  function render() { renderer.render(scene, camera); }

  return {
    init, showCity, setShadow, resize, render,
    get scene() { return scene; }, get camera() { return camera; }, get renderer() { return renderer; },
  };
})();
```

- [ ] **Step 2: 仮の main.js で街だけ描画（後のタスクで置き換える）**

```javascript
// main.js — 仮: 街だけ描画（Task 5 で本実装に置き換える）
(function () {
  'use strict';
  const SEED = 1234;
  const SENGOKU = { era: 'sengoku', avenueW: 8, streetW: 3.5, blocks: 5, maxFloors: 2, density: 0.9, treeAmt: 0.5, signals: 0, poles: 0, marks: 0, konbini: 0, parks: 1, river: 1, station: 0, police: 0, hospital: 0, shrine: 1, fortTemple: 1, well: 1, gate: 1, ditch: 1 };
  try {
    ProtoViewer.init(document.getElementById('stage'));
  } catch (err) {
    document.getElementById('nowebgl').style.display = 'block';
    console.error(err);
    return;
  }
  const built = CityGen.buildPrims(CityGen.generate(Object.assign({ seed: SEED }, SENGOKU)));
  ProtoViewer.showCity(built);
  const cam = ProtoViewer.camera;
  cam.position.set(built.bounds.cx + 80, 70, built.bounds.cz + 80);
  cam.lookAt(built.bounds.cx, 0, built.bounds.cz);
  ProtoViewer.render(); // 同期1フレーム（ヘッドレス検証でも写る）
})();
```

- [ ] **Step 3: Edge ヘッドレスでスクショ確認**

```bash
SCRATCH="$LOCALAPPDATA/Temp/claude-proto"
mkdir -p "$SCRATCH"
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --use-angle=swiftshader --window-size=414,896 --virtual-time-budget=8000 --screenshot="$(cygpath -w "$SCRATCH")\\proto_t2.png" "file:///C:/dev/cover-battle/prototype/3d/index.html"
```

スクショを Read で開き、**戦国の城下町（低い瓦屋根の町並み・道・川）が写っている**こと。白落ちしたら一時コピーに toDataURL 注入で回収（既知の回避策）。

- [ ] **Step 4: コミット**

```bash
cd /c/dev/cover-battle && git add prototype/3d/ && git commit -m "proto: ProtoViewer(InstancedMesh描画層＋影対応)で城下町を描画"
```

---

### Task 3: Stickman（棒人間8体の造形と歩行アニメ）

**Files:**
- Create: `prototype/3d/stickman.js`
- Modify: `prototype/3d/main.js`（仮実装に8体の静置を追加）

**Interfaces:**
- Produces: `Stickman.create(color:number)` → `THREE.Group`（足元原点、身長約1.6m、`userData.limbs={armL,armR,legL,legR}` と `userData.phase` を持つ）
- Produces: `Stickman.animate(group, t:秒, walking:boolean)` — 手足を振る（walking=false で直立に戻す）

- [ ] **Step 1: stickman.js を作成**

```javascript
// stickman.js — 棒人間。足元原点・身長約1.6m。腕脚は付け根pivotのGroupに入れて回す
const Stickman = (function () {
  'use strict';

  function limb(len, r, color) {
    const g = new THREE.Group(); // pivot（付け根）
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, len, 6),
      new THREE.MeshLambertMaterial({ color }));
    mesh.position.y = -len / 2;
    mesh.castShadow = true;
    g.add(mesh);
    return g;
  }

  function create(color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.6, 8), mat);
    body.position.y = 1.0; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat);
    head.position.y = 1.48; head.castShadow = true; g.add(head);
    const armL = limb(0.55, 0.05, color); armL.position.set(-0.2, 1.28, 0); g.add(armL);
    const armR = limb(0.55, 0.05, color); armR.position.set(0.2, 1.28, 0); g.add(armR);
    const legL = limb(0.7, 0.06, color); legL.position.set(-0.1, 0.7, 0); g.add(legL);
    const legR = limb(0.7, 0.06, color); legR.position.set(0.1, 0.7, 0); g.add(legR);
    g.userData.limbs = { armL, armR, legL, legR };
    g.userData.phase = Math.random() * Math.PI * 2; // 8体が同じ振りにならないよう位相をずらす
    return g;
  }

  function animate(g, t, walking) {
    const L = g.userData.limbs;
    const a = walking ? Math.sin(t * 8 + g.userData.phase) * 0.7 : 0;
    L.armL.rotation.x = a; L.armR.rotation.x = -a;
    L.legL.rotation.x = -a; L.legR.rotation.x = a;
  }

  return { create, animate };
})();
```

- [ ] **Step 2: main.js の仮実装に8体静置＋近接カメラを追加**

Task 2 の main.js の `ProtoViewer.showCity(built);` の後に以下を挿入し、カメラを近接に変更:

```javascript
  // 棒人間8体（青4・赤4）を中心広場に円形配置
  for (let i = 0; i < 8; i++) {
    const color = i < 4 ? 0x3a6ea5 : 0xa53a3a;
    const s = Stickman.create(color);
    const a = i / 8 * Math.PI * 2;
    s.position.set(built.bounds.cx + Math.cos(a) * 4, 0, built.bounds.cz + Math.sin(a) * 4);
    s.rotation.y = -a;
    Stickman.animate(s, i * 0.3, true); // 歩行ポーズの確認用
    ProtoViewer.scene.add(s);
  }
  const cam = ProtoViewer.camera;
  cam.position.set(built.bounds.cx + 8, 4, built.bounds.cz + 8);
  cam.lookAt(built.bounds.cx, 1, built.bounds.cz);
```

- [ ] **Step 3: Edge ヘッドレスでスクショ確認**

Task 2 Step 3 と同じコマンド（出力名は `proto_t3.png`）。
**青4体・赤4体の棒人間が手足を振ったポーズで写っている**こと（頭・胴・手足4本が地面に立っている。沈み・浮きがないか目視ではなくスクショ上の接地を確認）。

- [ ] **Step 4: ユーザーに下書きスクショを提示して造形の合意を取る**

棒人間の見た目（頭身・色・ポーズ）のスクショを見せ、OK をもらってから次タスクへ（3D造形はスクショ合意が本人ルール）。

- [ ] **Step 5: コミット**

```bash
cd /c/dev/cover-battle && git add prototype/3d/ && git commit -m "proto: 棒人間(Stickman)8体の造形と歩行アニメ"
```

---

### Task 4: Bots（7体のAI徘徊、Node検証つき）

**Files:**
- Create: `prototype/3d/bots.js`

**Interfaces:**
- Produces: `Bots.makeUnit(x, z)` → `{x, z, tx, tz, speed:3.5, yaw:0, moving:false}`（mesh は main.js が後から生やす）
- Produces: `Bots.pickTarget(unit, bounds, rand)` — bounds 円内 85% にランダム目標を設定
- Produces: `Bots.update(units, bounds, dt, rand)` — 各 unit を目標へ進め、到着したら次の目標を選ぶ。`unit.yaw`（進行方向）と `unit.moving` を更新

- [ ] **Step 1: bots.js を作成**

```javascript
// bots.js — AI徘徊。2D平面(x,z)のみ扱いTHREE非依存（本番も座標系は平面のままの前提と同じ）
const Bots = (function () {
  'use strict';

  function makeUnit(x, z) {
    return { x, z, tx: x, tz: z, speed: 3.5, yaw: 0, moving: false };
  }

  function pickTarget(u, bounds, rand) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * bounds.r * 0.85; // sqrtで円内一様
    u.tx = bounds.cx + Math.cos(a) * r;
    u.tz = bounds.cz + Math.sin(a) * r;
  }

  function update(units, bounds, dt, rand) {
    for (const u of units) {
      const dx = u.tx - u.x, dz = u.tz - u.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) { pickTarget(u, bounds, rand); u.moving = false; continue; }
      u.moving = true;
      u.yaw = Math.atan2(dx, dz);
      const step = Math.min(u.speed * dt, d);
      u.x += dx / d * step;
      u.z += dz / d * step;
    }
  }

  return { makeUnit, pickTarget, update };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Bots;
```

- [ ] **Step 2: Node でスモーク確認（600フレーム回して動く・範囲内に留まる）**

```bash
cd /c/dev/cover-battle && node -e "
const Bots = require('./prototype/3d/bots.js');
const bounds = { cx: 0, cz: 0, r: 100 };
let seed = 42;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const units = [];
for (let i = 0; i < 7; i++) { const u = Bots.makeUnit(i, 0); Bots.pickTarget(u, bounds, rand); units.push(u); }
const start = units.map(u => ({ x: u.x, z: u.z }));
for (let f = 0; f < 600; f++) Bots.update(units, bounds, 1 / 60, rand);
let movedAll = true, inBounds = true;
units.forEach((u, i) => {
  if (Math.hypot(u.x - start[i].x, u.z - start[i].z) < 1) movedAll = false;
  if (Math.hypot(u.x - bounds.cx, u.z - bounds.cz) > bounds.r) inBounds = false;
});
if (!movedAll) throw new Error('動いていないunitがある');
if (!inBounds) throw new Error('範囲外に出たunitがある');
console.log('OK: 7体が10秒相当で移動し範囲内に留まった');
"
```

Expected: `OK: 7体が10秒相当で移動し範囲内に留まった`

- [ ] **Step 3: コミット**

```bash
cd /c/dev/cover-battle && git add prototype/3d/bots.js && git commit -m "proto: AI徘徊(Bots)。2D平面・THREE非依存・Nodeスモーク済"
```

---

### Task 5: Joystick＋main.js 本実装（操作・追従カメラ・ループ統合）

**Files:**
- Create: `prototype/3d/joystick.js`
- Modify: `prototype/3d/main.js`（仮実装を全面置き換え）

**Interfaces:**
- Consumes: `ProtoViewer`（Task 2）、`Stickman`（Task 3）、`Bots`（Task 4）
- Produces: `Joystick.init(container)` / `Joystick.getVector()` → `{dx, dy}`（-1..1、dy<0=前。タッチ優先、無入力時は WASD フォールバック）/ `Joystick.vecFrom(cx,cy,x,y,radius)`（純粋関数）
- Produces: main.js のグローバル `window.__proto`（`{units, player, setDensity}` を検証用に公開）

- [ ] **Step 1: joystick.js を作成**

```javascript
// joystick.js — 仮想ジョイスティック（左下固定）。画面左半分で始まったタッチを割当。PC確認用にWASDフォールバック
const Joystick = (function () {
  'use strict';
  const RADIUS = 55;

  // 純粋部: ベース中心(cx,cy)とタッチ点(x,y)から -1..1 のベクトル
  function vecFrom(cx, cy, x, y, radius) {
    let dx = (x - cx) / radius, dy = (y - cy) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    return { dx, dy };
  }

  let vec = { dx: 0, dy: 0 };
  const keyVec = { dx: 0, dy: 0 };
  let base, knob, cx = 0, cy = 0, touchId = null;
  const keys = {};

  function moveTo(x, y) {
    vec = vecFrom(cx, cy, x, y, RADIUS);
    knob.style.left = (35 + vec.dx * 35) + 'px';
    knob.style.top = (35 + vec.dy * 35) + 'px';
  }

  function reset() {
    touchId = null; vec = { dx: 0, dy: 0 };
    knob.style.left = '35px'; knob.style.top = '35px';
  }

  function updKeys() {
    keyVec.dx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    keyVec.dy = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
  }

  function init(container) {
    base = document.createElement('div');
    base.style.cssText = 'position:fixed;left:24px;bottom:24px;width:110px;height:110px;border-radius:50%;background:rgba(255,255,255,.15);border:2px solid rgba(255,255,255,.4);z-index:10;';
    knob = document.createElement('div');
    knob.style.cssText = 'position:absolute;left:35px;top:35px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.5);';
    base.appendChild(knob);
    container.appendChild(base);
    window.addEventListener('touchstart', e => {
      for (const t of e.changedTouches) {
        if (touchId === null && t.clientX < window.innerWidth / 2) {
          const r = base.getBoundingClientRect();
          cx = r.left + r.width / 2; cy = r.top + r.height / 2;
          touchId = t.identifier;
          moveTo(t.clientX, t.clientY);
        }
      }
    }, { passive: true });
    window.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) if (t.identifier === touchId) moveTo(t.clientX, t.clientY);
    }, { passive: true });
    const end = e => { for (const t of e.changedTouches) if (t.identifier === touchId) reset(); };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    window.addEventListener('keydown', e => { keys[e.code] = true; updKeys(); });
    window.addEventListener('keyup', e => { keys[e.code] = false; updKeys(); });
  }

  function getVector() {
    if (vec.dx || vec.dy) return vec;
    return keyVec;
  }

  return { init, getVector, vecFrom };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Joystick;
```

- [ ] **Step 2: Joystick の純粋部を Node で確認**

```bash
cd /c/dev/cover-battle && node -e "
const J = require('./prototype/3d/joystick.js');
const v1 = J.vecFrom(100, 100, 100, 45, 55); // 真上に55px = 前いっぱい
if (Math.abs(v1.dx) > 1e-9 || Math.abs(v1.dy + 1) > 1e-9) throw new Error('前方向NG: ' + JSON.stringify(v1));
const v2 = J.vecFrom(100, 100, 300, 100, 55); // 右に200px → 長さ1にクランプ
if (Math.abs(Math.hypot(v2.dx, v2.dy) - 1) > 1e-9) throw new Error('クランプNG');
console.log('OK: vecFrom 前方向とクランプ');
"
```

Expected: `OK: vecFrom 前方向とクランプ`

- [ ] **Step 3: main.js を本実装に置き換え**

```javascript
// main.js — 組み立て: 街生成→棒人間8体(1体操作+7体AI)→追従カメラ→ループ
(function () {
  'use strict';
  const SEED = 1234;
  const SENGOKU = { era: 'sengoku', avenueW: 8, streetW: 3.5, maxFloors: 2, treeAmt: 0.5, signals: 0, poles: 0, marks: 0, konbini: 0, parks: 1, river: 1, station: 0, police: 0, hospital: 0, shrine: 1, fortTemple: 1, well: 1, gate: 1, ditch: 1 };
  const DENSITY = { low: { blocks: 3, density: 0.6 }, mid: { blocks: 5, density: 0.9 }, high: { blocks: 8, density: 1.0 } };

  try {
    ProtoViewer.init(document.getElementById('stage'));
  } catch (err) {
    document.getElementById('nowebgl').style.display = 'block';
    console.error(err);
    return;
  }
  Joystick.init(document.body);

  let bounds = null, player = null, units = [], bots = [];
  let camYaw = 0, camPitch = 0.35;

  function setDensity(level) {
    const built = CityGen.buildPrims(CityGen.generate(Object.assign({ seed: SEED }, SENGOKU, DENSITY[level])));
    ProtoViewer.showCity(built);
    bounds = built.bounds;
    spawnUnits();
    updateCamera();
    ProtoViewer.render(); // 同期1フレーム（ヘッドレス検証でも写る）
  }

  function spawnUnits() {
    for (const u of units) ProtoViewer.scene.remove(u.mesh);
    units = []; bots = [];
    for (let i = 0; i < 8; i++) {
      const color = i < 4 ? 0x3a6ea5 : 0xa53a3a;
      const a = i / 8 * Math.PI * 2;
      const u = Bots.makeUnit(bounds.cx + Math.cos(a) * 6, bounds.cz + Math.sin(a) * 6);
      u.mesh = Stickman.create(color);
      u.mesh.position.set(u.x, 0, u.z);
      ProtoViewer.scene.add(u.mesh);
      units.push(u);
      if (i === 0) { player = u; }
      else { Bots.pickTarget(u, bounds, Math.random); bots.push(u); }
    }
  }

  // 視点ドラッグ: 画面右半分のタッチ / マウスドラッグ
  let lookId = null, lx = 0, ly = 0, mouseLook = false;
  function applyLookDelta(dx, dy) {
    camYaw -= dx * 0.006;
    camPitch = Math.max(0.08, Math.min(1.2, camPitch + dy * 0.004));
  }
  window.addEventListener('touchstart', e => {
    for (const t of e.changedTouches)
      if (lookId === null && t.clientX >= window.innerWidth / 2) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
  }, { passive: true });
  window.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) if (t.identifier === lookId) {
      applyLookDelta(t.clientX - lx, t.clientY - ly);
      lx = t.clientX; ly = t.clientY;
    }
  }, { passive: true });
  const touchEnd = e => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
  window.addEventListener('touchend', touchEnd);
  window.addEventListener('touchcancel', touchEnd);
  window.addEventListener('mousedown', e => { if (e.target.tagName !== 'BUTTON') { mouseLook = true; lx = e.clientX; ly = e.clientY; } });
  window.addEventListener('mousemove', e => {
    if (!mouseLook) return;
    applyLookDelta(e.clientX - lx, e.clientY - ly);
    lx = e.clientX; ly = e.clientY;
  });
  window.addEventListener('mouseup', () => { mouseLook = false; });

  function movePlayer(dt) {
    const v = Joystick.getVector(); // dy<0 = 前
    const len = Math.hypot(v.dx, v.dy);
    player.moving = len > 0.15;
    if (!player.moving) return;
    // カメラyaw基準でワールド方向へ（yaw=0 の前方は +z。machi-maker PlayerControls と同じ規約）
    const ang = Math.atan2(v.dx, -v.dy) + camYaw;
    const speed = 4.5 * Math.min(len, 1);
    player.x += Math.sin(ang) * speed * dt;
    player.z += Math.cos(ang) * speed * dt;
    player.yaw = ang;
    // 街の外周円に緩くクランプ
    const dx = player.x - bounds.cx, dz = player.z - bounds.cz;
    const d = Math.hypot(dx, dz), maxR = bounds.r + 10;
    if (d > maxR) { player.x = bounds.cx + dx / d * maxR; player.z = bounds.cz + dz / d * maxR; }
  }

  function updateCamera() {
    const cam = ProtoViewer.camera;
    const cd = 7, cp = Math.cos(camPitch), sp = Math.sin(camPitch);
    cam.position.set(
      player.x - Math.sin(camYaw) * cd * cp,
      1.5 + cd * sp,
      player.z - Math.cos(camYaw) * cd * cp);
    cam.lookAt(player.x, 1.5, player.z);
  }

  let lastT = 0;
  window.__protoTick = null; // Task 6 で fps 計測をつなぐ
  function loop(t) {
    requestAnimationFrame(loop);
    const dt = lastT ? Math.min((t - lastT) / 1000, 0.1) : 0;
    lastT = t;
    movePlayer(dt);
    Bots.update(bots, bounds, dt, Math.random);
    const now = t / 1000;
    for (const u of units) {
      u.mesh.position.set(u.x, 0, u.z);
      u.mesh.rotation.y = u.yaw;
      Stickman.animate(u.mesh, now, u.moving);
    }
    updateCamera();
    ProtoViewer.render();
    if (window.__protoTick) window.__protoTick(t);
  }

  setDensity('mid');
  loop(0);

  window.__proto = { get units() { return units; }, get player() { return player; }, setDensity };
})();
```

- [ ] **Step 4: Edge ヘッドレスで動作確認（rAFモンキーパッチで時間経過を再現）**

`--virtual-time-budget` は rAF を進めないため、一時コピーに rAF モンキーパッチ（setTimeout(cb,16) 置き換え）を注入したうえで5秒相当回し、`window.__proto.units` の座標が初期円形配置から変化していることを console.log で dump して確認（machi-maker で確立済みの手順）。スクショ `proto_t5.png` に**追従カメラ視点の街＋ジョイスティックUI**が写っていること。

- [ ] **Step 5: コミット**

```bash
cd /c/dev/cover-battle && git add prototype/3d/ && git commit -m "proto: 仮想ジョイスティック＋追従カメラ＋8体統合ループ"
```

---

### Task 6: fps HUD＋負荷トグル（影/密度/アニメ）

**Files:**
- Modify: `prototype/3d/main.js`
- Modify: `prototype/3d/stickman.js`（アニメOFF対応は既存 animate の walking=false で足りるため変更なしの見込み。変更不要ならスキップ）

**Interfaces:**
- Consumes: `ProtoViewer.setShadow(on)`（Task 2）、`window.__protoTick`（Task 5）、`#hud` `#fpsval` `#minfps` `#btnShadow` `#btnDensity` `#btnAnim`（Task 1）
- Produces: 画面上で fps（直近1秒の平均）と「最低」（トグル変更後からの最低値）が読める。3トグルが機能する。

- [ ] **Step 1: main.js に fps 計測とトグル配線を追加**

main.js の `window.__proto = ...` の前に以下を追加し、`loop` 内の `if (window.__protoTick)` を `fpsTick(t)` の直接呼び出しに置き換える（`window.__protoTick` の行は削除）:

```javascript
  // --- fps 計測: 直近1秒の平均と、トグル変更後からの最低値 ---
  const fpsEl = document.getElementById('fpsval');
  const minEl = document.getElementById('minfps');
  let frames = 0, windowStart = 0, minFps = Infinity;
  function fpsResetMin() { minFps = Infinity; minEl.textContent = '最低 --'; }
  function fpsTick(t) {
    frames++;
    if (!windowStart) { windowStart = t; return; }
    if (t - windowStart >= 1000) {
      const fps = Math.round(frames * 1000 / (t - windowStart));
      frames = 0; windowStart = t;
      fpsEl.textContent = String(fps);
      if (fps < minFps) { minFps = fps; minEl.textContent = '最低 ' + fps; }
    }
  }

  // --- トグル: 影 / 密度 / 歩行アニメ ---
  let shadowOn = false, animOn = true, densityLevel = 'mid';
  const DENSITY_LABEL = { low: '低', mid: '中', high: '高' };
  const DENSITY_NEXT = { low: 'mid', mid: 'high', high: 'low' };
  document.getElementById('btnShadow').addEventListener('click', e => {
    shadowOn = !shadowOn;
    ProtoViewer.setShadow(shadowOn);
    e.target.textContent = '影:' + (shadowOn ? 'ON' : 'OFF');
    fpsResetMin();
  });
  document.getElementById('btnDensity').addEventListener('click', e => {
    densityLevel = DENSITY_NEXT[densityLevel];
    setDensity(densityLevel);
    e.target.textContent = '密度:' + DENSITY_LABEL[densityLevel];
    fpsResetMin();
  });
  document.getElementById('btnAnim').addEventListener('click', e => {
    animOn = !animOn;
    e.target.textContent = 'アニメ:' + (animOn ? 'ON' : 'OFF');
    fpsResetMin();
  });
```

`loop` 内の棒人間更新を animOn 対応に変更:

```javascript
    for (const u of units) {
      u.mesh.position.set(u.x, 0, u.z);
      u.mesh.rotation.y = u.yaw;
      Stickman.animate(u.mesh, now, animOn && u.moving);
    }
```

（`Stickman.animate` は walking=false で直立に戻すので stickman.js の変更は不要）

- [ ] **Step 2: Edge ヘッドレスで確認**

rAF モンキーパッチ入り一時コピーで3秒相当回し、スクショ `proto_t6.png` に **HUD の FPS 数値（-- 以外）とトグル3ボタン**が写っていること。さらに注入スクリプトで `document.getElementById('btnShadow').click()` → `ProtoViewer.renderer.shadowMap.enabled === true` を console 確認。

- [ ] **Step 3: コミット**

```bash
cd /c/dev/cover-battle && git add prototype/3d/ && git commit -m "proto: fps HUD＋負荷トグル(影/密度/アニメ)"
```

---

### Task 7: 統合確認と実機検証の準備

**Files:**
- Modify: `.claude/worklog/CURRENT.md`（結果記録の枠を追記）

**Interfaces:**
- Consumes: 全モジュール完成品、既存 `server.js`（無改変。ROOT配下の任意パスを配信するので prototype/3d/ もそのまま届く）

- [ ] **Step 1: フラグ無し Edge（実ブラウザ）で開いて実走確認**

```powershell
Start-Process msedge "file:///C:/dev/cover-battle/prototype/3d/index.html"
```

ユーザーの画面で確認（見てもらう）: WASD で操作キャラが歩き、7体が徘徊し、HUD の fps が動き、トグル3つが効くこと。

- [ ] **Step 2: server.js 配信の疎通確認**

```bash
cd /c/dev/cover-battle && node server.js &
sleep 2
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/prototype/3d/index.html
# → 200 を確認したらサーバを止める
```

Expected: `200`

- [ ] **Step 3: ワークログに検証手順と結果記入枠を追記**

`.claude/worklog/CURRENT.md` の先頭（`---` の直後）に:

```markdown
## 2026-07-XX — INCOMEBASE04 — 3D負荷検証プロトタイプ完成
- prototype/3d/index.html — 城下マップ＋棒人間8体（1体操作＋7体AI徘徊）＋fps HUD＋負荷トグル
- スマホ実機の測り方: PCで `node server.js` → スマホで http://<PC-IP>:8080/prototype/3d/index.html
- 実測結果（記入待ち）: 密度中/影OFF: __fps、影ON: __fps、密度高: __fps → 主犯: __
```

- [ ] **Step 4: コミット＆push**

```bash
cd /c/dev/cover-battle && git add -A && git commit -m "proto: 統合確認＋実機検証手順をワークログに記録" && git push
```

---

## Self-Review 済みメモ

- スペック要件との対応: 8体（1操作+7AI）=Task 3-5 / トグル3種=Task 6 / HUD=Task 6 / server.js配信=Task 7 / 本体無改変=全タスク prototype/3d/ のみ / Edge事前確認=各タスク / 実機はユーザー
- 型整合: `Bots.makeUnit` の unit を main.js が `u.mesh` 拡張して使う点は Task 4/5 両方の Interfaces に明記
- citygen.js は Node 互換（`module.exports` あり・THREE/DOM 非依存）を確認済み
