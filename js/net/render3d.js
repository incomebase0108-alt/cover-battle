// render3d.js — netclient スナップショット → Three.js シーン反映アダプタ（Phase A: 観戦ビュー）
// 設計: docs/superpowers/specs/2026-07-17-render3d-adapter-design.md
//       + 2026-07-18-serialize-sync-review.md（1号機回答。cl主キー/w対応表/hu/ev/ar）
// client.js の window.NetRenderer フックに挿さる。2D座標(px, y下向き)→3D平面(x,z)、S=1/30。
// 依存: THREE(r128)+GLTFLoader+SkeletonUtils / ProtoViewer / Samurai（すべてscriptタグで先読み）
(function () {
  'use strict';

  const S = 1 / 30;                       // 2D px → 3D m（設計書: 実測で最終調整）
  const yawOf = (a) => Math.atan2(Math.cos(a), Math.sin(a)); // 2D角→3D yaw（設計書の写像）

  // 兵種 cl → Samurai kind（serialize-sync-review の推奨対応表。主キーはwでなくcl）
  const CL_KIND = {
    general: 'daimyo', ashigaru: 'katana', archer: 'bow', gunner: 'rifle',
    cavalry: 'katana', ninja: 'ninja', spearman: 'spear', gunshi: 'medic',
  };
  // 武器キー w → 侍モデル内での持ち替え先kind（専用モデルはsetWeapon不可＝据え置き）
  const W_KIND = {
    katana: 'katana', yari: 'spear', yumi: 'bow', teppo: 'rifle',
    flame: 'rifle', piercer: 'bow', rockbuster: 'rifle', rifle: 'rifle',
  };
  // アビリティ発動ev → 専用モーション（clipが無い兵種はact()がfalseを返すだけで安全）
  const EV_CLIP = { smoke: 'throw', revive: 'heal' };

  const TEAM_COL = [0x2f7bff, 0xff4d4d]; // 0=青 1=赤

  let viewer = null, stageEl = null;
  let samuraiReady = false, statusEl = null;
  let mapGroup = null, gateMeshes = [], builtStage = -1;
  let worldW = 160, worldH = 100; // m（Net.map取得後に更新）

  // --- 共有ジオメトリ/マテリアル ---------------------------------------------
  const G = {}, M = {};
  function makeShared() {
    G.ring = new THREE.RingGeometry(0.42, 0.58, 20); G.ring.rotateX(-Math.PI / 2);
    G.buffRing = new THREE.RingGeometry(0.62, 0.78, 20); G.buffRing.rotateX(-Math.PI / 2);
    G.sphere = new THREE.SphereGeometry(0.5, 8, 6);
    G.box = new THREE.BoxGeometry(1, 1, 1);
    G.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
    G.cone = new THREE.ConeGeometry(0.5, 1, 8);
    G.rock = new THREE.DodecahedronGeometry(0.5, 0);
    G.arrow = new THREE.BoxGeometry(0.06, 0.06, 0.9);
    M.ringBlue = new THREE.MeshBasicMaterial({ color: TEAM_COL[0], transparent: true, opacity: 0.85, depthWrite: false });
    M.ringRed = new THREE.MeshBasicMaterial({ color: TEAM_COL[1], transparent: true, opacity: 0.85, depthWrite: false });
    M.buff = new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.9, depthWrite: false });
    M.hit = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.4, depthWrite: false });
    M.smoke = new THREE.MeshLambertMaterial({ color: 0x9aa3aa, transparent: true, opacity: 0.45 });
    M.boom = new THREE.MeshBasicMaterial({ color: 0xff8c2a, transparent: true, opacity: 0.55, depthWrite: false });
    M.bomb = new THREE.MeshLambertMaterial({ color: 0x222222 });
    M.bombFlash = new THREE.MeshBasicMaterial({ color: 0xffffff });
    M.chest = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
    M.chestOpen = new THREE.MeshLambertMaterial({ color: 0x4d3117 });
    M.keg = new THREE.MeshLambertMaterial({ color: 0x6e4a22 });
  }

  // --- 丸影（prototype/3d main.js と同実装） ---------------------------------
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
  function attachBlob(g) {
    if (!blobGeo) { blobGeo = new THREE.PlaneGeometry(1.4, 1.4); blobGeo.rotateX(-Math.PI / 2); }
    if (!blobMat) blobMat = makeBlobMat();
    const b = new THREE.Mesh(blobGeo, blobMat);
    b.position.y = 0.02; b.userData._blob = 1; b.visible = false;
    g.add(b);
    return b;
  }

  // --- 影モード（プロトタイプと同じ4段。既定=低） -----------------------------
  const SHADOW_MODES = ['off', 'blob', 'low', 'high'];
  const SHADOW_LABEL = { off: 'OFF', blob: '丸影', low: '低', high: '高' };
  let shadowMode = 'low';
  function setShadow(mode) {
    shadowMode = mode;
    viewer.setShadowMode(mode === 'blob' ? 'off' : mode);
    const blobOn = mode === 'blob';
    for (const k in units) if (units[k].blob) units[k].blob.visible = blobOn && units[k].g.visible;
    for (const b of beasts) if (b && b.blob) b.blob.visible = blobOn && b.g.visible;
  }

  // --- ユニット（u[] / be[]） -------------------------------------------------
  // units: u.i → レコード。beasts: 配列index → レコード（数が変わったら作り直し）
  const units = {};   // { g, kind, w, ring, buff, hitFx, blob, prevSw, lastX, lastZ, lastT, dead, sunk, huUntil }
  const beasts = [];

  function makeRing(team) {
    return new THREE.Mesh(G.ring, team === 1 ? M.ringRed : M.ringBlue);
  }

  function newUnitRec(kind, team, scaleMul) {
    const g = Samurai.create(kind);
    if (scaleMul && scaleMul !== 1) g.scale.setScalar(scaleMul);
    const ring = makeRing(team); ring.position.y = 0.03; g.add(ring);
    const buff = new THREE.Mesh(G.buffRing, M.buff); buff.position.y = 0.05; buff.visible = false; g.add(buff);
    const hitFx = new THREE.Mesh(G.sphere, M.hit); hitFx.scale.setScalar(2.2); hitFx.position.y = 0.9; hitFx.visible = false; g.add(hitFx);
    const blob = attachBlob(g);
    blob.visible = shadowMode === 'blob';
    viewer.scene.add(g);
    return { g, kind, w: null, ring, buff, hitFx, blob, prevSw: 0, lastX: null, lastZ: null, lastT: 0, dead: false, sunk: 0, huUntil: 0 };
  }

  function disposeRec(rec) {
    viewer.scene.remove(rec.g);
    // ジオメトリ/マテリアルは共有（Samurai内部もGLB共有）なのでdisposeしない
  }

  // 死亡モーション: 1回再生して最終フレームで静止。animate()のidle復帰はattackingフラグで抑止
  function playDeath(g) {
    const sam = g.userData.samurai;
    if (!sam || sam.cur === 'death') return;
    if (sam.attacking && sam.finishAtk) sam.finishAtk();
    sam.atkDef = null; sam.atkAction = null;   // 槍FXの残骸で武器ロックが走らないように
    sam.attacking = true;                       // idle/walk切替を止める（mixerは回り続ける）
    const a = sam.acts['death'];
    if (!a) return;
    a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
    if (sam.cur && sam.acts[sam.cur]) sam.acts[sam.cur].fadeOut(0.12);
    a.fadeIn(0.12).play();
    sam.cur = 'death';
  }
  function clearDeath(g) { // 蘇生
    const sam = g.userData.samurai;
    if (!sam) return;
    if (sam.cur === 'death') { sam.acts['death'].stop(); sam.cur = null; }
    sam.attacking = false;
  }

  // 位置差分から歩行判定（mvはフォールバック。1号機推奨: 補間済みビューの速度で切替）
  function updateWalk(rec, x, z, now, mv) {
    let walking = !!mv;
    if (rec.lastX != null) {
      const dt = (now - rec.lastT) / 1000;
      if (dt > 0.001) {
        const spd = Math.hypot(x - rec.lastX, z - rec.lastZ) / dt; // m/s
        walking = spd > 0.45;
      }
    }
    rec.lastX = x; rec.lastZ = z; rec.lastT = now;
    return walking;
  }

  function syncUnit(rec, u, now) {
    const g = rec.g;
    const x = u.x * S, z = u.y * S;
    g.position.set(x, 0, z);
    g.rotation.y = yawOf(u.a);

    // 武器持ち替え（侍モデル内のみ。専用モデルはfalseが返るだけ）
    if (u.w !== rec.w) {
      rec.w = u.w;
      const wk = W_KIND[u.w];
      if (wk && wk !== g.userData.samurai.kind) Samurai.setWeapon(g, wk);
    }

    // 生死
    if (!u.al) {
      if (!rec.dead) { rec.dead = true; rec.sunk = 0; playDeath(g); }
      if (!u.dn) {
        // 完全死亡: 死亡モーション後に沈めて消す（マテリアル共有のためフェードでなく沈下）
        if (rec.deadAt == null) rec.deadAt = now;
        if (now - rec.deadAt > 2400) {
          rec.sunk = Math.min(1.4, rec.sunk + 0.012);
          g.position.y = -rec.sunk;
          if (rec.sunk >= 1.4) g.visible = false;
        }
      }
      // dn=1（ダウン）は伏せたまま表示（担がれると位置だけ滑る=Phase A許容）
      rec.ring.visible = false; rec.buff.visible = false;
      Samurai.animate(g, now / 1000, false);
      return;
    }
    if (rec.dead) { // 蘇生
      rec.dead = false; rec.deadAt = null; rec.sunk = 0;
      g.visible = true; g.position.y = 0; rec.ring.visible = true;
      clearDeath(g);
    }

    // 攻撃: swの立ち上がりエッジ（近接/射撃共通・種別はwで既に持ち替え済み）。
    // flameだけはswが下がりきらない連続発射状態 → 再生中でなければ撃ち続ける
    const sam = g.userData.samurai;
    if (u.sw > 0 && (rec.prevSw === 0 || (u.w === 'flame' && !sam.attacking))) {
      if (!sam.attacking) Samurai.attack(g);
    }
    rec.prevSw = u.sw;

    // 被弾フラッシュ（hu=サーバ確定の1回きりフラグ）
    if (u.hu) rec.huUntil = now + 130;
    rec.hitFx.visible = now < rec.huUntil;

    // 采配/オーラ（+ evのパルス演出はpulseUntilで数百ms光らせる）
    rec.buff.visible = u.bf > 0 || now < (rec.pulseUntil || 0);
    if (u.bf === 2 || now < (rec.pulseUntil || 0)) { const p = 1 + 0.12 * Math.sin(now / 90); rec.buff.scale.setScalar(p); }
    else rec.buff.scale.setScalar(1);

    Samurai.animate(g, now / 1000, updateWalk(rec, x, z, now, u.mv));
  }

  function syncUnits(view, now) {
    lastUnitCount = view.u.length;
    const seen = {};
    for (const u of view.u) {
      seen[u.i] = 1;
      let rec = units[u.i];
      const kind = CL_KIND[u.cl] || 'katana';
      if (rec && rec.kind !== kind) { disposeRec(rec); rec = null; }
      if (!rec) { rec = units[u.i] = newUnitRec(kind, u.t, 1); rec.w = null; }
      if (rec.ring.material !== (u.t === 1 ? M.ringRed : M.ringBlue)) rec.ring.material = u.t === 1 ? M.ringRed : M.ringBlue;
      syncUnit(rec, u, now);
    }
    for (const k in units) if (!seen[k]) { disposeRec(units[k]); delete units[k]; }
  }

  // 野武士/剣豪（be[]）: kind=ronin。剣豪はスケールで強者感（レビュー回答）
  function syncBeasts(view, now) {
    const list = view.be || [];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      let rec = beasts[i];
      if (rec && rec.ty !== b.ty) { disposeRec(rec); rec = null; }
      if (!rec) {
        rec = beasts[i] = newUnitRec('ronin', b.tm === 'red' ? 1 : b.tm === 'blue' ? 0 : -1, b.ty === 'kengo' ? 1.15 : 1);
        rec.ty = b.ty;
        rec.ring.visible = b.tm === 'blue' || b.tm === 'red';
      }
      const g = rec.g;
      g.visible = true;
      const x = b.x * S, z = b.y * S;
      g.position.set(x, 0, z);
      g.rotation.y = yawOf(b.a);
      // 説得で寝返るとtmが付く → リング表示を更新
      const teamed = b.tm === 'blue' || b.tm === 'red';
      rec.ring.visible = teamed;
      if (teamed) rec.ring.material = b.tm === 'red' ? M.ringRed : M.ringBlue;
      if (b.h <= 0) { if (!rec.dead) { rec.dead = true; playDeath(g); } }
      else if (rec.dead) { rec.dead = false; clearDeath(g); }
      Samurai.animate(g, now / 1000, updateWalk(rec, x, z, now, false));
    }
    for (let i = list.length; i < beasts.length; i++) if (beasts[i]) { disposeRec(beasts[i]); beasts[i] = null; }
    beasts.length = list.length;
  }

  // --- 弾/爆発/煙/宝箱/樽/制圧点 ---------------------------------------------
  const FX = {};
  function makeFx() {
    FX.bullets = new THREE.InstancedMesh(G.sphere, new THREE.MeshBasicMaterial({ color: 0xffffff }), 128);
    FX.arrows = new THREE.InstancedMesh(G.arrow, new THREE.MeshBasicMaterial({ color: 0xd8c9a0 }), 64);
    FX.bullets.count = 0; FX.arrows.count = 0;
    viewer.scene.add(FX.bullets); viewer.scene.add(FX.arrows);
    FX.bombs = []; FX.smokes = []; FX.chests = []; FX.kegs = []; FX.cps = [];
  }
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _sc = new THREE.Vector3();
  const _cWhite = new THREE.Color(0xfff6d8), _cFire = new THREE.Color(0xff7a20), _cBall = new THREE.Color(0x333333);

  function syncBullets(view, now) {
    const bs = view.b || [];
    let nb = 0, na = 0;
    for (const b of bs) {
      const x = b.x * S, z = b.y * S;
      if (b.ar && na < 64) {
        // 矢: 細長い箱。スナップに速度が無く進行方向は不明 → 水平置き（Phase A簡易）
        _v.set(x, 1.0, z); _q.set(0, 0, 0, 1); _sc.set(1, 1, 1);
        _m4.compose(_v, _q, _sc);
        FX.arrows.setMatrixAt(na++, _m4);
      } else if (nb < 128) {
        const r = b.bl ? Math.max(0.35, (b.br || 10) * S) : (b.f ? 0.32 : 0.18);
        _v.set(x, b.bl ? r : 1.0, z); _q.set(0, 0, 0, 1); _sc.setScalar(r * 2);
        _m4.compose(_v, _q, _sc);
        FX.bullets.setMatrixAt(nb, _m4);
        FX.bullets.setColorAt(nb, b.bl ? _cBall : (b.f ? _cFire : _cWhite));
        nb++;
      }
    }
    FX.bullets.count = nb; FX.arrows.count = na;
    FX.bullets.instanceMatrix.needsUpdate = true;
    FX.arrows.instanceMatrix.needsUpdate = true;
    if (FX.bullets.instanceColor) FX.bullets.instanceColor.needsUpdate = true;
  }

  function poolSync(pool, list, make, update) {
    for (let i = 0; i < list.length; i++) {
      if (!pool[i]) { pool[i] = make(); viewer.scene.add(pool[i]); }
      pool[i].visible = true;
      update(pool[i], list[i]);
    }
    for (let i = list.length; i < pool.length; i++) if (pool[i]) pool[i].visible = false;
  }

  function syncFx(view, now) {
    syncBullets(view, now);
    poolSync(FX.bombs, view.bo || [], () => new THREE.Mesh(G.sphere, M.bomb), (m, b) => {
      m.position.set(b.x * S, 0.25, b.y * S);
      if (b.e) { const r = Math.max(0.6, (b.dr || 30) * S * 2); m.scale.setScalar(r); m.material = M.boom; m.position.y = 0.6; }
      else { m.scale.setScalar(0.5); m.material = b.fl > 0 && Math.floor(now / 90) % 2 === 0 ? M.bombFlash : M.bomb; }
    });
    poolSync(FX.smokes, view.sm || [], () => new THREE.Mesh(G.sphere, M.smoke), (m, s) => {
      m.position.set(s.x * S, 1.0, s.y * S);
      m.scale.setScalar(Math.max(0.8, s.r * S * 2));
    });
    poolSync(FX.chests, view.c || [], () => new THREE.Mesh(G.box, M.chest), (m, c) => {
      m.position.set(c.x * S, 0.3, c.y * S);
      m.scale.set(0.9, 0.6, 0.6);
      m.material = c.o ? M.chestOpen : M.chest;
    });
    poolSync(FX.kegs, view.kg || [], () => new THREE.Mesh(G.cyl, M.keg), (m, k) => {
      m.position.set(k.x * S, 0.45, k.y * S);
      m.scale.set(0.7, 0.9, 0.7);
    });
    poolSync(FX.cps, view.cp || [], () => {
      const grp = new THREE.Group();
      const pole = new THREE.Mesh(G.cyl, new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      pole.scale.set(0.1, 3.2, 0.1); pole.position.y = 1.6; grp.add(pole);
      const flag = new THREE.Mesh(G.box, new THREE.MeshLambertMaterial({ color: 0x999999 }));
      flag.scale.set(0.9, 0.55, 0.06); flag.position.set(0.5, 2.8, 0); grp.add(flag);
      grp.userData.flagMat = flag.material;
      return grp;
    }, (grp, c) => {
      grp.position.set(c.x * S, 0, c.y * S);
      const col = c.o === 'blue' || c.o === 0 ? TEAM_COL[0] : c.o === 'red' || c.o === 1 ? TEAM_COL[1] : 0x999999;
      grp.userData.flagMat.color.setHex(col);
    });
    // 城門: 静的メッシュだがHPで消える（ga[]は生成順でmap.gatesと一致）
    const ga = view.ga || [];
    for (let i = 0; i < gateMeshes.length && i < ga.length; i++) {
      gateMeshes[i].visible = ga[i] > 0;
      gateMeshes[i].material.color.setHex(ga[i] < 0.4 ? 0x5a3a1a : 0x8b5a2b);
    }
  }

  // --- マップのブロックアウト（Net.map から一度だけ生成） ---------------------
  function hash01(i, k) { return (Math.sin(i * 127.1 + k * 311.7) * 43758.5453) % 1 * 0.5 + 0.5; }

  function buildMap(map, stageIdx) {
    if (mapGroup) { viewer.scene.remove(mapGroup); }
    mapGroup = new THREE.Group(); gateMeshes = [];
    worldW = CONFIG.world.width * S; worldH = CONFIG.world.height * S;

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(worldW + 60, worldH + 60), new THREE.MeshLambertMaterial({ color: 0x7d8f5c }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(worldW / 2, 0, worldH / 2);
    ground.receiveShadow = true;
    mapGroup.add(ground);

    const rectPlane = (r, color, y) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r.w * S, r.h * S), new THREE.MeshLambertMaterial({ color }));
      m.rotation.x = -Math.PI / 2;
      m.position.set((r.x + r.w / 2) * S, y, (r.y + r.h / 2) * S);
      m.receiveShadow = true;
      mapGroup.add(m);
      return m;
    };
    for (const r of map.rivers) rectPlane(r, 0x4a7fb8, 0.02);
    for (const r of map.sand) rectPlane(r, 0xcfc08a, 0.015);
    for (const o of map.oases) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(o.r * S, 20), new THREE.MeshLambertMaterial({ color: 0x59c2c2 }));
      m.rotation.x = -Math.PI / 2; m.position.set(o.x * S, 0.02, o.y * S);
      mapGroup.add(m);
    }
    for (const l of map.ledges) {
      const m = new THREE.Mesh(G.box, new THREE.MeshLambertMaterial({ color: 0x9a8f70 }));
      m.scale.set(l.w * S, 1.0, l.h * S);
      m.position.set((l.x + l.w / 2) * S, 0.5, (l.y + l.h / 2) * S);
      m.castShadow = m.receiveShadow = true;
      mapGroup.add(m);
    }

    // 岩/山（Instanced）
    const rockIM = new THREE.InstancedMesh(G.rock, new THREE.MeshLambertMaterial({ color: 0x8d8d86 }), Math.max(1, map.rocks.length));
    map.rocks.forEach((r, i) => {
      const s = Math.max(0.5, r.r * S * 2);
      _v.set(r.x * S, s * 0.35, r.y * S); _q.setFromEuler(new THREE.Euler(0, hash01(i, 1) * 6.28, 0)); _sc.set(s, s * 0.8, s);
      _m4.compose(_v, _q, _sc); rockIM.setMatrixAt(i, _m4);
    });
    rockIM.count = map.rocks.length; rockIM.castShadow = rockIM.receiveShadow = true;
    mapGroup.add(rockIM);
    if (map.mountains.length) {
      const mtIM = new THREE.InstancedMesh(G.cone, new THREE.MeshLambertMaterial({ color: 0x6b6f66 }), map.mountains.length);
      map.mountains.forEach((mt, i) => {
        const rr = mt.r * S * 2;
        _v.set(mt.x * S, rr * 0.55, mt.y * S); _q.set(0, 0, 0, 1); _sc.set(rr, rr * 1.1, rr);
        _m4.compose(_v, _q, _sc); mtIM.setMatrixAt(i, _m4);
      });
      mtIM.castShadow = true; mapGroup.add(mtIM);
    }

    // 森: 円ごとに数本の木（幹+葉。位置は決定的な擬似乱数）
    let treeN = 0;
    for (const f of map.forests) treeN += Math.max(2, Math.min(7, Math.round(f.r / 22)));
    if (treeN) {
      const leafIM = new THREE.InstancedMesh(G.cone, new THREE.MeshLambertMaterial({ color: 0x2f6b3a }), treeN);
      const trunkIM = new THREE.InstancedMesh(G.cyl, new THREE.MeshLambertMaterial({ color: 0x5a4326 }), treeN);
      let ti = 0;
      map.forests.forEach((f, fi) => {
        const n = Math.max(2, Math.min(7, Math.round(f.r / 22)));
        for (let k = 0; k < n; k++) {
          const ang = hash01(fi, k) * Math.PI * 2, rad = hash01(fi, k + 9) * f.r * S * 0.8;
          const tx = f.x * S + Math.cos(ang) * rad, tz = f.y * S + Math.sin(ang) * rad;
          const h = 2.2 + hash01(fi, k + 17) * 1.6;
          _v.set(tx, h * 0.62 + 0.5, tz); _q.identity(); _sc.set(h * 0.55, h, h * 0.55);
          _m4.compose(_v, _q, _sc); leafIM.setMatrixAt(ti, _m4);
          _v.set(tx, 0.35, tz); _sc.set(0.22, 0.7, 0.22);
          _m4.compose(_v, _q, _sc); trunkIM.setMatrixAt(ti, _m4);
          ti++;
        }
      });
      leafIM.castShadow = true;
      mapGroup.add(leafIM); mapGroup.add(trunkIM);
    }

    // 城壁と城門（門は個別メッシュ=HPで消すため）
    for (const w of map.walls) {
      const m = new THREE.Mesh(G.box, new THREE.MeshLambertMaterial({ color: w.team === 'blue' ? 0x4a5a72 : 0x724a4a }));
      m.scale.set(Math.max(0.6, w.w * S), 2.6, Math.max(0.6, w.h * S));
      m.position.set((w.x + w.w / 2) * S, 1.3, (w.y + w.h / 2) * S);
      m.castShadow = m.receiveShadow = true;
      mapGroup.add(m);
    }
    for (const gt of map.gates) {
      const m = new THREE.Mesh(G.box, new THREE.MeshLambertMaterial({ color: 0x8b5a2b }));
      m.scale.set(Math.max(0.6, gt.w * S), 2.2, Math.max(0.6, gt.h * S));
      m.position.set((gt.x + gt.w / 2) * S, 1.1, (gt.y + gt.h / 2) * S);
      m.castShadow = true;
      mapGroup.add(m); gateMeshes.push(m);
    }

    // 本丸（砦コア）: 天守もどきの2段箱 + 回復圏リング
    for (const b of map.bases) {
      const col = b.team === 'blue' ? TEAM_COL[0] : TEAM_COL[1];
      const core = new THREE.Group();
      const b1 = new THREE.Mesh(G.box, new THREE.MeshLambertMaterial({ color: 0xe8e2d4 }));
      b1.scale.set(4.4, 3, 4.4); b1.position.y = 1.5; core.add(b1);
      const b2 = new THREE.Mesh(G.box, new THREE.MeshLambertMaterial({ color: 0xe8e2d4 }));
      b2.scale.set(3.2, 2.2, 3.2); b2.position.y = 4.1; core.add(b2);
      const roof = new THREE.Mesh(G.cone, new THREE.MeshLambertMaterial({ color: col }));
      roof.scale.set(4.4, 1.6, 4.4); roof.position.y = 6.0; core.add(roof);
      core.position.set(b.x * S, 0, b.y * S);
      core.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
      mapGroup.add(core);
      const heal = new THREE.Mesh(new THREE.RingGeometry(b.r * S - 0.3, b.r * S, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false }));
      heal.rotation.x = -Math.PI / 2; heal.position.set(b.x * S, 0.04, b.y * S);
      mapGroup.add(heal);
    }

    viewer.scene.add(mapGroup);
    // ProtoViewerの影カメラにマップ範囲を教える（showCityの空盤面でboundsだけ渡す）
    viewer.showCity({ prims: [], bounds: { cx: worldW / 2, cz: worldH / 2, r: Math.max(worldW, worldH) / 2 } });
    setShadow(shadowMode);
    builtStage = stageIdx;
  }

  // --- 観戦カメラ: 全体追従（生存ユニット重心）⇄ ユニット追従。ドラッグ=回転/ホイール=ズーム
  let camYaw = 0.6, camPitch = 0.55, camDist = 42, followIdx = -1, lastUnitCount = 8; // -1=全体
  const camFocus = { x: 80, z: 50 };
  function setupCamControls() {
    let lookId = null, lx = 0, ly = 0, mouseLook = false;
    const look = (dx, dy) => {
      camYaw -= dx * 0.006;
      camPitch = Math.max(0.12, Math.min(1.35, camPitch + dy * 0.004));
    };
    window.addEventListener('touchstart', e => {
      if (e.target.closest && e.target.closest('#lobby,#hud3d,button')) return;
      const t = e.changedTouches[0];
      if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
    }, { passive: true });
    window.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) if (t.identifier === lookId) {
        look(t.clientX - lx, t.clientY - ly); lx = t.clientX; ly = t.clientY;
      }
    }, { passive: true });
    const tEnd = e => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
    window.addEventListener('touchend', tEnd);
    window.addEventListener('touchcancel', tEnd);
    window.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (e.target.closest && e.target.closest('#lobby,#hud3d,button,input')) return;
      mouseLook = true; lx = e.clientX; ly = e.clientY;
    });
    window.addEventListener('mousemove', e => { if (mouseLook) { look(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY; } });
    window.addEventListener('mouseup', () => { mouseLook = false; });
    window.addEventListener('wheel', e => {
      camDist = Math.max(7, Math.min(130, camDist * (e.deltaY > 0 ? 1.12 : 0.9)));
    }, { passive: true });
  }

  function updateCamera(view) {
    let tx = camFocus.x, tz = camFocus.z, ty = 1.2;
    const alive = view.u.filter(u => u.al);
    if (followIdx >= 0) {
      const u = view.u[followIdx];
      if (u && u.al) { tx = u.x * S; tz = u.y * S; camDist = Math.min(camDist, 24); }
      else followIdx = -1;
    }
    if (followIdx < 0 && alive.length) {
      let sx = 0, sz = 0;
      for (const u of alive) { sx += u.x; sz += u.y; }
      tx = sx / alive.length * S; tz = sz / alive.length * S;
    }
    // なめらか追従
    camFocus.x += (tx - camFocus.x) * 0.06;
    camFocus.z += (tz - camFocus.z) * 0.06;
    const cam = viewer.camera;
    const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
    cam.position.set(
      camFocus.x - Math.sin(camYaw) * camDist * cp,
      ty + camDist * sp,
      camFocus.z - Math.cos(camYaw) * camDist * cp);
    cam.lookAt(camFocus.x, ty, camFocus.z);
    viewer.updateShadowTarget(camFocus.x, camFocus.z);
  }

  // --- HUD（DOM。alive数/砦/fps/ステータス） ---------------------------------
  let hudAlive = null, hudFps = null, hudBanner = null;
  let frames = 0, winStart = 0;
  function fpsTick(now) {
    frames++;
    if (!winStart) { winStart = now; return; }
    if (now - winStart >= 1000) {
      if (hudFps && lastSnapAt && now - lastSnapAt <= 1500) {
        hudFps.textContent = Math.round(frames * 1000 / (now - winStart)) + 'fps';
      }
      frames = 0; winStart = now;
    }
  }
  function updateHud(view) {
    if (hudAlive && view.al) {
      const ft = view.ft || { b: 0, r: 0 };
      hudAlive.textContent = `青 ${view.al.b}（🏰${Math.round(ft.b * 100)}%）　赤 ${view.al.r}（🏰${Math.round(ft.r * 100)}%）`;
    }
  }

  // --- fps計測の有効/無効の見張り ---------------------------------------------
  // server.js は待機ロビー中と試合終了後は _update もスナップ配信も止める（server.js の
  // メインループ参照）。その状態だと駒が止まったまま＝ほぼ無負荷で60fpsが出てしまい、
  // 「実測できた」と誤解する。スナップが途切れたらHUDではっきり無効だと知らせる。
  let lastSnapAt = 0, lastSnapRef = null;
  function watchLive() {
    setInterval(() => {
      if (!hudFps) return;
      const stalled = !lastSnapAt || performance.now() - lastSnapAt > 1500;
      hudFps.style.color = stalled ? '#ff6b6b' : '';
      if (stalled) {
        hudFps.textContent = '試合が動いていません（fpsは無効）';
        if (statusEl) statusEl.textContent = 'PC側でスロットを選び「ゲーム開始」を押すと動きます';
      } else if (statusEl && statusEl.textContent.indexOf('ゲーム開始') >= 0) {
        statusEl.textContent = '';
      }
    }, 700);
  }

  // --- 本体 -------------------------------------------------------------------
  function init() {
    stageEl = document.getElementById('stage3d');
    statusEl = document.getElementById('hud3dStatus');
    hudAlive = document.getElementById('hud3dAlive');
    hudFps = document.getElementById('hud3dFps');
    viewer = ProtoViewer;
    viewer.init(stageEl);
    makeShared();
    makeFx();
    setupCamControls();
    watchLive();
    // 影ボタン（プロトタイプと同じ4段サイクル）
    const sb = document.getElementById('btnShadow3d');
    if (sb) sb.addEventListener('click', () => {
      const next = SHADOW_MODES[(SHADOW_MODES.indexOf(shadowMode) + 1) % SHADOW_MODES.length];
      setShadow(next);
      sb.textContent = '影:' + SHADOW_LABEL[next];
    });
    // 視点ボタン: 全体 → 各ユニット追従を巡回
    const vb = document.getElementById('btnView3d');
    if (vb) vb.addEventListener('click', () => {
      followIdx = followIdx >= lastUnitCount - 1 ? -1 : followIdx + 1;
      vb.textContent = followIdx < 0 ? '視点:全体' : '視点:' + (followIdx + 1) + '番';
    });
    if (statusEl) statusEl.textContent = '3Dキャラ読み込み中…';
    Samurai.load('prototype/3d/assets/', () => {
      samuraiReady = true;
      if (statusEl) statusEl.textContent = '';
      window.READY3D = true; // ヘッドレス検証用
    });
  }

  window.NetRenderer = {
    frame(view, net, now) {
      if (!samuraiReady) { fpsTick(now); return; } // GLB読込前は描かない（棒人間代替はPhase Aでは省略）
      if (net.snap !== lastSnapRef) { lastSnapRef = net.snap; lastSnapAt = now; } // 新しいスナップ＝試合が動いている
      if (net.stage !== builtStage || !mapGroup) buildMap(net.map, net.stage);
      syncUnits(view, now);
      syncBeasts(view, now);
      syncFx(view, now);
      updateCamera(view);
      updateHud(view);
      viewer.render();
      fpsTick(now);
    },
    events(evList, net) {
      for (const ev of evList) {
        if (ev.e !== 'abl') continue;
        const rec = units[ev.i];
        if (!rec || rec.dead) continue;
        const clip = EV_CLIP[ev.k];
        if (clip) Samurai.act(rec.g, clip);
        else rec.pulseUntil = performance.now() + 600; // dash/fastreload/capture/rally: リングのパルスで簡易表現
      }
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
