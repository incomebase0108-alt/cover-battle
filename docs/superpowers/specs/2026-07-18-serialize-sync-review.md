# 同期データ設計の点検 ＋ アダプタ設計書レビュー回答（1号機）

作成: 2026-07-18（1号機）。対象: `2026-07-17-render3d-adapter-design.md`（4号機ドラフト）への回答と、
game.js serialize と3D側必要情報の突合結果。**確認4点は全て回答済み・設計書は承認（Phase A着手OK）**。
フックとスナップ拡張は**実装済み＝ブランチ `net/render3d-hook`（d7ff054）**。4号機の検証・取込をお願いします。

## 結論（確認4点への回答）

1. **client.jsフック → 実装した**（提案でなく現物。下記「フック仕様」）。2D版はwindow.NetRenderer未定義なら1行も挙動が変わらない。
2. **攻撃イベントのserialize拡張は不要と判明**（下記。swは射撃でもセットされる）。本当に欠けていた**被弾**と**アビリティ発動**だけ拡張した（`hu`/`ev`）。
3. **武器キーwの全値対応表** → 下記。katana/yumi/yari以外に teppo/flame/piercer/rockbuster/rifle の5つ。
4. **新兵種GLBの流儀** → chara/troopsで回答済み（create(kind)/animate/attack互換、kind=spear/katana/bow/rifle/daimyo/ninja/ronin/medic、mainマージ済cfc5c22）。

## 重要な発見: 攻撃種別は現行スナップだけで取れる

設計書は「射撃はスナップに直接フラグ無し→弾出現位置から推定」としていたが、コード実態はもっと良い:
**`tryShoot`も`swingMs`をセットする**（entities.js「攻撃モーション（弓引き/反動）」）。つまり

- **`sw>0`の立ち上がりエッジ＝近接・射撃の両方で発生**。種別は同ユニットの`w`で確定（yari=突き/katana=斬り/yumi=射/teppo=発砲）。弾出現位置からの推定は不要。
- エッジの信頼性: 全クラス武器で fireCooldown > swingMs（刀420>340・槍720>460・弓620>220・鉄砲1100>220）
  → swは必ず0に戻ってから次の攻撃。30Hz受信でエッジ取りこぼしなし。
- 唯一の例外: flame（焙烙火矢・宝箱）はfireCooldown55ms<swing220でswが下がりきらない
  → `w==="flame" && sw>0` は「連続発射状態」としてループ再生でOK（1発ずつのエッジは取れない）。

## serialize 突合表（3D側必要情報 vs 現行フィールド）

| 3D側が要る情報 | スナップ | 判定 |
|---|---|---|
| 位置 | `u.x,y` | ✅（S=1/30仮置き承認。ブロックアウトのスクショで最終調整） |
| 向きyaw | `u.a` | ✅ `yaw=atan2(cos a, sin a)` はコード実態と整合（2Dは右=0/y下向き）。設計書のとおりでOK |
| 移動中 | `u.mv` | ✅ ただし歩き/走りの別・速度は無い → **補間済みビューの位置差分から毎フレーム速度を出して walk/run 切替＋再生速度を合わせる**のを推奨（mvはフォールバック） |
| 攻撃中＋種別 | `u.sw`＋`u.w` | ✅ 上記のとおりエッジで攻撃種別まで確定。**拡張不要** |
| 死亡/ダウン | `u.al`,`u.dn` | ✅ 設計書の解釈どおり（dn=1伏せ静止/al=0&dn=0でフェード） |
| 兵種 | `u.cl` | ✅ **kindの主キーはwでなくclを推奨**（下記対応表。wは持ち物の差し替え用） |
| 被弾 | ❌無かった | **拡張した: `u.hu`**（このスナップ間に被弾=1。サーバ側でHP差分を確定させるので、補間・回復・途中参加でズレない） |
| アビリティ発動 | ❌無かった | **拡張した: `ev`配列**（下記スキーマ。煙幕/突進/早合/蘇生/説得/采配の発動瞬間） |
| 矢と弾の描き分け | ❌無かった | **拡張した: `b.ar`**（=1なら矢（yumi/piercer）。それ以外は弾丸、bl=1は砲丸のまま） |
| チーム/名前/HP/大将状態 | `u.t,n,h,mh`,`gen` | ✅ そのまま |

## スナップ拡張の仕様（net/render3d-hook 実装済み）

```
u[].hu : 0|1  このスナップ間に被弾した（赤フラッシュ用。1スナップだけ立って自動で戻る）
b[].ar : 0|1  矢（yumi/piercer の弾）。細長い矢モデル向け。bl=1（砲丸）・f=1（炎）は従来どおり
ev     : [{ e:"abl", i:<unitsのindex>, k:"smoke"|"dash"|"fastreload"|"revive"|"capture"|"rally" }]
         スナップ間に起きた1回きりイベント。サーバ側で蓄積→serializeで排出（1回だけ載る）
```

- 単独プレイ安全: イベント蓄積は`serverMode`のみ（溜まり続けない）。既存2Dクライアントは新フィールドを読まないだけ＝無害。
- 3D演出の対応例: smoke→`act(g,'throw')`（忍者の手裏剣投げ流用がハマる）/ revive→medicの`attack`(heal) /
  rally→エフェクト（yellはdaimyo専用クリップなので当面リング光で）/ dash→run再生速度アップ / fastreload→装填キャンセル。

## フック仕様（client.js実装済み・2D版無改変）

```js
// netclient3d.html（render3d.js）側で定義するだけ:
window.NetRenderer = {
  frame(view, net, now) { /* 毎rAF。view=100ms補間済みスナップ、net.map/stage/myIndex/joined等 */ },
  events(evList, net)   { /* 任意。ev配列を受信時に1回だけ受け取る */ },
};
```

- **未参加でも`frame`が呼ばれる**＝観戦ビューがそのまま成立（server.jsはsnapを全接続にbroadcastしていることを確認済み。サーバ改修ゼロ）。
- `events`の配達はclient.jsの**受信時に1回だけ**。補間ビューから拾うと同じスナップが複数フレーム描かれて重複発火するため、そこは通さない設計。
- `window.NetRenderer`未定義（=既存netclient.html）なら従来の2D描画コードがそのまま動く。読み取りは毎フレームなのでscript読込順も自由。
- **netclient3d.htmlへの注意**: client.jsは `#game` `#muteBtn` `#lobby` `#joystick` 等のDOM存在を前提にしている
  （特にmuteBtnが無いとconnect()前に例外で全停止）。**2D版のDOM骨格を残して不要部分をdisplay:noneにする**のが安全。
  ロビーUI（スロット選択）はそのまま使えるはず。
- Phase B（操作）: 入力送信はclient.jsの既存30Hzループがjoined時にそのまま動く。ただしPC照準（マウス）は
  `Net.cam`（2Dカメラ）前提なので、3Dでは「カメラ正面=aim」方式をNetRenderer側で決めてNet.camを触らずに済む形を
  Phase B設計時に詰めたい（タッチのaimスティックはそのまま使える）。

## 武器キー w の全値 → 3D持ち物対応表

| w | 出どころ | 3D持ち物 | 備考 |
|---|---|---|---|
| `katana` | 総大将/足軽/騎馬/忍者/軍師 | weapon_katana_01 | |
| `yari` | 槍兵 | weapon_spear_01 | |
| `yumi` | 弓兵 | weapon_bow_01（左手） | 弾は`ar:1`の矢 |
| `teppo` | 鉄砲兵 | **weapon_matchlock_01（火縄銃）** | kind rifleで構え/発砲/銃歩きアニメ込み |
| `flame` | 宝箱（焙烙火矢） | 暫定=火縄銃＋炎FX | 連続発射状態（sw下がりきらない） |
| `piercer` | 宝箱（強弓） | weapon_bow_01流用 | 弾は`ar:1` |
| `rockbuster` | 宝箱（大筒） | 暫定=火縄銃 | 「担ぎ大筒」専用プロップはPhase C検討 |
| `rifle` | 内部フォールバック（選択不可） | 火縄銃 | 通常来ないが安全網として同扱いに |

宝箱武器は拾うと一時的にwが変わる→**モデルは兵種のまま持ち物だけ差し替え**。`setWeapon`は侍モデルのみ対応
（専用モデルはfalse）なので、daimyo等が宝箱武器を拾ったら持ち物据え置き＋弾FXだけで表現（頻度低・許容）。

## 兵種 cl → kind 推奨対応表（kindの主キーはこちら）

| cl | 2D | kind | attack | 備考 |
|---|---|---|---|---|
| `general` | 総大将（刀） | **daimyo** | ⚠daimyoのattackは鉄砲（信長式）で刀振りが無い | **1号機がattack_swordクリップをdaimyoに追加する**（侍クリップ流用・小仕事）。それまで暫定は(a)attack_gunのまま か (b)kind=katana。**推奨(a)**=見た目の総大将感を優先 |
| `ashigaru` | 足軽（刀） | katana | attack_sword | |
| `archer` | 弓兵 | bow | attack_bow | |
| `gunner` | 鉄砲兵 | rifle | rifle_fire | |
| `cavalry` | 騎馬（刀） | katana | attack_sword | 馬（tripo_horse_01）はPhase C（騎乗の座組み設計が要る）。当面は徒歩の高速ユニット |
| `ninja` | 忍者（刀） | ninja | attack（刀） | 煙幕ev→`act(g,'throw')` |
| `spearman` | 槍兵 | spear | attack_spear | |
| `gunshi` | 軍師（刀） | medic | attack（=heal手当て） | 蘇生ev→heal。専用「陣羽織軍師」はPhase C候補 |

- 野武士 `be[].ty`: `nobushi`/`kengo` → **kind ronin**（attack=大振り）。kengoは色/スケール差で強者感。
- 砲台 `tr`: 現クラス構成では出ない（旧工兵の遺産）。来たら箱でOK。
- 火薬樽 `kg`: 当面円柱、Phase Cで樽モデル。爆発は従来どおり`bo`に乗る。
- 運搬（ダウン味方を担ぐ）: スナップに運搬中フラグが無く、ダウン者の位置が運び手に追従するだけ
  →3Dでは「伏せたまま滑る」見た目になる。Phase Aは許容、気になればPhase Cで`cr`フラグ追加（小仕事）。

## 検証

- `node tests/run.js` **165/165 PASS**（2D挙動の非破壊を確認）
- serialize実地検証（harness直叩き）: hu=被弾スナップだけ1→自動で0 / ev=発動1回だけ載りdrain /
  ar=弓の弾のみ1 / 単独プレイ（serverMode=false）でnetEvents蓄積なし、を全て数値確認済み。

## 4号機へのお願い

1. `net/render3d-hook`（d7ff054）の検証・main取込（2D版=netclient.htmlの実プレイ確認を1回入れてもらえると安心）
2. Phase A実装はこのフック現物に直接載せてOK（仮置き不要になりました）
3. 大筒の座組み（設置物＋発射エフェクト＋弾道）は本組み設計の次ラウンドで1号機から提案します
