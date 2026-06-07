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
    ['照準', 'マウス（スマホは攻撃スティックを倒した方向に攻撃）'],
    ['攻撃', 'クリック ・ スペース ・ 「攻」（刀は前方を斬る／弓・鉄砲は射撃）'],
    ['爆弾', 'E / 💣（砦・城門の破壊にも使える）'],
    ['武器', 'クラス固定（総大将/足軽/騎馬/忍者=刀、弓兵=弓、鉄砲兵=鉄砲、槍兵=槍）'],
    ['相性', '三すくみ：槍＞剣 ・ 剣＞弓 ・ 弓＞槍（有利な相手には大ダメージ）'],
    ['クラス特殊', 'C / 🎯（騎馬/総大将=突進ダッシュ、忍者=煙幕）'],
    ['クラス', '総大将 / 足軽 / 弓兵 / 鉄砲兵 / 騎馬 / 忍者 / 槍兵'],
    ['大将ルール', '総大将がSOS中は回復ゾーン無効＋味方が弱体。討死でサドンデス'],
    ['勝利条件', '敵を全滅 ・ 敵砦を破壊 ・ または敵の総大将を討ち取る']
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
