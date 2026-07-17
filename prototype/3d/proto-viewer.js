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
    renderer.outputEncoding = THREE.sRGBEncoding; // r128既定はGLBテクスチャが暗く出る(1号機知見)
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
    // 単位ジオメトリ(boxGeo等)はモジュール内の共有シングルトンなのでdisposeしない
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
