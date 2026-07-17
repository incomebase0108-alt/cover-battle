# 侍キャラ組込（prototype/3d × chara/attack-motion） 設計書

作成: 2026-07-17（4号機 INCOMEBASE04）

## 目的

1号機制作の侍GLB（リグ+アニメ10種・45k tris）と攻撃モーションを fps 検証プロトタイプに組み込み、
**本物のキャラ8体＋攻撃モーション再生時のスマホ実機 fps** を測れるようにする。

## 成功基準

- 「キャラ:棒人間/侍」トグルで両者を切り替えて fps を比較できる（キャラ自体の負荷を単独で測れる）
- 「攻撃」ボタンで操作キャラが攻撃を1発再生し、ボットも時々攻撃する（攻撃中の fps が測れる）
- file:// 直開きでは棒人間に自動フォールバックして従来機能が全部生きる

## 方針（承認済みの選択）

| 論点 | 決定 |
|---|---|
| 組込方式 | 棒人間↔侍のトグル追加（完全置換はしない。キャラ負荷の切り分け手段を残す） |
| GLB読込 | HTTP相対URL（`Samurai.load('assets/', cb)`）。base64焼き込みはしない（HTML+4.5MB肥大はスマホ計測の邪魔） |
| ベース | `chara/attack-motion` を main に取り込んだ作業ブランチ `proto/3d-samurai` |

## 変更ファイル

| ファイル | 変更 |
|---|---|
| `prototype/3d/index.html` | script タグ3本追加（GLTFLoader・SkeletonUtils=unpkg r128、samurai.js）。トグル列に `#btnChar`「キャラ:棒人間」、右下（ジョイスティックの反対側）に `#btnAttack`「攻撃」を追加 |
| `prototype/3d/main.js` | 下記の組込ロジック |
| `prototype/3d/proto-viewer.js` | `renderer.outputEncoding = THREE.sRGBEncoding` を init に1行追加（1号機推奨・テクスチャ暗化対策） |

samurai.js・GLB・samurai_test.html は1号機成果物（無改変）。

## main.js の組込ロジック

- **ロード**: 起動時に `Samurai.load('assets/', cb)` を試行。成功→`#btnChar` 有効化。
  失敗（file://直開き・404等）→棒人間のまま、`#btnChar` を「キャラ:棒人間(GLB未読込)」表示で disabled（console にエラーを出す。握りつぶさない）
- **モード**: `charMode: 'stick' | 'samurai'`。`spawnUnits()` がモードで生成を分岐:
  - 棒人間 = `Stickman.create(color)`（従来どおり青4赤4）
  - 侍 = `Samurai.create(kind)`、配分は槍4・刀2・弓2（プレイヤーは槍）。チーム色分けは今回なし（GLBは1種）
- **アニメ**: `Samurai.animate` は `Stickman.animate` と同シグネチャなので、ループ内はモードで関数を呼び分けるだけ
- **dispose の逆ルール**（重要）: 棒人間=毎体 geo/mat を dispose（現行実装）。
  侍=SkeletonUtils クローンで**リソース共有のため `scene.remove` のみ**（dispose すると他個体が壊れる）。モードで分岐し、理由をコメントに書く
- **攻撃**: `#btnAttack` → `Samurai.attack(player.mesh)`。`g.userData.samurai.attacking` 中は movePlayer を停止。
  ボットは目標到着時に確率30%で `Samurai.attack`（侍モード時のみ）。棒人間モードでは `#btnAttack` を disabled
- **fps計測**: キャラトグル・攻撃ボタンも `fpsResetMin()` 対象（条件が変わったら最低値を取り直す）

## 検証

1. `samurai_test.html` を server 経由で開き単体確認（3兵種表示・攻撃再生）
2. headless 検証は `node server.js` を立てて `http://localhost:8080/prototype/3d/index.html` 経由
   （GLBがXHRで読める。既存の rAF モンキーパッチ手法を継続使用）:
   - 侍モードで8体表示・攻撃で attacking フラグが立ち自動復帰・トグル往復で geometries リーク無し
   - file:// で開くとフォールバック（棒人間＋btnChar disabled）
3. 本人のPC実走 → スマホ実機再計測（棒人間 vs 侍、攻撃連打、影ON、密度高）

## やらないこと（YAGNI）

- チーム色分け・武器持ち替えUI（`setWeapon` 不使用）・run アニメの活用・攻撃の当たり判定
- 本体（js/・server.js）の変更
- 自動テスト（従来どおり headless + Node スモークで代替）
