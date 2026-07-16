// joystick.js — 仮想ジョイスティック（左下固定）。画面左半分で始まったタッチを割当。PC確認用にWASDフォールバック
const Joystick = (function () {
  'use strict';
  const RADIUS = 55;

  // 純粋部: ベース中心(cx,cy)とタッチ点(x,y)から -1..1 のベクトル
  function vecFrom(cx, cy, x, y, radius) {
    let dx = (x - cx) / radius, dy = (y - cy) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    return { dx, dy };
  }

  let vec = { dx: 0, dy: 0 };
  const keyVec = { dx: 0, dy: 0 };
  let base, knob, cx = 0, cy = 0, touchId = null, mouseActive = false;
  const keys = {};

  function moveTo(x, y) {
    vec = vecFrom(cx, cy, x, y, RADIUS);
    knob.style.left = (35 + vec.dx * 35) + 'px';
    knob.style.top = (35 + vec.dy * 35) + 'px';
  }

  function reset() {
    touchId = null; vec = { dx: 0, dy: 0 };
    knob.style.left = '35px'; knob.style.top = '35px';
  }

  function updKeys() {
    keyVec.dx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    keyVec.dy = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
  }

  function init(container) {
    base = document.createElement('div');
    base.style.cssText = 'position:fixed;left:24px;bottom:24px;width:110px;height:110px;border-radius:50%;background:rgba(255,255,255,.15);border:2px solid rgba(255,255,255,.4);z-index:10;';
    knob = document.createElement('div');
    knob.style.cssText = 'position:absolute;left:35px;top:35px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.5);';
    base.appendChild(knob);
    container.appendChild(base);
    window.addEventListener('touchstart', e => {
      for (const t of e.changedTouches) {
        if (touchId === null && t.clientX < window.innerWidth / 2) {
          const r = base.getBoundingClientRect();
          cx = r.left + r.width / 2; cy = r.top + r.height / 2;
          touchId = t.identifier;
          moveTo(t.clientX, t.clientY);
        }
      }
    }, { passive: true });
    window.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) if (t.identifier === touchId) moveTo(t.clientX, t.clientY);
    }, { passive: true });
    const end = e => { for (const t of e.changedTouches) if (t.identifier === touchId) reset(); };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    // PC用マウス対応: baseで受けてstopPropagationし、main.jsの視点ドラッグ(window mousedown)を発火させない
    base.addEventListener('mousedown', e => {
      const r = base.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      mouseActive = true;
      moveTo(e.clientX, e.clientY);
      e.stopPropagation();
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => { if (mouseActive) moveTo(e.clientX, e.clientY); });
    window.addEventListener('mouseup', () => { if (mouseActive) { mouseActive = false; reset(); } });
    window.addEventListener('keydown', e => { keys[e.code] = true; updKeys(); });
    window.addEventListener('keyup', e => { keys[e.code] = false; updKeys(); });
  }

  function getVector() {
    if (vec.dx || vec.dy) return vec;
    return keyVec;
  }

  return { init, getVector, vecFrom };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Joystick;
