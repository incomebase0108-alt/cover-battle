// samurai.js — Tripoスキャン戦国キャラ(リグ+アニメ入りGLB)を棒人間と同じ流儀で使うためのモジュール
// three.js r128 (UMD/グローバルTHREE) 用。1号機担当分(キャラ+武器+攻撃モーション)。
//
// ■必要なscriptタグ(three.min.jsの後に):
//   <script src="https://unpkg.com/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
//   <script src="https://unpkg.com/three@0.128.0/examples/js/utils/SkeletonUtils.js"></script>
//
// ■使い方(Stickmanとの対応):
//   Samurai.load('assets/', function(){ ... 以降createが使える ... });
//     ※base64焼き込みは Samurai.load({samurai:'data:...', daimyo:..., wep_spear:..., ...}, cb) でURL差し替え可
//       (キー名はload()内のurls定義を参照。wep_接頭辞が武器)
//   const g = Samurai.create(kind);           // 足元原点・正面+Z・身長約1.6mのTHREE.Group
//     kind: 'spear'|'katana'|'bow'|'rifle'    … 侍モデル+武器(rifle=火縄銃)
//           'daimyo'|'ninja'|'ronin'|'medic'  … 兵種モデル(大名=火縄銃/忍者・浪人=刀/衛生兵=素手)
//   Samurai.animate(g, t, walking);           // Stickman.animateと同じシグネチャ(兵種ごとの待機/歩行を自動選択)
//   Samurai.attack(g);                        // 兵種の主攻撃を1発(槍=突きの伸び+閃光)
//   Samurai.act(g, clip);                     // 任意の1発モーション: 'kneel'(全員)/'yell'(大名の号令)/
//                                             //   'throw'(忍者の手裏剣)/'attack_combo'(浪人)/'attack_sword2'(忍者) 等
//   Samurai.setWeapon(g, kind);               // 同モデル内の持ち替え(spear/katana/bow/rifle同士)。モデル違いはfalse
//   g.userData.samurai.attacking              // 攻撃/モーション中フラグ(移動を止めたい時に)
//   Samurai.KIND_NAMES                        // 使えるkind一覧
//
// ■中身のメモ(検証値。詳細は1号機 char-lib の attach_test.html / proto_battle.html)
//   ・キャラGLBは実測身長0.9〜1.0mでモデルごとに違う→bbox実測して1.6mへスケール(GLB内部スケールは信用しない)
//   ・Mixamo骨格はルート0.01スケール→手ボーンの武器はgetWorldScaleで打ち消す
//   ・GLTFLoaderはボーン名の「:」を除去(mixamorig:RightHand→mixamorigRightHand)
//   ・槍の突きは攻撃中だけ武器のワールド向きを「水平・攻撃開始時の向き」にロック
//   ・walk/run/crouch_walk/rifle_walkはIn-Place化済み(位置は呼び出し側で動かす)
//   ・アニメ一覧: 侍14(idle/walk/run/death/attack_spear/attack_bow/attack_sword/attack_great/attack_combo/
//     attack_jump/rifle_idle/rifle_fire/rifle_walk/kneel) 大名7(+yell/attack_gun) 忍者8(+attack_sword2/throw)
//     浪人7(+attack_great/attack_combo) 衛生兵6(+heal/crouch_walk)
const Samurai = (function () {
  'use strict';

  const TARGET_H = 1.6;   // 規約身長(Stickmanに合わせる)

  // 武器の装着姿勢(手ボーンローカル・attach_testで確定した値)
  const WEAPONS = {
    spear:     { hand: 'mixamorigRightHand', rot: [-90, 0, 0], spin: 0,
                 holdShift: 0.35, slideMax: 0.6 },   // 柄の下持ち/突きの伸び(m・1.6mスケール後の実寸)
    katana:    { hand: 'mixamorigRightHand', rot: [0, 0, -90], spin: 90 },
    bow:       { hand: 'mixamorigLeftHand',  rot: [0, 0, -90], spin: 0 },
    matchlock: { hand: 'mixamorigRightHand', rot: [-90, 0, 0], spin: 0 },
  };

  // 兵種定義: モデル×武器×アニメ名
  const KINDS = {
    spear:  { model: 'samurai', weapon: 'spear',     attack: 'attack_spear',
              spearFx: true, startAt: 0.24, cutAt: 0.62, slideWin: [0.26, 0.46] },
    katana: { model: 'samurai', weapon: 'katana',    attack: 'attack_sword' },
    bow:    { model: 'samurai', weapon: 'bow',       attack: 'attack_bow' },
    rifle:  { model: 'samurai', weapon: 'matchlock', attack: 'rifle_fire',
              idle: 'rifle_idle', walk: 'rifle_walk' },
    daimyo: { model: 'daimyo',  weapon: 'matchlock', attack: 'attack_gun' },
    ninja:  { model: 'ninja',   weapon: 'katana',    attack: 'attack_sword' },
    ronin:  { model: 'ronin',   weapon: 'katana',    attack: 'attack_great' },
    medic:  { model: 'medic',   weapon: null,        attack: 'heal' },
  };

  const models = {};     // name -> {scene, clips, scale}
  const wepScenes = {};  // name -> scene

  function load(base, onReady) {
    const urls = (typeof base === 'string')
      ? { samurai: base + 'char_samurai_01.glb', daimyo: base + 'char_daimyo_01.glb',
          ninja: base + 'char_ninja_01.glb', ronin: base + 'char_ronin_01.glb',
          medic: base + 'char_medic_01.glb',
          wep_spear: base + 'weapon_spear_01.glb', wep_katana: base + 'weapon_katana_01.glb',
          wep_bow: base + 'weapon_bow_01.glb', wep_matchlock: base + 'weapon_matchlock_01.glb' }
      : base;
    // 逐次+リトライ読み込み(並列fetchで接続リセットを起こすローカルサーバがあるため)
    const loader = new THREE.GLTFLoader();
    const order = Object.keys(urls);
    let i = 0;
    const next = () => {
      if (i >= order.length) { if (onReady) onReady(); return; }
      const key = order[i];
      let tries = 0;
      const go = () => loader.load(urls[key], g => {
        if (key.indexOf('wep_') === 0) {
          wepScenes[key.slice(4)] = g.scene;
        } else {
          const clips = {};
          g.animations.forEach(c => { clips[c.name] = c; });
          // 身長はモデルごとに実測。スキンメッシュのBox3はノード構造次第で嘘をつき、
          // レスト姿勢の骨高さもアニメ適用後と一致しない(実測で約2倍差)。
          // → idleアニメを1フレーム流してから頭頂ボーンを測る=描画と同一条件の実寸
          const probeMixer = new THREE.AnimationMixer(g.scene);
          const probeClip = clips['idle'] || g.animations[0];
          probeMixer.clipAction(probeClip).play();
          probeMixer.update(0.001);
          g.scene.updateMatrixWorld(true);
          const top = g.scene.getObjectByName('mixamorigHeadTop_End')
                   || g.scene.getObjectByName('mixamorig:HeadTop_End');
          const v = new THREE.Vector3();
          top.getWorldPosition(v);
          probeMixer.stopAllAction();
          models[key] = { scene: g.scene, clips, scale: TARGET_H / v.y };
        }
        i++; next();
      }, undefined, () => { if (++tries < 4) setTimeout(go, 250); });
      go();
    };
    next();
  }

  function attachWeapon(g, wepName, charScale) {
    const o = WEAPONS[wepName];
    const bone = g.getObjectByName(o.hand) || g.getObjectByName(o.hand.replace('mixamorig', 'mixamorig:'));
    g.updateMatrixWorld(true);
    const ws = new THREE.Vector3(); bone.getWorldScale(ws);   // ルート0.01スケール対策
    const w = wepScenes[wepName].clone(true);
    w.scale.setScalar(1 / ws.x);
    w.rotation.set(o.rot[0] * Math.PI / 180, o.rot[1] * Math.PI / 180, o.rot[2] * Math.PI / 180);
    if (o.spin) w.rotateY(o.spin * Math.PI / 180);
    bone.add(w);
    const ud = {
      name: wepName, invScale: 1 / ws.x,
      baseQuat: w.quaternion.clone(),
      tipDir: new THREE.Vector3(0, 1, 0).applyQuaternion(w.quaternion),  // 柄→先端(ボーン空間)
      holdShift: (o.holdShift || 0) * charScale,
      slideMax: (o.slideMax || 0) * charScale,
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
    const def = KINDS[kind];
    const mdl = models[def.model];
    const g = new THREE.Group();                       // 足元原点・スケール1のGroup
    const inner = THREE.SkeletonUtils.clone(mdl.scene);
    inner.scale.setScalar(mdl.scale);
    inner.traverse(n => { if (n.isSkinnedMesh) { n.frustumCulled = false; n.castShadow = true; } });
    g.add(inner);
    const mixer = new THREE.AnimationMixer(inner);
    const acts = {};
    for (const n in mdl.clips) acts[n] = mixer.clipAction(mdl.clips[n]);
    const flash = makeFlash();
    g.add(flash);
    const sam = {
      kind, def, mixer, acts, flash, inner, scale: mdl.scale,
      cur: null, attacking: false, atkAction: null, atkBaseYaw: 0, atkDef: null,
      lastT: null, weapon: null,
    };
    g.userData.samurai = sam;
    if (def.weapon) sam.weapon = attachWeapon(g, def.weapon, mdl.scale);
    play(sam, def.idle || 'idle');
    return g;
  }

  function play(sam, name, fade) {
    if (sam.cur === name) return;
    const a = sam.acts[name]; if (!a) return;
    const f = fade == null ? 0.18 : fade;
    a.reset().fadeIn(f).play();
    if (sam.cur) {
      // フェードアウトだけだと重み0のアクションがmixerに残り評価され続ける(連打で蓄積)→完全停止
      const prevName = sam.cur, prev = sam.acts[prevName];
      prev.fadeOut(f);
      setTimeout(() => { if (sam.cur !== prevName) prev.stop(); }, f * 1000 + 60);
    }
    sam.cur = name;
  }

  function setWeapon(g, kind) {
    const sam = g.userData.samurai;
    const def = KINDS[kind];
    if (def.model !== sam.def.model) {
      // モデルが違う兵種への変更はcreateし直しが必要(呼び出し側で作り替える)
      console.warn('Samurai.setWeapon: モデル違い(' + sam.kind + '→' + kind + ')。Samurai.createで作り直してください');
      return false;
    }
    if (sam.weapon) sam.weapon.parent.remove(sam.weapon);
    sam.kind = kind; sam.def = def;
    sam.weapon = def.weapon ? attachWeapon(g, def.weapon, sam.scale) : null;
    return true;
  }

  // 任意の1発モーション(kneel/yell/throw/attack_combo等)。attackもこれ経由
  function act(g, clipName, opts) {
    const sam = g.userData.samurai;
    if (sam.attacking) return false;
    const a = sam.acts[clipName];
    if (!a) return false;
    sam.attacking = true;
    sam.atkDef = opts || {};
    a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
    a.fadeIn(0.08).play();
    if (sam.atkDef.startAt) a.time = sam.atkDef.startAt * a.getClip().duration;
    if (sam.cur) sam.acts[sam.cur].fadeOut(0.08);
    const prev = sam.cur; sam.cur = clipName;
    sam.atkAction = a;
    sam.atkBaseYaw = g.rotation.y;
    const finish = () => {
      if (!sam.attacking) return;
      sam.mixer.removeEventListener('finished', onEnd);
      sam.attacking = false; sam.cur = null;
      if (sam.weapon) {
        sam.weapon.quaternion.copy(sam.weapon.userData.baseQuat);
        sam.weapon.position.copy(sam.weapon.userData.tipDir)
          .multiplyScalar(sam.weapon.userData.holdShift * sam.weapon.userData.invScale);
      }
      sam.flash.visible = false;
      a.fadeOut(0.15);
      setTimeout(() => { if (sam.cur !== clipName) a.stop(); }, 210);
      play(sam, prev || (sam.def.idle || 'idle'));
    };
    const onEnd = e => { if (e.action === a) finish(); };
    sam.finishAtk = finish;
    sam.mixer.addEventListener('finished', onEnd);
    return true;
  }

  function attack(g) {
    const sam = g.userData.samurai;
    const def = sam.def;
    return act(g, def.attack, def.spearFx
      ? { startAt: def.startAt, cutAt: def.cutAt, slideWin: def.slideWin, spearFx: true }
      : {});
  }

  const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _vTip = new THREE.Vector3();

  function spearFx(g, sam) {
    const o = sam.atkDef;
    if (!(sam.attacking && o && o.spearFx && sam.atkAction && sam.weapon)) return;
    const dur = sam.atkAction.getClip().duration;
    const ph = sam.atkAction.time / dur;
    if (o.cutAt && ph > o.cutAt) { sam.finishAtk(); return; }   // 後半の棒立ち区間は早期終了
    let sl = 0;
    if (ph > o.slideWin[0] && ph < o.slideWin[1])
      sl = Math.sin(Math.PI * (ph - o.slideWin[0]) / (o.slideWin[1] - o.slideWin[0])) * sam.weapon.userData.slideMax;
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
    if (sl > 0.13) {
      _vTip.set(0, 0.43, 0);
      w.localToWorld(_vTip);
      sam.flash.position.copy(g.worldToLocal(_vTip));
      sam.flash.scale.setScalar(0.22 + sl * 0.5);
      sam.flash.material.opacity = Math.min(1, sl * 1.1);
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
    if (!sam.attacking) play(sam, walking ? (sam.def.walk || 'walk') : (sam.def.idle || 'idle'));
    sam.mixer.update(dt);
    spearFx(g, sam);
  }

  return { load, create, animate, attack, act, setWeapon,
           KIND_NAMES: Object.keys(KINDS) };
})();
