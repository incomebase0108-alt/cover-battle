# 侍キャラ組込（トグル＋攻撃ボタン） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fps検証プロトタイプに1号機の侍GLB（アニメ10種）を「棒人間↔侍」トグルと「攻撃」ボタン付きで組み込み、キャラ負荷と攻撃モーション負荷をスマホ実機で測れるようにする。

**Architecture:** 1号機の `samurai.js`（Stickman互換API: create/animate 同流儀＋attack）を無改変で使い、main.js に charMode 分岐（生成・アニメ・dispose）とボタン配線を足すだけ。GLBはHTTP相対URLで読み、file://直開きでは棒人間へ自動フォールバック。

**Tech Stack:** Three.js r128（CDN）＋GLTFLoader/SkeletonUtils（unpkg r128）、素のJS、配信は既存 server.js。

## Global Constraints

- スペック: `docs/superpowers/specs/2026-07-17-samurai-integration-design.md`
- 触れてよいのは `prototype/3d/index.html`・`prototype/3d/main.js`・`prototype/3d/proto-viewer.js` の3つのみ。**samurai.js・assets/*.glb・samurai_test.html（1号機成果物）と stickman.js・bots.js・joystick.js・citygen.js は無改変**。本体（js/・server.js）も無改変。
- ブランチ: `proto/3d-samurai`（作成済み・chara/attack-motion 取込済み）。コミットは `proto:` プレフィックス。
- 自動テストは書かない。検証は Edge ヘッドレス。**GLB は file:// では読めないため、侍が絡む検証は `node server.js` を起動して `http://localhost:8080/...` 経由で行う**。rAF は従来どおりモンキーパッチ（`window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16);` を最初の script の前に注入）。
- HTTP経由のヘッドレス検証では HTML への注入ができないので、**検証用の一時コピーを `prototype/3d/tmp_check.html` に置いて server 経由で開き、検証後に必ず削除する**（コミットに含めない）。
- Edge 実行例: `"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --use-angle=swiftshader --enable-logging=stderr --v=0 --virtual-time-budget=20000 --window-size=800,600 "http://localhost:8080/prototype/3d/tmp_check.html" 2>&1 | grep -a CHECK`
- 侍の dispose 禁止ルール: SkeletonUtils クローンはジオメトリ/マテリアルを全個体で共有するため **`scene.remove` のみ**。棒人間は従来どおり毎体 dispose（逆ルール。コメント必須）。

---

### Task 1: index.html のボタン/script追加＋proto-viewer.js の sRGB 1行

**Files:**
- Modify: `prototype/3d/index.html`
- Modify: `prototype/3d/proto-viewer.js`

**Interfaces:**
- Produces: DOM `#btnChar`（初期: disabled・「キャラ:読込中…」）、`#btnAttack`（初期: disabled）。グローバル `Samurai`（samurai.js 読込により）。Task 2/3 がこれらに依存。

- [ ] **Step 1: index.html の `<style>` にボタン用CSSを追加**

`#nowebgl{...}` の行の直後に追加:

```css
  #btnAttack{position:fixed;right:24px;bottom:24px;width:84px;height:84px;border-radius:50%;border:0;background:rgba(180,40,40,.75);color:#fff;font-size:16px;z-index:10;}
  #btnAttack:disabled{background:rgba(100,100,100,.35);color:rgba(255,255,255,.5);}
  #toggles button:disabled{color:rgba(255,255,255,.45);}
```

- [ ] **Step 2: index.html にボタン2つを追加**

`#toggles` 内の `<button id="btnAnim">アニメ:ON</button>` の直後に:

```html
  <button id="btnChar" disabled>キャラ:読込中…</button>
```

`<div id="hud">` の行の直前に:

```html
<button id="btnAttack" disabled>攻撃</button>
```

- [ ] **Step 3: index.html に script タグ3本を追加**

three.min.js の行の直後に（GLTFLoader/SkeletonUtils は samurai.js 先頭コメント指定のURL）:

```html
<script src="https://unpkg.com/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
<script src="https://unpkg.com/three@0.128.0/examples/js/utils/SkeletonUtils.js"></script>
```

`<script src="joystick.js"></script>` の直後（main.js の前）に:

```html
<script src="samurai.js"></script>
```

- [ ] **Step 4: proto-viewer.js に sRGB 出力を追加**

`init()` 内の `renderer.shadowMap.type = THREE.PCFShadowMap;` の直後に:

```javascript
    renderer.outputEncoding = THREE.sRGBEncoding; // r128既定はGLBテクスチャが暗く出る(1号機知見)
```

- [ ] **Step 5: ヘッドレスで回帰確認（棒人間モードは無傷か）**

サーバ起動: `cd /c/dev/cover-battle && node server.js &`（検証後 kill）。
`prototype/3d/tmp_check.html` に index.html のコピーを作り、最初の `<script` の前に rAF モンキーパッチ＋3秒後に `console.log('T1_CHECK', JSON.stringify({fps: document.getElementById('fpsval').textContent, btnChar: document.getElementById('btnChar').disabled, btnAttack: document.getElementById('btnAttack').disabled, units: window.__proto.units.length}))` を注入して Global Constraints のコマンドで実行。

Expected: `T1_CHECK {"fps":"<数値>","btnChar":<true|false>,"btnAttack":true,"units":8}`（fpsが数値＝ループ生存。btnCharはGLB読込が3秒以内に完了したかで変わるためどちらでも可。Uncaught エラーが無いこと）。確認後 tmp_check.html を削除。

- [ ] **Step 6: コミット**

```bash
cd /c/dev/cover-battle && git add prototype/3d/index.html prototype/3d/proto-viewer.js && git commit -m "proto: 侍組込の下準備(ローダ2本+samurai.js読込+キャラ/攻撃ボタン+sRGB)"
```

---

### Task 2: charMode（棒人間↔侍トグル・生成/アニメ/disposeの分岐・GLBロード）

**Files:**
- Modify: `prototype/3d/main.js`

**Interfaces:**
- Consumes: `Samurai.load(base, cb)` / `Samurai.create('spear'|'katana'|'bow')` / `Samurai.animate(g,t,walking)`（samurai.js、Stickman互換）。`#btnChar`（Task 1）。
- Produces: `charMode`（'stick'|'samurai'）、`unit.chartype`、`window.__proto.charMode` getter、`samuraiReady` フラグ。Task 3 がこれらに依存。

- [ ] **Step 1: モード変数と侍ロードを追加**

main.js の `let bounds = null, player = null, units = [], bots = [];` の直後に:

```javascript
  let charMode = 'stick'; // 'stick' | 'samurai'（トグルで切替。侍はGLB読込成功後のみ）
  let samuraiReady = false;
  const SAMURAI_KINDS = ['spear', 'spear', 'katana', 'bow', 'spear', 'katana', 'bow', 'spear']; // 槍4刀2弓2、先頭=プレイヤー

  // 侍GLBの読込。HTTP経由のみ成功する（file://直開きはXHR不可→棒人間のままフォールバック）
  const charBtn = document.getElementById('btnChar');
  try {
    Samurai.load('assets/', () => {
      samuraiReady = true;
      charBtn.disabled = false;
      charBtn.textContent = 'キャラ:棒人間';
    });
  } catch (err) {
    console.error('侍GLBの読込開始に失敗', err);
  }
  setTimeout(() => {
    if (!samuraiReady) charBtn.textContent = 'キャラ:棒人間(GLB未読込)';
  }, 15000);
```

- [ ] **Step 2: spawnUnits を dispose 分岐＋生成分岐に置き換え**

現在の `spawnUnits()` 全体を以下に置き換え:

```javascript
  function disposeUnit(u) {
    if (u.chartype === 'samurai') {
      // 侍はSkeletonUtilsクローン＝ジオメトリ/マテリアルを全個体で共有。disposeすると他個体が壊れる
      ProtoViewer.scene.remove(u.mesh);
      return;
    }
    // 棒人間は1体ごとに専用ジオメトリ/マテリアル（viewer側の共有ジオメトリとは逆のルール）ので、
    // ここでdisposeしないと切替のたびにGPUリソースが漏れる
    u.mesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    ProtoViewer.scene.remove(u.mesh);
  }

  function spawnUnits() {
    for (const u of units) disposeUnit(u);
    units = []; bots = [];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const u = Bots.makeUnit(bounds.cx + Math.cos(a) * 6, bounds.cz + Math.sin(a) * 6);
      if (charMode === 'samurai') {
        u.mesh = Samurai.create(SAMURAI_KINDS[i]);
        u.chartype = 'samurai';
      } else {
        u.mesh = Stickman.create(i < 4 ? 0x3a6ea5 : 0xa53a3a);
        u.chartype = 'stick';
      }
      u.mesh.position.set(u.x, 0, u.z);
      ProtoViewer.scene.add(u.mesh);
      units.push(u);
      if (i === 0) { player = u; }
      else { Bots.pickTarget(u, bounds, Math.random); bots.push(u); }
    }
  }
```

- [ ] **Step 3: ループのアニメ呼び分け**

`loop()` 内の `Stickman.animate(u.mesh, now, animOn && u.moving);` を:

```javascript
      if (u.chartype === 'samurai') Samurai.animate(u.mesh, now, animOn && u.moving);
      else Stickman.animate(u.mesh, now, animOn && u.moving);
```

- [ ] **Step 4: キャラトグルの配線と __proto 拡張**

トグル節の `document.getElementById('btnAnim')...` ブロックの直後に:

```javascript
  charBtn.addEventListener('click', () => {
    if (!samuraiReady) return;
    charMode = charMode === 'stick' ? 'samurai' : 'stick';
    charBtn.textContent = 'キャラ:' + (charMode === 'samurai' ? '侍' : '棒人間');
    document.getElementById('btnAttack').disabled = charMode !== 'samurai';
    spawnUnits();
    ProtoViewer.render();
    fpsResetMin();
  });
```

末尾の `window.__proto = ...` を:

```javascript
  window.__proto = { get units() { return units; }, get player() { return player; }, setDensity, get charMode() { return charMode; } };
```

- [ ] **Step 5: ヘッドレスで侍トグルを検証（server経由）**

`node server.js` 起動。tmp_check.html（rAFパッチ入りコピー）に以下の検証を注入:
1.5秒ごとに `#btnChar.disabled` をポーリング（最大18秒）→ 有効化されたら click → 2秒後に
`console.log('T2_CHECK', JSON.stringify({mode: window.__proto.charMode, sam: !!window.__proto.units[0].mesh.userData.samurai, units: window.__proto.units.length, geosBefore, geosAfter: ProtoViewer.renderer.info.memory.geometries}))`
（geosBefore はトグル前に `ProtoViewer.renderer.info.memory.geometries` を記録。トグル往復（侍→棒人間）後の geometries が初期値へ戻ることも `T2_BACK` として log）。

Expected: `T2_CHECK {"mode":"samurai","sam":true,"units":8,...}`、`T2_BACK` で geometries がトグル前と同値（±0）。確認後 tmp_check.html 削除・server kill。

- [ ] **Step 6: コミット**

```bash
cd /c/dev/cover-battle && git add prototype/3d/main.js && git commit -m "proto: キャラトグル(棒人間↔侍)。生成/アニメ/disposeのモード分岐+GLB未読込フォールバック"
```

---

### Task 3: 攻撃ボタン＋ボットの攻撃＋攻撃中の移動停止

**Files:**
- Modify: `prototype/3d/main.js`

**Interfaces:**
- Consumes: `Samurai.attack(g)`（1発再生・自動復帰）、`g.userData.samurai.attacking`、`charMode`/`unit.chartype`（Task 2）、`#btnAttack`（Task 1）。
- Produces: 攻撃ボタンとボット攻撃（追加検証は Task 4 の統合確認で実施）。

- [ ] **Step 1: 攻撃中の移動停止**

`movePlayer(dt)` の先頭（`const v = ...` の前）に:

```javascript
    // 攻撃モーション中は足を止める（1号機API: attackingフラグ）
    if (player.chartype === 'samurai' && player.mesh.userData.samurai && player.mesh.userData.samurai.attacking) {
      player.moving = false;
      return;
    }
```

- [ ] **Step 2: 攻撃ボタンの配線**

Task 2 で追加した charBtn ハンドラの直後に:

```javascript
  document.getElementById('btnAttack').addEventListener('click', () => {
    if (charMode !== 'samurai') return;
    Samurai.attack(player.mesh);
    fpsResetMin(); // 攻撃再生中のfpsを取り直す
  });
```

- [ ] **Step 3: ボットの攻撃（到着時30%）**

`loop()` 内の `Bots.update(bots, bounds, dt, Math.random);` の直後に:

```javascript
    if (charMode === 'samurai') {
      // 目標到着の瞬間(moving true→false)に30%で攻撃。再生中は重ねない
      for (const b of bots) {
        const sam = b.mesh.userData.samurai;
        if (sam && !sam.attacking && b.prevMoving && !b.moving && Math.random() < 0.3) Samurai.attack(b.mesh);
        b.prevMoving = b.moving;
      }
    }
```

- [ ] **Step 4: ヘッドレスで攻撃APIを検証（server経由）**

tmp_check.html で Task 2 同様に侍モードへ切替後、`document.getElementById('btnAttack').click()` → 直後に
`console.log('T3_CHECK', JSON.stringify({attacking: window.__proto.player.mesh.userData.samurai.attacking}))`、
さらに3秒後に `console.log('T3_DONE', JSON.stringify({attacking: window.__proto.player.mesh.userData.samurai.attacking}))`。

Expected: `T3_CHECK {"attacking":true}` → `T3_DONE {"attacking":false}`（自動復帰）。確認後 tmp_check.html 削除・server kill。

- [ ] **Step 5: コミット**

```bash
cd /c/dev/cover-battle && git add prototype/3d/main.js && git commit -m "proto: 攻撃ボタン+ボット到着時30%攻撃+攻撃中の移動停止"
```

---

### Task 4: 統合確認（file://フォールバック・本体テスト・ワークログ・push）

**Files:**
- Modify: `.claude/worklog/CURRENT.md`（エントリ追記のみ）

**Interfaces:**
- Consumes: 全モジュール完成品。

- [ ] **Step 1: file:// フォールバックの確認**

file:// で開く一時コピー（スクラッチ領域・rAFパッチ入り・script srcは `file:///C:/dev/cover-battle/prototype/3d/` の絶対URLに書換）で18秒後に
`console.log('FALLBACK_CHECK', JSON.stringify({disabled: document.getElementById('btnChar').disabled, label: document.getElementById('btnChar').textContent, mode: window.__proto.charMode, fps: document.getElementById('fpsval').textContent}))`

Expected: `FALLBACK_CHECK {"disabled":true,"label":"キャラ:棒人間(GLB未読込)","mode":"stick","fps":"<数値>"}`（棒人間のまま全機能生存）。

- [ ] **Step 2: 本体テストの回帰確認**

```bash
cd /c/dev/cover-battle && node tests/run.js 2>&1 | tail -2
```

Expected: `RESULT: PASS`（165件）。

- [ ] **Step 3: ワークログ追記**

`.claude/worklog/CURRENT.md` の `---` 直後に:

```markdown
## 2026-07-17 — INCOMEBASE04 — 侍キャラ組込完了（prototype/3d）
- 「キャラ:棒人間/侍」トグル＋「攻撃」ボタンを追加。侍=1号機GLB（槍4刀2弓2、プレイヤー=槍）
- 攻撃: ボタンでプレイヤー、ボットは到着時30%。攻撃中は移動停止（attackingフラグ）
- file://直開きは棒人間へ自動フォールバック。スマホ計測は従来どおり server 経由
- 実測結果（記入待ち）: 棒人間: __fps ↔ 侍: __fps、攻撃連打: __fps、侍+影ON: __fps
```

- [ ] **Step 4: コミット＆push**

```bash
cd /c/dev/cover-battle && git add -A && git commit -m "proto: 統合確認+侍組込のワークログ" && git push -u origin proto/3d-samurai
```

---

## Self-Review 済みメモ

- スペック対応: トグル=T2 / 攻撃ボタン+ボット30%+移動停止=T3 / sRGB+ボタンUI+script3本=T1 / フォールバック=T2 Step1+T4 Step1 / dispose逆ルール=T2 Step2 / fpsResetMin対象追加=T2 Step4・T3 Step2 / やらないこと（色分け・setWeapon・run・当たり判定）はどのタスクにも含まれない
- 型整合: `unit.chartype`・`charMode`・`samuraiReady`・`SAMURAI_KINDS` は T2 で定義し T3 が参照。`window.__proto.charMode` getter は T2 Step 4
- 1号機成果物（samurai.js・GLB・samurai_test.html）はどのタスクも触らない
