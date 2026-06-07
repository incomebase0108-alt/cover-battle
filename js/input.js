// Keyboard + mouse + touch input for the human-controlled unit.
const Input = {
  keys: {},
  mouseX: CONFIG.width / 2,
  mouseY: CONFIG.height / 2,
  shooting: false,
  bombQueued: false,        // edge-triggered, consumed once
  abilityQueued: false,     // edge-triggered, consumed once (class ability)
  lockToggleQueued: false,  // edge-triggered, consumed once
  cycleQueued: false,       // edge-triggered, consumed once
  weaponSlotQueued: 0,      // edge-triggered: 1/2/3/4 to select a weapon, 0=none
  weaponCycleQueued: false, // edge-triggered: F cycles to the next weapon

  isTouch: false,
  touch: { active: false, dx: 0, dy: 0 },
  // Right-side aim stick (manual aiming on touch): direction + whether active.
  aimStick: { active: false, dx: 1, dy: 0 },

  init(canvas) {
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if ((k === "e" || k === "q") && !this.keys[k]) this.bombQueued = true;
      if (k === "c" && !this.keys[k]) this.abilityQueued = true;
      if (k === "r" && !this.keys[k]) this.lockToggleQueued = true;
      if (k === "tab" && !this.keys[k]) { this.cycleQueued = true; e.preventDefault(); }
      // Weapon switching: 1-4 select directly, F cycles forward.
      if (k >= "1" && k <= "4" && !this.keys[k]) this.weaponSlotQueued = Number(k);
      if (k === "f" && !this.keys[k]) this.weaponCycleQueued = true;
      this.keys[k] = true;
      if (e.key === " ") { this.shooting = true; e.preventDefault(); }
    });
    window.addEventListener("keyup", (e) => {
      this.keys[e.key.toLowerCase()] = false;
      if (e.key === " ") this.shooting = false;
    });

    const updateMouse = (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
      this.mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
    };
    canvas.addEventListener("mousemove", updateMouse);
    canvas.addEventListener("mousedown", (e) => { updateMouse(e); this.shooting = true; });
    window.addEventListener("mouseup", () => { this.shooting = false; });

    if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
      this.isTouch = true;
      document.body.classList.add("touch");
    }
  },

  // Wire up the on-screen mobile controls (joystick + action buttons).
  initTouch(els) {
    if (!els || !els.joystick) return;
    const stick = els.joystick;
    const knob = els.knob;
    const maxR = 46;
    let id = null;

    const setKnob = (dx, dy) => {
      if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const start = (e) => {
      this.isTouch = true;
      const t = e.changedTouches[0];
      id = t.identifier;
      this.touch.active = true;
      move(e);
      e.preventDefault();
    };
    const move = (e) => {
      const rect = stick.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let t = null;
      for (const ct of e.changedTouches) if (ct.identifier === id) t = ct;
      if (!t) return;
      let dx = t.clientX - cx;
      let dy = t.clientY - cy;
      const len = Math.hypot(dx, dy) || 1;
      const cl = Math.min(len, maxR);
      const nx = (dx / len);
      const ny = (dy / len);
      this.touch.dx = nx * (cl / maxR);
      this.touch.dy = ny * (cl / maxR);
      setKnob(nx * cl, ny * cl);
      e.preventDefault();
    };
    const end = (e) => {
      this.touch.active = false;
      this.touch.dx = 0;
      this.touch.dy = 0;
      setKnob(0, 0);
      id = null;
    };
    stick.addEventListener("touchstart", start, { passive: false });
    stick.addEventListener("touchmove", move, { passive: false });
    stick.addEventListener("touchend", end);
    stick.addEventListener("touchcancel", end);

    // 右の攻撃スティック: 倒した方向へ照準し、押している間ずっと射撃する。
    // 移動スティックとは独立（移動では撃たない＝弾の無駄撃ち防止）。
    if (els.aimStick) {
      const astick = els.aimStick;
      const aknob = els.aimKnob;
      const aMaxR = 46;
      let aid = null;
      const aSetKnob = (x, y) => { if (aknob) aknob.style.transform = `translate(${x}px, ${y}px)`; };
      const aMove = (e) => {
        const rect = astick.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let t = null;
        for (const ct of e.changedTouches) if (ct.identifier === aid) t = ct;
        if (!t) return;
        const dx = t.clientX - cx;
        const dy = t.clientY - cy;
        const len = Math.hypot(dx, dy) || 1;
        this.aimStick.dx = dx / len;
        this.aimStick.dy = dy / len;
        const cl = Math.min(len, aMaxR);
        aSetKnob((dx / len) * cl, (dy / len) * cl);
        e.preventDefault();
      };
      const aStart = (e) => {
        this.isTouch = true;
        aid = e.changedTouches[0].identifier;
        this.aimStick.active = true;
        this.shooting = true;
        aMove(e);
        e.preventDefault();
      };
      const aEnd = () => {
        this.aimStick.active = false;
        this.shooting = false;
        aid = null;
        aSetKnob(0, 0);
      };
      astick.addEventListener("touchstart", aStart, { passive: false });
      astick.addEventListener("touchmove", aMove, { passive: false });
      astick.addEventListener("touchend", aEnd);
      astick.addEventListener("touchcancel", aEnd);
    }

    const hold = (el, on, off) => {
      if (!el) return;
      el.addEventListener("touchstart", (e) => { on(); e.preventDefault(); }, { passive: false });
      el.addEventListener("touchend", (e) => { if (off) off(); e.preventDefault(); }, { passive: false });
    };
    hold(els.fire, () => { this.shooting = true; }, () => { this.shooting = false; });
    hold(els.bomb, () => { this.bombQueued = true; });
    hold(els.lock, () => { this.lockToggleQueued = true; });
    hold(els.cycle, () => { this.cycleQueued = true; });
    hold(els.weapon, () => { this.weaponCycleQueued = true; });
    hold(els.ability, () => { this.abilityQueued = true; });
  },

  // Right-side aim stick: drag anywhere on the right portion of the canvas to
  // aim, and it fires while held (twin-stick style). Left side stays for the
  // move joystick + bottom buttons (those are separate elements).
  initAim(canvas) {
    let id = null;
    let ox = 0;
    let oy = 0;
    const start = (e) => {
      for (const t of e.changedTouches) {
        if (id === null && t.clientX > window.innerWidth * 0.4) {
          id = t.identifier; ox = t.clientX; oy = t.clientY;
          this.aimStick.active = true; this.shooting = true;
          this.isTouch = true;
        }
      }
      if (id !== null) e.preventDefault();
    };
    const move = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === id) {
          const dx = t.clientX - ox;
          const dy = t.clientY - oy;
          const len = Math.hypot(dx, dy);
          if (len > 6) { this.aimStick.dx = dx / len; this.aimStick.dy = dy / len; }
          e.preventDefault();
        }
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === id) { id = null; this.aimStick.active = false; this.shooting = false; }
      }
    };
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);
    canvas.addEventListener("touchcancel", end);
  },

  moveVector() {
    if (this.touch.active) {
      const len = Math.hypot(this.touch.dx, this.touch.dy);
      if (len > 0.12) return { dx: this.touch.dx, dy: this.touch.dy };
    }
    let dx = 0;
    let dy = 0;
    if (this.keys["a"] || this.keys["arrowleft"]) dx -= 1;
    if (this.keys["d"] || this.keys["arrowright"]) dx += 1;
    if (this.keys["w"] || this.keys["arrowup"]) dy -= 1;
    if (this.keys["s"] || this.keys["arrowdown"]) dy += 1;
    const len = Math.hypot(dx, dy);
    if (len > 0) { dx /= len; dy /= len; }
    return { dx, dy };
  },

  consumeBomb() { const v = this.bombQueued; this.bombQueued = false; return v; },
  consumeAbility() { const v = this.abilityQueued; this.abilityQueued = false; return v; },
  consumeLockToggle() { const v = this.lockToggleQueued; this.lockToggleQueued = false; return v; },
  consumeCycle() { const v = this.cycleQueued; this.cycleQueued = false; return v; },
  consumeWeaponSlot() { const v = this.weaponSlotQueued; this.weaponSlotQueued = 0; return v; },
  consumeWeaponCycle() { const v = this.weaponCycleQueued; this.weaponCycleQueued = false; return v; },
};
