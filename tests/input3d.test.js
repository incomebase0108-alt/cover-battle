// 3Dプレイヤー視点(TPS)の入力変換。画面基準のスティック入力を、カメラの向きに応じて
// ワールド座標の移動ベクトル(mx,my)へ変換する。サーバが受け取るのは従来どおり
// ワールド絶対値なので、ここさえ正しければ server.js / game.js は無改修で足りる。
//
// 座標系: ゲーム2D(x右, y下) ←→ 3D(x, z)。z が game y に対応(render3d.js の S 写像)。
// カメラは focus から (sin yaw, cos yaw) の向きを見ている(render3d.js の updateCamera)。
// 【重要】画面右は **前方 × 上** で求める。目分量で符号を決めて3回反転させた前科がある。

const Input3D = require("../js/net/input3d");
const { suite } = require("./assert");

const s = suite();
const near = (t, got, want, msg) => t.lessThan(Math.abs(got - want), 1e-9, msg);

s.test("カメラyaw=0: 前入力はカメラから遠ざかる向き(ワールド+y)へ進む", (t) => {
  const { mx, my } = Input3D.moveToWorld(0, -1, 0); // dx=0, dy=-1(画面上=前), yaw=0
  near(t, mx, 0, "左右のズレなし");
  near(t, my, 1, "ワールド+y(カメラの奥)へ進む");
});

s.test("カメラyaw=0: 右入力は画面右=前方×上=ワールド-xへ進む", (t) => {
  const { mx, my } = Input3D.moveToWorld(1, 0, 0); // dx=1(右)
  near(t, mx, -1, "画面右はワールド-x(前方×上の向き)");
  near(t, my, 0, "前後のズレなし");
});

s.test("カメラを90度回すと、前入力の行き先もワールドで90度回る", (t) => {
  const { mx, my } = Input3D.moveToWorld(0, -1, Math.PI / 2);
  near(t, mx, 1, "yaw=90度では前方がワールド+x");
  near(t, my, 0, "y成分は消える");
});

s.test("カメラを回しても入力の長さは変わらない(回転だけで伸び縮みしない)", (t) => {
  const d = Math.SQRT1_2; // 斜め入力(長さ1)
  for (const yaw of [0, 0.7, 2.1, -1.3, Math.PI]) {
    const { mx, my } = Input3D.moveToWorld(d, -d, yaw);
    near(t, Math.hypot(mx, my), 1, `yaw=${yaw} で長さ1が保たれる`);
  }
});

s.test("入力ゼロはワールドでもゼロ(勝手に動き出さない)", (t) => {
  const { mx, my } = Input3D.moveToWorld(0, 0, 1.234);
  near(t, mx, 0, "mx=0");
  near(t, my, 0, "my=0");
});

s.test("画面中央の照準は、描画側のyaw写像を通すとカメラの向きへ戻る", (t) => {
  // render3d.js の yawOf と往復で一致すること＝キャラが向く方向とカメラの向きが揃う
  const yawOf = (a) => Math.atan2(Math.cos(a), Math.sin(a));
  for (const yaw of [0, 0.6, -2.4, 3.0]) {
    const aim = Input3D.aimFromCamera(yaw);
    const back = yawOf(aim);
    near(t, Math.atan2(Math.sin(back - yaw), Math.cos(back - yaw)), 0,
      `yaw=${yaw} が往復で一致する`);
  }
});

s.test("照準は移動入力に影響されない(常にカメラの正面を狙う)", (t) => {
  const a1 = Input3D.aimFromCamera(0.9);
  const a2 = Input3D.aimFromCamera(0.9);
  near(t, a1, a2, "同じカメラ向きなら同じ照準");
});

module.exports = s;
