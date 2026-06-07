/* help.js — 操作ヘルプUI（グローバル Help）
 * - Help.init() で「？」ボタン＋操作説明オーバーレイを動的に追加する。
 * - DOM参照は関数内のみ。Node読込で例外を投げないこと。
 * - plain <script> グローバル方式。既存 js は触らない。
 */
(function (global) {
  'use strict';

  var initialized = false;

  // パネルに表示する操作説明（日本語・スマホで読める大きさ）
  var HELP_ROWS = [
    ['移動', 'WASD / 矢印 または 左スティック（斜めOK）'],
    ['照準', 'マウス（スマホは自動で最寄りの敵）'],
    ['射撃', 'クリック ・ スペース ・ 「撃」ボタン'],
    ['爆弾', 'E / 💣'],
    ['ダイナマイト', 'X / 🧨（砦破壊。3秒後に爆発、敵は撃って解除可）'],
    ['武器切替', '1〜4 ・ F / 🔫（ライフル/スナイパー/ショットガン/サブマシンガン）'],
    ['ロックオン', 'R（切替）/ 🔒 ・ Tab（対象変更）/ ⇄'],
    ['クラス特殊', 'C / 🎯（クラスにより 自動砲台・ダッシュ・動物捕獲 など）'],
    ['クラス', '狙撃 / 重装 / 山岳(段差を登れる) / 工兵 / 突撃 / 動物使い'],
    ['勝利条件', '砦に敵を全滅、または 砦破壊で勝利']
  ];

  function el(tag, props, children) {
    var d = global.document;
    var node = d.createElement(tag);
    if (props) {
      for (var k in props) {
        if (!props.hasOwnProperty(k)) continue;
        if (k === 'class') node.className = props[k];
        else if (k === 'text') node.textContent = props[k];
        else node.setAttribute(k, props[k]);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        node.appendChild(children[i]);
      }
    }
    return node;
  }

  function buildPanel() {
    var d = global.document;
    var rows = [];

    var title = el('h1', { text: '操作方法' });
    title.style.fontSize = '28px';
    rows.push(title);

    var sub = el('p', { class: 'subtitle', text: 'いつでも「？」で開けます' });
    rows.push(sub);

    var list = el('div', { class: 'how help-how' });
    for (var i = 0; i < HELP_ROWS.length; i++) {
      var p = el('p');
      var b = el('b', { text: HELP_ROWS[i][0] + '：' });
      p.appendChild(b);
      p.appendChild(d.createTextNode(HELP_ROWS[i][1]));
      list.appendChild(p);
    }
    rows.push(list);

    var closeBtn = el('button', { class: 'btn help-close', type: 'button', text: '閉じる' });
    rows.push(closeBtn);

    var panel = el('div', { class: 'panel help-panel' }, rows);
    return { panel: panel, closeBtn: closeBtn };
  }

  function Help_open() {
    var overlay = global.document.getElementById('helpOverlay');
    if (overlay) overlay.style.display = 'flex';
  }

  function Help_close() {
    var overlay = global.document.getElementById('helpOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  function Help_toggle() {
    var overlay = global.document.getElementById('helpOverlay');
    if (!overlay) return;
    if (overlay.style.display === 'none' || overlay.style.display === '') Help_open();
    else Help_close();
  }

  function Help_init() {
    if (initialized) return;
    var d = global && global.document;
    if (!d) return;
    var app = d.getElementById('app') || d.body;
    if (!app) return;
    initialized = true;

    // 「？」ヘルプボタン（左上、action-buttons/joystick と被らない位置）
    var btn = el('button', {
      id: 'helpBtn',
      class: 'help-btn',
      type: 'button',
      title: '操作方法',
      'aria-label': '操作方法'
    });
    btn.textContent = '？';

    // オーバーレイ（最前面・閉じている時は display:none）
    var built = buildPanel();
    var overlay = el('div', { id: 'helpOverlay', class: 'overlay help-overlay' }, [built.panel]);
    overlay.style.display = 'none';

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      Help_toggle();
    });
    built.closeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      Help_close();
    });
    // パネル外タップで閉じる
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) Help_close();
    });

    app.appendChild(btn);
    app.appendChild(overlay);
  }

  var Help = {
    init: Help_init,
    open: Help_open,
    close: Help_close,
    toggle: Help_toggle
  };

  global.Help = Help;

  if (global.addEventListener) {
    global.addEventListener('DOMContentLoaded', function () {
      Help_init();
    });
  }
})(typeof window !== 'undefined' ? window : this);
