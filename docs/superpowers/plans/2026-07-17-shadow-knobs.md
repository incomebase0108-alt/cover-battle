# 影ノブ4段（OFF/丸影/低/高） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `影` ボタンを OFF→丸影→低(1024²/プレイヤー周辺±25追従)→高(2048²/街全域) の4段サイクルにして、影の軽量化候補をスマホで測り比べられるようにする。

**Architecture:** shadowMap の面倒は proto-viewer.js（`setShadowMode(mode)`＋low用 `updateShadowTarget(x,z)`）、丸影(blob)はキャラの子メッシュなので main.js が持つ（共有 geo/mat 1組＋`userData._blob` フラグで dispose から除外）。

**Tech Stack:** 既存構成のまま（Three.js r128、素のJS）。

## Global Constraints

- スペック: `docs/superpowers/specs/2026-07-17-shadow-knobs-design.md`
- 触れてよいのは `prototype/3d/proto-viewer.js` と `prototype/3d/main.js` の2つのみ（index.html も無改変 — 初期ラベル「影:OFF」は現状のまま使う）。
- ブランチ: `proto/3d-shadow-knobs`（作成済み）。コミットは `proto:` プレフィックス。
- 自動テストなし。検証は Edge ヘッドレス（server 経由・`prototype/3d/tmp_check.html` 一時コピー方式・rAF モンキーパッチ・検証後削除、いずれも既存プラン踏襲）。
  Edge 実行例: `"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --use-angle=swiftshader --enable-logging=stderr --v=0 --virtual-time-budget=40000 --window-size=800,600 "http://localhost:8080/prototype/3d/tmp_check.html" 2>&1 | grep -a "CHECK\|Uncaught"`
- **TDZ 注意**: `setDensity('mid')`（起動時）→ `spawnUnits()` → `setBlobs(...)` が走るため、`shadowMode`／blob 関連は main.js の**上部（SAMURAI_KINDS ブロックの後）**に置く。トグル節（ファイル下部）にはハンドラ配線だけ。

---

### Task 1: setShadowMode（proto-viewer.js）＋4段トグルと丸影（main.js）

**Files:**
- Modify: `prototype/3d/proto-viewer.js`
- Modify: `prototype/3d/main.js`

**Interfaces:**
- Produces: `ProtoViewer.setShadowMode('off'|'blob'|'low'|'high')`／`ProtoViewer.updateShadowTarget(x,z)`（low時のみ作用）。旧 `ProtoViewer.setShadow` は削除。main.js 側 `shadowMode` 変数と `setBlobs(on)`。

- [ ] **Step 1: proto-viewer.js — モード管理を追加し showCity の影カメラ設定を差し替え**

モジュール先頭の `let boxGeo, prismGeo, cylGeo, sphereGeo;` の直後に:

```javascript
  let shadowMode = 'off'; // 'off'|'blob'|'low'|'high'（blobの描画はmain側。ここはshadowMapの面倒だけ見る）
  let cityBounds = null;  // showCityで記憶。high復帰・密度切替の再適用用
```

`showCity()` 末尾の影カメラ設定ブロック:

```javascript
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
```

を以下に置き換え:

```javascript
    cityBounds = built.bounds;
    applyShadowArea(); // 現在のモードに合わせて影カメラを再適用（密度切替がhigh設定を上書きしないように）
```

- [ ] **Step 2: proto-viewer.js — setShadow を setShadowMode 群に置き換え**

既存の `setShadow(on)` 関数全体を削除し、同じ場所に:

```javascript
  function applyShadowArea() {
    if (!cityBounds) return;
    if (shadowMode === 'low') {
      // プレイヤー周辺だけ（位置はupdateShadowTargetが毎フレーム追従させる）
      sun.shadow.camera.left = -25; sun.shadow.camera.right = 25;
      sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25;
    } else {
      const r = cityBounds.r * 1.2;
      sun.shadow.camera.left = -r; sun.shadow.camera.right = r;
      sun.shadow.camera.top = r; sun.shadow.camera.bottom = -r;
      sun.position.set(cityBounds.cx + 120, 180, cityBounds.cz + 80);
      sun.target.position.set(cityBounds.cx, 0, cityBounds.cz);
    }
    sun.shadow.camera.far = 500;
    sun.shadow.camera.updateProjectionMatrix();
  }

  function setMapSize(px) {
    if (sun.shadow.mapSize.x === px) return;
    sun.shadow.mapSize.set(px, px);
    // 生成済みシャドウマップは古い解像度のまま使い回されるので作り直させる
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }

  function setShadowMode(mode) {
    shadowMode = mode;
    const on = mode === 'low' || mode === 'high';
    renderer.shadowMap.enabled = on;
    sun.castShadow = on;
    if (on) setMapSize(mode === 'low' ? 1024 : 2048);
    applyShadowArea();
    // shadowMap.enabled の切替はマテリアル再コンパイルが要る
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }

  // lowモード: 影カメラをプレイヤーへ追従（main.jsのループから毎フレーム呼ばれる）
  function updateShadowTarget(x, z) {
    if (shadowMode !== 'low') return;
    sun.position.set(x + 120, 180, z + 80);
    sun.target.position.set(x, 0, z);
  }
```

末尾の return 文の `setShadow,` を `setShadowMode, updateShadowTarget,` に置き換え。

- [ ] **Step 3: main.js — shadowMode/blob を上部に追加（TDZ対策で SAMURAI_KINDS ブロックの後）**

`setTimeout(() => { if (!samuraiReady) ... }, 15000);` の直後に:

```javascript
  // --- 影4段: OFF→丸影→低→高（shadowMapはviewer、丸影はここ） ---
  const SHADOW_MODES = ['off', 'blob', 'low', 'high'];
  const SHADOW_LABEL = { off: 'OFF', blob: '丸影', low: '低', high: '高' };
  let shadowMode = 'off';

  // 丸影(blob): 共有geo/mat 1組をキャラの子に。disposeUnitのtraverseに巻き込まない（_blobフラグ）
  let blobGeo = null, blobMat = null;
  function makeBlobMat() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c2 = cv.getContext('2d');
    const r = c2.createRadialGradient(32, 32, 4, 32, 32, 30);
    r.addColorStop(0, 'rgba(0,0,0,0.42)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    c2.fillStyle = r; c2.fillRect(0, 0, 64, 64);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false });
  }
  function setBlobs(on) {
    for (const u of units) {
      let blob = u.mesh.children.find(c => c.userData._blob);
      if (on && !blob) {
        if (!blobGeo) { blobGeo = new THREE.PlaneGeometry(1.4, 1.4); blobGeo.rotateX(-Math.PI / 2); }
        if (!blobMat) blobMat = makeBlobMat();
        blob = new THREE.Mesh(blobGeo, blobMat);
        blob.position.y = 0.02;
        blob.userData._blob = 1;
        u.mesh.add(blob);
      }
      if (blob) blob.visible = on;
    }
  }
```

- [ ] **Step 4: main.js — disposeUnit の traverse から blob を除外**

`disposeUnit()` 内の棒人間 dispose 行:

```javascript
    u.mesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
```

を:

```javascript
    u.mesh.traverse(o => { if (o.isMesh && !o.userData._blob) { o.geometry.dispose(); o.material.dispose(); } });
```

- [ ] **Step 5: main.js — spawnUnits 末尾と loop に追従を配線**

`spawnUnits()` の for ループ閉じ括弧の直後（関数末尾）に:

```javascript
    setBlobs(shadowMode === 'blob'); // 再生成でblobが消えるので張り直す
```

`loop()` 内の `updateCamera();` の直後に:

```javascript
    ProtoViewer.updateShadowTarget(player.x, player.z);
```

- [ ] **Step 6: main.js — btnShadow を4段サイクルに置き換え**

トグル節の変数宣言 `let shadowOn = false, animOn = true, densityLevel = 'mid';` を:

```javascript
  let animOn = true, densityLevel = 'mid';
```

既存の btnShadow ハンドラ:

```javascript
  document.getElementById('btnShadow').addEventListener('click', e => {
    shadowOn = !shadowOn;
    ProtoViewer.setShadow(shadowOn);
    e.target.textContent = '影:' + (shadowOn ? 'ON' : 'OFF');
    fpsResetMin();
  });
```

を:

```javascript
  document.getElementById('btnShadow').addEventListener('click', e => {
    shadowMode = SHADOW_MODES[(SHADOW_MODES.indexOf(shadowMode) + 1) % SHADOW_MODES.length];
    ProtoViewer.setShadowMode(shadowMode);
    setBlobs(shadowMode === 'blob');
    e.target.textContent = '影:' + SHADOW_LABEL[shadowMode];
    fpsResetMin();
  });
```

- [ ] **Step 7: ヘッドレスで4段サイクルを検証（server経由）**

`node server.js` 起動（既に起動していれば流用）。tmp_check.html（rAFパッチ入りコピー）で、ロード2秒後から `#btnShadow` を1.2秒間隔で4回クリックし、各クリック直後に

```javascript
console.log('MODE_CHECK', JSON.stringify({
  label: document.getElementById('btnShadow').textContent,
  enabled: ProtoViewer.renderer.shadowMap.enabled,
  blobs: (() => { let n = 0; ProtoViewer.scene.traverse(o => { if (o.userData._blob && o.visible) n++; }); return n; })(),
}))
```

Expected（順に）: `影:丸影 enabled:false blobs:8` → `影:低 enabled:true blobs:0` → `影:高 enabled:true blobs:0` → `影:OFF enabled:false blobs:0`。Uncaught なし。確認後 tmp_check.html 削除。

- [ ] **Step 8: コミット**

```bash
cd /c/dev/cover-battle && git add prototype/3d/proto-viewer.js prototype/3d/main.js && git commit -m "proto: 影4段トグル(OFF/丸影/低1024追従/高2048全域)"
```

---

### Task 2: 交差検証（キャラ/密度切替との組合せ）＋ワークログ＋push

**Files:**
- Modify: `.claude/worklog/CURRENT.md`（エントリ追記のみ）

**Interfaces:**
- Consumes: Task 1 完成品（`window.__proto`、`#btnChar`、`#btnDensity`、`#btnShadow`）。

- [ ] **Step 1: ヘッドレスで交差検証（server経由）**

tmp_check.html で以下のシーケンスを実行し、各ポイントで log:
1. GLB読込待ち → 影を「丸影」に（1クリック）→ btnChar（侍へ）→ `CROSS1` {blobs}（期待: 8。侍再生成後もblobが張り直る）
2. btnDensity（密度高へ）→ `CROSS2` {blobs}（期待: 8。密度再生成でも張り直る）
3. 影を「低」へ（1クリック）→ btnDensity（密度低へ）→ `CROSS3` {enabled, camRight: Math.round(ProtoViewer.renderer.shadowMap.enabled && 25)}（期待: enabled:true。密度切替後も影カメラが±25のまま＝showCityに上書きされない。`sun` はエクスポートされていないので camRight の検証は「±25再適用コードpaths」の目視確認でも可 — その場合は報告にその旨を書く）
4. btnChar（棒人間へ戻す）→ `CROSS4` {geos: ProtoViewer.renderer.info.memory.geometries}（blob共有geoがdisposeに巻き込まれていればここで例外や描画異常が出る。数値は参考記録）
5. 全シーケンスで Uncaught なし。

Expected: CROSS1 blobs:8 / CROSS2 blobs:8 / CROSS3 enabled:true / CROSS4 例外なし。確認後 tmp_check.html 削除。

- [ ] **Step 2: 本体テスト回帰**

```bash
cd /c/dev/cover-battle && node tests/run.js 2>&1 | tail -2
```

Expected: `RESULT: PASS`。

- [ ] **Step 3: ワークログ追記**

`.claude/worklog/CURRENT.md` の `---` 直後に:

```markdown
## 2026-07-17 — INCOMEBASE04 — 影4段ノブ（OFF/丸影/低/高）実装
- 影ボタンを4段サイクル化。丸影=足元グラデ（shadowMapなし）、低=1024²でプレイヤー周辺±25を追従、高=従来の2048²全域
- 実測結果（記入待ち・侍モード）: OFF: __fps、丸影: __fps、低: __fps、高: __fps
```

- [ ] **Step 4: コミット＆push**

```bash
cd /c/dev/cover-battle && git add -A && git commit -m "proto: 影ノブの交差検証+ワークログ" && git push -u origin proto/3d-shadow-knobs
```

---

## Self-Review 済みメモ

- スペック対応: 4段サイクル=T1 Step6 / blob共有＋_blob除外=T1 Step3-4 / low追従=T1 Step2&5 / mapSize作り直し=T1 Step2 setMapSize / 密度切替の再適用=T1 Step1(applyShadowArea経由)＋T2 Step1のCROSS3 / fpsResetMin=T1 Step6 / index.html無改変（初期ラベル影:OFFは既存のまま）
- 型整合: `setShadowMode`/`updateShadowTarget` は T1 Step2 定義・Step5/6 で使用。`shadowMode`/`setBlobs` は Step3 定義・Step5/6 で使用。旧 `setShadow`/`shadowOn` は完全に消える（他に呼び出し元なし — 現 main.js の btnShadow ハンドラのみ）
- TDZ: shadowMode/blob群は上部配置（Step3）なので起動時 setDensity('mid')→spawnUnits→setBlobs が安全
