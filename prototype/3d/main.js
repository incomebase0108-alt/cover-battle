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
