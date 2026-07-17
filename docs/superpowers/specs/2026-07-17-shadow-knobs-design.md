# 影ノブ4段（OFF/丸影/低/高） 設計書

作成: 2026-07-17（4号機 INCOMEBASE04）。分担: 影ノブ実験=4号機（1号機提案・星野さん承認）

## 目的

影の負荷（実測 -12fps）の軽量化候補を、スマホ実機で**同条件で測り比べられる**ようにする。
本番採用の判断材料（画質と fps のトレードオフ）を作る。

## 成功基準

- `影` ボタンが `OFF → 丸影 → 低 → 高` の4段サイクルになり、各段の fps をスマホで実測できる
- 丸影: shadowMap 無効のままキャラ8体の足元に半透明の丸グラデが出て、キャラに追従する
- 低: shadowMap 1024²・影範囲がプレイヤー周辺（正射影 半径25）に絞られ、プレイヤーに追従する
- 高: 従来の影ON（2048²・街全域）と同一
- 段切替ごとに fpsResetMin。既存機能（キャラトグル・攻撃・密度・アニメ）は無傷

## 変更ファイル

| ファイル | 変更 |
|---|---|
| `prototype/3d/proto-viewer.js` | `setShadow(on)` を `setShadowMode(mode)`（'off'\|'blob'\|'low'\|'high'）に置き換え。shadowMap 解像度・影カメラ範囲の切替と、`updateShadowTarget(x,z)`（低モードの追従用）を追加。旧 `setShadow` は削除（呼び出し元は main.js のみ） |
| `prototype/3d/main.js` | btnShadow を4段サイクルに配線。blob の生成/追従/除去。低モードでループ内 `updateShadowTarget(player.x, player.z)` |

samurai.js・stickman.js ほか他ファイルは無改変。

## 各段の仕様

- **off**: `renderer.shadowMap.enabled=false`・`sun.castShadow=false`・blob 非表示（初期状態。ボタンラベル「影:OFF」）
- **blob**: shadowMap は off のまま。各ユニットの足元に `PlaneGeometry(1.4,1.4)` を X-90°回転・y=0.02 で配置。
  マテリアルは放射グラデの CanvasTexture（中心 rgba(0,0,0,.42)→外周0）×共有1枚・transparent・depthWrite:false。
  **共有リソースなので棒人間 dispose の traverse に巻き込まれないよう `userData._blob=1` を付け、disposeUnit で skip**。
  blob Mesh はユニット mesh の子（`u.mesh.add(blob)`）にして追従を無料にする。ラベル「影:丸影」
- **low**: `shadowMap.enabled=true`・`mapSize 1024²`・影カメラ left/right/top/bottom=±25・
  `sun.target` をプレイヤー位置に毎フレーム追従（sun.position も相対オフセット +120,180,+80 を保つ）。ラベル「影:低」
- **high**: `shadowMap.enabled=true`・`mapSize 2048²`・影カメラ=街全域（従来 showCity が設定する bounds.r×1.2）。ラベル「影:高」

実装メモ:
- mapSize 変更は生成済み shadow map の作り直しが要る → `sun.shadow.map.dispose(); sun.shadow.map=null;` してから mapSize を set
- shadowMap.enabled 切替時は従来どおり `material.needsUpdate` を全 traverse（既存 setShadow の手法を踏襲）
- showCity（密度切替）は影カメラを bounds で設定し直すので、low モード中に密度を変えたら low の範囲設定を再適用する

## 検証

- ヘッドレス（server 経由・rAF パッチ）: 4段サイクルを一周し、各段で
  `{label, enabled: renderer.shadowMap.enabled, mapSize: sun.shadow.mapSize.x, blobs: シーン内の_blob数}` を log。
  期待: OFF{false,-,0}→丸影{false,-,8}→低{true,1024,0}→高{true,2048,0}→OFF。Uncaught なし。
  キャラトグル（棒人間↔侍）と密度切替を丸影/低モードで跨いでもエラーなし・blob 数が 8 のまま
- 本人実走 → スマホで4段実測（侍モード）

## やらないこと（YAGNI）

- 影の品質調整（bias・PCF種別の変更）、ボット個別の影範囲、blob の濃度/サイズのUI化
- 本体（js/・server.js）の変更・自動テスト
