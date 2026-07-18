// input3d.js — 3Dプレイヤー視点(TPS)の入力変換。テスト: tests/input3d.test.js
//
// 画面基準のスティック/WASD入力 (dx: 右が+, dy: 下が+) を、カメラの向き camYaw に応じて
// ゲームのワールド座標 (mx, my) へ回す。サーバが受け取るのは従来どおりワールド絶対値なので、
// ここを挟むだけで server.js / game.js は無改修のまま3D操作が成立する。
//
// 【符号の決め方】画面右は目分量でなく **前方 × 上** で求める(過去3回反転させた箇所)。
//   前方 fwd = (sin yaw, cos yaw)                … render3d.js の updateCamera と同じ向き
//   右   right = fwd × up = (-cos yaw, sin yaw)  … up=(0,1,0)
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Input3D = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 画面基準の入力 → ワールドの移動ベクトル
  function moveToWorld(dx, dy, camYaw) {
    const s = Math.sin(camYaw), c = Math.cos(camYaw);
    const fwd = -dy;                    // 画面上(dy=-1)が前進
    return {
      mx: -c * dx + s * fwd,
      my: s * dx + c * fwd,
    };
  }

  // 画面中央のクロスヘア＝カメラの正面を狙う。描画側の yawOf と往復で一致する
  function aimFromCamera(camYaw) {
    return Math.atan2(Math.cos(camYaw), Math.sin(camYaw));
  }

  return { moveToWorld, aimFromCamera };
});
