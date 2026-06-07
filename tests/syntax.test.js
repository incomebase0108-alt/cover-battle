// 全 js ファイルの「構文」を検査する。テストハーネス(harness.js)は ui.js / main.js /
// audio.js / assets.js / help.js などを読み込まないため、これらの構文エラーは通常の
// テストでは見逃される（実際 v19 で ui.js のカンマ抜けがゲーム起動不能を招いた）。
// ここで全 js を vm.Script でコンパイル（実行はしない）し、構文崩れを必ず検出する。

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { suite } = require("./assert");

const s = suite();
const JS_DIR = path.resolve(__dirname, "..", "js");

function allJs(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(allJs(p));
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

for (const file of allJs(JS_DIR)) {
  const rel = path.relative(JS_DIR, file).replace(/\\/g, "/");
  s.test(`構文OK: js/${rel}`, (t) => {
    const code = fs.readFileSync(file, "utf8");
    try {
      new vm.Script(code, { filename: file });
    } catch (e) {
      throw new Error(`構文エラー (${rel}): ${e.message}`);
    }
    t.ok(true, "parses");
  });
}

module.exports = s;
