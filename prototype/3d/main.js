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
    // 棒人間は1体ごとに専用ジオメトリ/マテリアルを持つ（viewer側の共有ジオメトリとは逆のルール）ので、
    // ここでdisposeしないと密度変更のたびにGPUリソースが漏れる
    for (const u of units) {
      u.mesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      ProtoViewer.scene.remove(u.mesh);
    }
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
  window.addEventListener('mousedown', e => {
    if (e.button !== 0) return; // 右クリック等はルック開始しない（コンテキストメニューと競合しないように）
    if (e.target.tagName !== 'BUTTON') { mouseLook = true; lx = e.clientX; ly = e.clientY; }
  });
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
    // 画面右= look×up =(-cosθ,+sinθ) なので dx は符号反転（machi-maker player-controls.js と同じ規約）
    const ang = Math.atan2(-v.dx, -v.dy) + camYaw;
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
      Stickman.animate(u.mesh, now, animOn && u.moving);
    }
    updateCamera();
    ProtoViewer.render();
    fpsTick(t);
  }

  setDensity('mid');

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

  loop(0);

  window.__proto = { get units() { return units; }, get player() { return player; }, setDensity };
})();
