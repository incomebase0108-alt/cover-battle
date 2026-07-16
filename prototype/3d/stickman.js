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
