// Loads the Blender-rendered sprite PNGs (assets/). Everything degrades
// gracefully: if an image is missing or we're running without a DOM (tests),
// `ready()` returns false and the game falls back to its canvas-drawn art.
const Assets = {
  images: {},
  _loaded: {},
  defs: {
    soldier_blue: "assets/soldier_blue.png",
    soldier_red: "assets/soldier_red.png",
    fort_blue: "assets/fort_blue.png",
    fort_red: "assets/fort_red.png",
  },

  // Per-class soldier sprites (helmet/shoulders tinted to the class accent).
  _classKeys: ["sniper", "heavy", "climber", "engineer", "assault", "tamer"],

  load() {
    if (typeof Image === "undefined") return; // Node / no DOM
    for (const team of ["blue", "red"]) {
      for (const cls of this._classKeys) {
        const k = "soldier_" + team + "_" + cls;
        this.defs[k] = "assets/" + k + ".png";
      }
    }
    for (const key in this.defs) {
      const img = new Image();
      img.onload = () => { this._loaded[key] = true; };
      img.onerror = () => { this._loaded[key] = false; };
      img.src = this.defs[key];
      this.images[key] = img;
    }
  },

  ready(name) {
    return this._loaded[name] === true;
  },

  get(name) {
    return this.images[name];
  },
};
