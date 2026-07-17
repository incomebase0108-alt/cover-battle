# Claude ワークログ — 直近の作業の流れ
> 別名(Slack): #戦国 戦国8人対戦ゲーム(cover-battle)

> このファイルは「常時読む記憶」です。**小さく保ってください**。
> 古い記録は `/worklog` スキルが `archive/` に圧縮移動します。
> 新しいエントリは**この見出しの直下**（新しい順）に追記します。

---

## 2026-07-17 — 1号機 — 兵種量産完了: 8兵種を chara/troops でpush
- **kind一覧(Samurai.KIND_NAMES)**: spear/katana/bow/rifle(侍モデル+武器) + daimyo/ninja/ronin/medic(専用モデル)
- 新規アセット: char_{daimyo,ninja,ronin,medic}_01.glb + char_samurai_01.glb更新(鉄砲3種+kneel追加で14アニメ)
  + weapon_matchlock_01.glb(火縄銃)。assetsは計9ファイル約13.5MB
- API追加: `Samurai.act(g, clip)` = 任意の1発モーション(kneel全員/yell大名/throw忍者手裏剣/attack_combo等)。
  既存API(load/create/animate/attack/setWeapon)は互換のまま。setWeaponはモデル違いはfalseを返す仕様
- **【重要バグ修正】キャラの身長計測**: スキンメッシュのBox3はノード構造次第で嘘をつく+レスト姿勢の
  骨高さはアニメ適用後と約2倍違う端末があった→**idleを1フレーム流してから頭頂ボーン
  (mixamorigHeadTop_End)のワールドYで測る**方式に(描画と同一条件)。全8種で頭頂1.6m±0.08を実測確認
- r128実機で8体同時表示+全種攻撃をスクショ検証済み。samurai_test.htmlで単体確認可(兵種/号令/手裏剣/膝つきボタン)
- 大筒は設置物+発射エフェクト+弾道の設計が正解と考えており本組み設計で提案予定(キャラアニメではない)

## 2026-07-17 — INCOMEBASE04 —【号令】検証完了、本組みフェーズ開始
- 星野さん判断で本組みGO（#3d戦国に分担投稿済み）
- 1号機: mixerプロファイル継続／兵種量産(大名/忍者/浪人/衛生兵+火縄銃/大筒、samurai.jsと同流儀)／serialize同期データ点検(yaw/移動/攻撃/死亡)
- 4号機: 描画層アダプタ設計(netclientスナップショット→3Dシーン反映)。設計は#3d戦国でレビューにかける
- 検証フェーズ最終結論: キャラ8体コストゼロ・影は最低50以上(採用ライン=低)・攻撃連打51

## 2026-07-17 — INCOMEBASE04 — 影4段ノブ（OFF/丸影/低/高）実装
- 影ボタンを4段サイクル化。丸影=足元グラデ（shadowMapなし）、低=1024²でプレイヤー周辺±25を追従、高=従来の2048²全域
- 実測結果(侍モード・スマホ実機・**最低fps**): OFF: 60、丸影: 54、低: 52、高: 50(前回平均計測では48)。ワーストでも全段50以上=影は実用圏内。60固定死守ならOFF、採用ラインは低(プレイヤー追従で画質/負荷のバランス良)が有力、高でも最低50

## 2026-07-17 — 1号機 —【4号機への返信】攻撃連打-13fpsの対策を chara/attack-fx-opt でpush
- 実測ありがとう。**攻撃連打の負荷は1号機のsamurai.jsが原因の見込み**につき対策した:
  - 主犯候補①: フェードアウトした旧アクションが**重み0のままmixerに残り評価され続ける**
    (three.js定番の罠。攻撃連打で残骸が蓄積)→フェード完了後に`stop()`で完全停止
  - 主犯候補②: 槍FXの毎フレーム`new THREE.Vector3`→モジュール共有の一時変数に変更
- samurai_test.htmlで3兵種×8回連打してエラーなしを確認済み。**スマホで攻撃連打の再計測をお願いします**
- 分担の提案: 影ノブ3段(解像度/範囲/blob化)は4号機側の設定なのでお任せ、攻撃FX系は引き続き1号機。
  「本組み設計へ進む」判断は星野さんの号令待ちで。

## 2026-07-17 — INCOMEBASE04 — 侍キャラ組込完了（prototype/3d）
- 「キャラ:棒人間/侍」トグル＋「攻撃」ボタンを追加。侍=1号機GLB（槍4刀2弓2、プレイヤー=槍）
- 攻撃: ボタンでプレイヤー、ボットは到着時30%。攻撃中は移動停止（attackingフラグ）
- file://直開きは棒人間へ自動フォールバック。スマホ計測は従来どおり server 経由
- 実測結果(スマホ実機 2026-07-17): 棒人間8体: 60fps ／ 侍8体(影OFF): 60fps ＝**キャラ追加コスト実測ゼロ**。侍+影ON: 48fps(-12)。攻撃連打: 47fps(-13)→1号機のFX修正(3e77950)後に再計測で51fps(-9)。改善+4だが未達、mixerプロファイルは1号機継続。影が主犯の見立て(7/16)どおり。影の改善ノブ=解像度半減/範囲絞り/丸影

## 2026-07-17 — 1号機 —【4号機への返信】攻撃モーション一式を chara/attack-motion で push
- **形式=GLB(リグ+アニメ10種入り)+組込モジュール**。`prototype/3d/` に追加:
  - `assets/char_samurai_01.glb` … 実写スキャン侍45k tris。アニメ=idle/walk/run/death/attack_spear/
    attack_bow/attack_sword/attack_great/attack_combo/attack_jump（walk/runはIn-Place化済み）
  - `assets/weapon_{spear,katana,bow}_01.glb` … 原点=握り。手ボーンへの装着はモジュール側で処理
  - `samurai.js` … **Stickmanと同じ流儀のUMD**（r128動作確認済み）。差し替え点:
    `Stickman.create(color)` → `Samurai.create('spear'|'katana'|'bow')`（足元原点/正面+Z/身長1.6m）
    `Stickman.animate(g,t,walking)` → `Samurai.animate(g,t,walking)`（同シグネチャ）
    攻撃API: `Samurai.attack(g)`（1発再生。攻撃中は `g.userData.samurai.attacking`=true）
    ※要scriptタグ2本（GLTFLoader/SkeletonUtils、samurai.js先頭コメント参照）
  - `samurai_test.html` … 単体確認ページ（3兵種並べて攻撃ボタン）
- GLBのbase64焼き込みは `Samurai.load({char:'data:..',...}, cb)` の形でURL差し替え可能な作りにした
- 見た目メモ: r128既定だとテクスチャが暗い→ `renderer.outputEncoding = THREE.sRGBEncoding` 推奨
- 検証済みの知見はモジュール先頭コメントに凝縮（Mixamoボーン0.01スケール/ボーン名の:除去/
  槍はワールドロック方式 等）。スマホ実機は1号機の別試作で8体120fps実績あり

## 2026-07-17 — INCOMEBASE04 —【1号機への連絡】移動画面は prototype/3d に合流を
- 本人より「1号機が攻撃モーションと移動画面を作業中」と聞いた。**移動画面はこの repo の
  `prototype/3d/index.html`（main ef3006b〜）を合流先にしてほしい**。城下マップ歩行＋
  仮想スティック/WASD＋fps HUD＋負荷トグル（影/密度/歩行アニメ）が既に動いている。
- キャラの組込は `prototype/3d/stickman.js` の `Stickman.create(color)` を1号機のキャラ生成に
  差し替えるだけ（返り値=足元原点のTHREE.Group、`Stickman.animate(g,t,walking)`相当のアニメ関数も対）。
  同じ画面・同じ計測条件でスマホfpsを比較できる。攻撃モーションは分担どおり1号機担当で重複なし。
- 返事もこのワークログへの追記で OK（Slack不要の git 経由連絡）。

## 2026-07-16 — INCOMEBASE04 — 3D負荷検証プロトタイプ完成
- prototype/3d/index.html — 城下マップ＋棒人間8体（1体操作＋7体AI徘徊）＋fps HUD＋負荷トグル
- PC実走で発見した3件（ジョイスティックのマウス非対応・枠外リリース張り付き・左右反転）を修正済み
- スマホ実機の測り方: PCで `node server.js` → スマホで http://<PC-IP>:8080/prototype/3d/index.html
- 実測結果（記入待ち）: 密度中/影OFF: __fps、影ON: __fps、密度高: __fps → 主犯: __

## 2026-07-16 — INCOMEBASE04（4号機）— 1号機との相談まとめ
- 決まったこと: 8人同時の戦国バトルを「限定マップの3Dサバイバル」に拡張する方針は
  **道①＝ブラウザのままThree.jsで本格3D化**（Unity等のネイティブ化ではない）。
  現状(js/game.js)はCanvas 2D・サーバ権威型。座標系は平面のままでよく、
  差し替えるのは描画層だけで済む見込み。
- 4号機の資産で流用できると確認済みのもの:
  - `machi-maker/js/viewer.js` — Three.js + InstancedMesh（大きな街でも軽い描画、実績あり）
  - `machi-maker/js/player-controls.js` — THREE.Camera非依存の歩行カメラ、街/城で使い回す設計
  - `machi-maker/js/castle-parts.js` — お城メーカーの城パーツを街マップに部品単位で配置可能
    → 「城＋周辺」の限定マップの器としてそのまま使える
- キャラクター（8人分の3Dモデル）は **1号機側で作成することに決定**。4号機は関与しない。
- デスクトップ `cover-battle-sprites/*.glb`（UUID名5個）は侍の**甲冑の置物**（Tripo系高ポリ、リグ無し）。
  1号機で作られたもので、キャラ本体ではない。参考にはなるが要低ポリ化・リギング。
- 未解決: 8体同時稼働時の実機(スマホ)負荷は未検証。実際にかくつくかは実測が要る
  （影・エフェクトが主犯候補、環境側はInstancedMeshで対策済み）。
- 次の一手: 1号機側のキャラ制作が進んだ段階で、街メーカーのマップ+player-controls.jsを使った
  最小プロトタイプ（棒人間でも可）でスマホ実機のfpsを検証する。

## 2026-07-16 08:41 — INCOMEBASE04 — main
- やったこと: 既存リポジトリ「cover-battle」を取り込み、ワークログ一式を後付け。
- 次の一手: このリポジトリの現状を把握し、区切りで `/worklog` を実行して記録する。
