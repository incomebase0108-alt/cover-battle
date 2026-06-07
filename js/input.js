// Keyboard + mouse state for the human-controlled unit.
const Input = {
  keys: {},
  mouseX: CONFIG.width / 2,
  mouseY: CONFIG.height / 2,
  shooting: false,
  bombQueued: false, // edge-triggered: set on keydown, consumed once

  init(canvas) {
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      // Place a bomb on the rising edge only (ignore auto-repeat).
      if ((k === "e" || k === "q" || k === "shift") && !this.keys[k]) {
        this.bombQueued = true;
      }
      this.keys[k] = true;
      if (e.key === " ") {
        this.shooting = true;
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys[e.key.toLowerCase()] = false;
      if (e.key === " ") this.shooting = false;
    });

    const updateMouse = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      this.mouseX = (e.clientX - rect.left) * scaleX;
      this.mouseY = (e.clientY - rect.top) * scaleY;
    };
    canvas.addEventListener("mousemove", updateMouse);
    canvas.addEventListener("mousedown", (e) => {
      updateMouse(e);
      this.shooting = true;
    });
    window.addEventListener("mouseup", () => { this.shooting = false; });
  },

  // Normalised movement direction from WASD / arrow keys.
  moveVector() {
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

  // Returns true once per bomb keypress, then clears the request.
  consumeBomb() {
    if (this.bombQueued) {
      this.bombQueued = false;
      return true;
    }
    return false;
  },
};
