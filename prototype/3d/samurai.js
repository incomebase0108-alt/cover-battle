// samurai.js — Tripo実写スキャン侍(リグ+アニメ10種入りGLB)を棒人間と同じ流儀で使うためのモジュール
// three.js r128 (UMD/グローバルTHREE) 用。1号機担当分(キャラ+武器+攻撃モーション)。
//
// ■必要なscriptタグ(three.min.jsの後に):
//   <script src="https://unpkg.com/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
//   <script src="https://unpkg.com/three@0.128.0/examples/js/utils/SkeletonUtils.js"></script>
//
// ■使い方(Stickmanとの対応):
//   Samurai.load('assets/', function(){ ... 以降createが使える ... });
//     ※GLBのURLはload(basePath)基準。base64焼き込みする場合は
//       Samurai.load({char:'data:...', spear:'data:...', katana:'data:...', bow:'data:...'}, cb) の形で渡せる
//   const g = Samurai.create('spear');        // 'spear'|'katana'|'bow'。足元原点・正面+Z・身長1.6mのTHREE.Group
//   Samurai.animate(g, t, walking);           // Stickman.animateと同じシグネチャ(tは秒の絶対時刻)
//   Samurai.attack(g);                        // 攻撃を1発再生(兵種に応じたモーション+槍は突きの伸び/閃光付き)
//   Samurai.setWeapon(g, 'katana');           // 武器持ち替え
//   g.userData.samurai.attacking              // 攻撃中フラグ(移動を止めたい時に)
//
// ■中身のメモ(検証済みの値。詳細は1号機 attach_test.html / proto_battle.html)
//   ・キャラGLBは実測身長0.95m → 内部ラッパーで1.6mへスケール(規約に合わせる)
//   ・Mixamo骨格はルート0.01スケール→手ボーンに武器を挿すと1/100になる。getWorldScaleで打ち消す
//   ・GLTFLoaderはボーン名の「:」を除去する(mixamorig:RightHand→mixamorigRightHand)
//   ・槍の突きは攻撃中だけ武器のワールド向きを「水平・攻撃開始時の向き」にロックする(元モーションは
//     下向き半身の銃剣術のため)。刀/弓はモーションそのままでOK
//   ・アニメ名: idle/walk/run/death/attack_spear/attack_bow/attack_sword/attack_great/attack_combo/attack_jump
//   ・walk/runはIn-Place化済み(前進成分除去済み。位置は呼び出し側で動かす)
const Samurai = (function () {
  'use strict';

  const CHAR_H = 0.95;            // GLBの実測身長
  const TARGET_H = 1.6;           // 規約身長(Stickmanに合わせる)
  const S = TARGET_H / CHAR_H;    // 1.684
  const OFFSETS = {               // 手ボーンローカルの装着姿勢(1号機attach_testで確定)
    katana: { hand: 'mixamorigRightHand', rot: [0, 0, -90], spin: 90, anim: 'attack_sword' },
    spear:  { hand: 'mixamorigRightHand', rot: [-90, 0, 0], spin: 0,  anim: 'attack_spear',
              startAt: 0.24, cutAt: 0.62, slideWin: [0.26, 0.46],
              holdShift: 0.35 * S, slideMax: 0.6 * S },  // 柄の下持ち/突きの伸び(身長比で拡大)
    bow:    { hand: 'mixamorigLeftHand',  rot: [0, 0, -90], spin: 0,  anim: 'attack_bow' },
  };

  let charG = null;
  const wepScenes = {};
  const clips = {};

  function load(base, onReady) {
    const urls = (typeof base === 'string')
      ? { char: base + 'char_samurai_01.glb', spear: base + 'weapon_spear_01.glb',
          katana: base + 'weapon_katana_01.glb', bow: base + 'weapon_bow_01.glb' }
      : base;
    // 逐次+リトライ読み込み(並列fetchで接続リセットを起こすローカルサーバがあるため)
    const loader = new THREE.GLTFLoader();
    const order = ['char', 'spear', 'katana', 'bow'];
    let i = 0;
    const next = () => {
      if (i >= order.length) { if (onReady) onReady(); return; }
      const key = order[i];
      let tries = 0;
      const go = () => loader.load(urls[key], g => {
        if (key === 'char') { charG = g; g.animations.forEach(c => { clips[c.name] = c; }); }
        else wepScenes[key] = g.scene;
        i++; next();
      }, undefined, () => { if (++tries < 4) setTimeout(go, 250); });
      go();
    };
    next();
  }

  function attachWeapon(g, kind) {
    const o = OFFSETS[kind];
    const bone = g.getObjectByName(o.hand) || g.getObjectByName(o.hand.replace('mixamorig', 'mixamorig:'));
    g.updateMatrixWorld(true);
    const ws = new THREE.Vector3(); bone.getWorldScale(ws);   // ルート0.01スケール対策
    const w = wepScenes[kind].clone(true);
    w.scale.setScalar(1 / ws.x);
    w.rotation.set(o.rot[0] * Math.PI / 180, o.rot[1] * Math.PI / 180, o.rot[2] * Math.PI / 180);
    if (o.spin) w.rotateY(o.spin * Math.PI / 180);
    bone.add(w);
    const ud = {
      kind, invScale: 1 / ws.x,
      baseQuat: w.quaternion.clone(),
      tipDir: new THREE.Vector3(0, 1, 0).applyQuaternion(w.quaternion),  // 柄→穂先(ボーン空間)
      holdShift: o.holdShift || 0,
    };
    w.userData = ud;
    w.position.copy(ud.tipDir).multiplyScalar(ud.holdShift * ud.invScale);
    return w;
  }

  function makeFlash() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c2 = cv.getContext('2d');
    const r = c2.createRadialGradient(32, 32, 2, 32, 32, 30);
    r.addColorStop(0, 'rgba(255,250,220,1)');
    r.addColorStop(0.4, 'rgba(255,240,180,0.55)');
    r.addColorStop(1, 'rgba(255,230,150,0)');
    c2.fillStyle = r; c2.fillRect(0, 0, 64, 64);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv), transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.visible = false;
    return sp;
  }

  function create(kind) {
    kind = kind || 'katana';
    const g = new THREE.Group();                       // 返すのは足元原点・スケール1のGroup
    const inner = THREE.SkeletonUtils.clone(charG.scene);
    inner.scale.setScalar(S);                          // 0.95m→1.6m
    inner.traverse(n => { if (n.isSkinnedMesh) { n.frustumCulled = false; n.castShadow = true; } });
    g.add(inner);
    const mixer = new THREE.AnimationMixer(inner);
    const acts = {};
    for (const n in clips) acts[n] = mixer.clipAction(clips[n]);
    const flash = makeFlash();
    g.add(flash);
    const sam = {
      kind, mixer, acts, flash, inner,
      cur: null, attacking: false, atkAction: null, atkBaseYaw: 0,
      lastT: null,
      weapon: attachWeapon(g, kind),
    };
    g.userData.samurai = sam;
    play(sam, 'idle');
    return g;
  }

  function play(sam, name, fade) {
    if (sam.cur === name) return;
    const a = sam.acts[name]; if (!a) return;
    const f = fade == null ? 0.18 : fade;
    a.reset().fadeIn(f).play();
    if (sam.cur) {
      // フェードアウトだけだと重み0のアクションがmixerに残り評価され続ける(攻撃連打で蓄積)→完全停止
      const prevName = sam.cur, prev = sam.acts[prevName];
      prev.fadeOut(f);
      setTimeout(() => { if (sam.cur !== prevName) prev.stop(); }, f * 1000 + 60);
    }
    sam.cur = name;
  }

  function setWeapon(g, kind) {
    const sam = g.userData.samurai;
    sam.weapon.parent.remove(sam.weapon);
    sam.kind = kind;
    sam.weapon = attachWeapon(g, kind);
  }

  function attack(g) {
    const sam = g.userData.samurai;
    if (sam.attacking) return;
    sam.attacking = true;
    const o = OFFSETS[sam.kind];
    const a = sam.acts[o.anim];
    a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
    a.fadeIn(0.08).play();
    if (o.startAt) a.time = o.startAt * a.getClip().duration;  // 振りかぶりを捨てて突きから
    if (sam.cur) sam.acts[sam.cur].fadeOut(0.08);
    const prev = sam.cur; sam.cur = o.anim;
    sam.atkAction = a;
    sam.atkBaseYaw = g.rotation.y;   // 攻撃開始時の向きに槍をロックする基準
    const finish = () => {
      if (!sam.attacking) return;
      sam.mixer.removeEventListener('finished', onEnd);
      sam.attacking = false; sam.cur = null;
      sam.weapon.quaternion.copy(sam.weapon.userData.baseQuat);
      sam.weapon.position.copy(sam.weapon.userData.tipDir)
        .multiplyScalar(sam.weapon.userData.holdShift * sam.weapon.userData.invScale);
      sam.flash.visible = false;
      a.fadeOut(0.15);
      setTimeout(() => { if (sam.cur !== o.anim) a.stop(); }, 210);
      play(sam, prev || 'idle');
    };
    const onEnd = e => { if (e.action === a) finish(); };
    sam.finishAtk = finish;
    sam.mixer.addEventListener('finished', onEnd);
  }

  const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _vTip = new THREE.Vector3();

  function spearFx(g, sam) {
    const o = OFFSETS[sam.kind];
    if (!(sam.attacking && o.slideWin && sam.atkAction)) return;
    const dur = sam.atkAction.getClip().duration;
    const ph = sam.atkAction.time / dur;
    if (o.cutAt && ph > o.cutAt) { sam.finishAtk(); return; }   // 後半の棒立ち区間は早期終了
    let sl = 0;
    if (ph > o.slideWin[0] && ph < o.slideWin[1])
      sl = Math.sin(Math.PI * (ph - o.slideWin[0]) / (o.slideWin[1] - o.slideWin[0])) * o.slideMax;
    const w = sam.weapon, bone = w.parent;
    // 槍のワールド向きを「水平・攻撃開始時の向き」にロック(元モーションは下向き半身の銃剣術のため)
    bone.getWorldQuaternion(_qb);
    _v1.set(Math.sin(sam.atkBaseYaw), 0, Math.cos(sam.atkBaseYaw));
    _v2.copy(w.userData.tipDir).applyQuaternion(_qb).normalize();
    _qa.setFromUnitVectors(_v2, _v1);
    _qc.copy(_qb).invert().multiply(_qa).multiply(_qb);
    w.quaternion.copy(w.userData.baseQuat).premultiply(_qc);
    _v3.copy(_v1).applyQuaternion(_qc.copy(_qb).invert());
    w.position.copy(_v3).multiplyScalar((w.userData.holdShift + sl) * w.userData.invScale);
    if (sl > 0.08 * S) {
      _vTip.set(0, 0.43, 0);
      w.localToWorld(_vTip);
      sam.flash.position.copy(g.worldToLocal(_vTip));
      sam.flash.scale.setScalar(0.22 + sl * 0.5);
      sam.flash.material.opacity = Math.min(1, sl * 1.7 / S);
      sam.flash.visible = true;
    } else {
      sam.flash.visible = false;
    }
  }

  // Stickman.animate(g, t, walking) と同じシグネチャ。tは秒の絶対時刻(内部でdt化)
  function animate(g, t, walking) {
    const sam = g.userData.samurai;
    const dt = sam.lastT == null ? 0 : Math.min(Math.max(t - sam.lastT, 0), 0.1);
    sam.lastT = t;
    if (!sam.attacking) play(sam, walking ? 'walk' : 'idle');
    sam.mixer.update(dt);
    spearFx(g, sam);
  }

  return { load, create, animate, attack, setWeapon, CLIP_NAMES: Object.keys(OFFSETS) };
})();
