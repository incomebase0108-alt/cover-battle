# Cover Battle — テスト

ブラウザゲーム「Cover Battle」の純粋ロジックを Node で検証する自前完結のテスト群です。
DOM / Canvas / 入力などのブラウザ依存はスタブ化し、`js/*.js` をそのまま読み込んで
ゲームのコアロジック（マガジン、砦回復、地形、森ステルス、勝敗、岩破壊）を検証します。

> 注意: テストは `js/` 以下のソースを**読み取るだけ**で、いっさい変更しません。

## 実行方法

```bash
node tests/run.js
```

- 各テストの PASS / FAIL を 1 行ずつ表示し、最後にファイル数・テスト数・成功/失敗数を集計します。
- 1 つでも失敗すると `RESULT: FAIL` を表示して **終了コード 1** で終了します。全部成功なら **終了コード 0**。

個別ファイル単体でも `require` 可能です（`run.js` がまとめて実行します）。

## 仕組み（harness.js）

ゲームは plain `<script>` グローバル方式のため、Node では `vm` サンドボックスを作成し、
`window` / `document` / `requestAnimationFrame` / Canvas 2D コンテキストをスタブして、
依存順 `vector → config → weapons → input → map → entities → ai → game` で読み込みます。

`vm` コンテキスト内の `const` / `class` / `function` 宣言は字句束縛になりサンドボックス
オブジェクトのプロパティにならないため、読み込み後に既知のグローバル（`Game` `Unit`
`CONFIG` `V` `STAGES` `Bullet` `Bomb` `Item` `GameMap` `WEAPONS` など）を `globalThis`
へ反映する小スニペットを同コンテキストで実行し、テストから参照できるようにしています。

- `harness.loadGame()` — 全グローバルを載せた新しいサンドボックスを返す（毎回独立）。
- `harness.newGame(index=0)` — 上記に加え、ステージ `index` を読み込んだ `Game` と、
  `onEnd` の結果を捕捉する `ended` を返す。
- `assert.js` — 依存なしの最小アサート（`ok` / `equal` / `close` / `lessThan` /
  `greaterThan`）と `suite()`。失敗時はメッセージ付きで throw し、`run.js` が集計します。

## テスト概要

| ファイル | 検証内容 |
| --- | --- |
| `magazine.test.js` | マガジン/リロード: `magSize` 発で `reloading=true`・`ammo=0`、`reloadTime` 経過で補充。リロード中は撃てない。`fireCooldown` で連射が抑止される。 |
| `base.test.js` | 砦回復: 自陣 base 内で `regenPerSec`/秒の回復、`maxHp` で上限、敵陣 base・base 外では回復しない。`inBase` の判定。 |
| `terrain.test.js` | 川減速（`riverSpeedMul` 通りの移動量）、山の遮蔽（`blockedBetween`）、開けた場所は非遮蔽、弾が山で消滅。 |
| `stealth.test.js` | 森ステルス: 森内の敵は近くに味方が居なければ不可視、`forestDetectRange` 内に味方が居れば可視、自分/味方は常に可視、死亡した味方は発見できない。 |
| `outcome.test.js` | 勝敗判定: 全敵死亡で勝ち、全味方死亡で負け（`onEnd`）。生存中は終了しない。`hasNext` とステージ index、`aliveCount`。 |
| `combat.test.js` | 岩破壊: 弾は `bullet.rockDamage`、爆弾は `bomb.rockDamage`、hp 0 で消滅。`shatterRock` / `dropFromRock` / `damageRocksInRadius` のアイテム生成と除去。爆弾はユニットにもダメージ。 |

## 既知の懸念点（テストで判明、ソースは未修正）

- なし（現状すべてのテストがパス）。検証中に見つけたソース側の挙動はいずれも仕様どおりでした。
  もしソースの実装変更でテストが落ちた場合、`run.js` が失敗箇所をメッセージ付きで報告します。
