// citygen.js — 街ジェネレーター
// シード乱数 → 街データ(JSON構造) → プリミティブ列(box/prism)
// DOM/THREE非依存。node でもブラウザでも動く。
// 【設計の核心】画面表示(viewer.js)もBlender出力(blender-export.js)も
// ここが作る同じデータ・同じプリミティブ列を読む。座標計算はこのファイルだけ。
const CityGen = (function () {
  'use strict';

  // --- シード乱数 (mulberry32) ---
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // --- 定数（単位: m） ---
  const AVENUE_W = 14;   // 大通りの幅（片側2車線相当）
  const STREET_W = 7;    // 生活道路の幅
  const WALK = 2.6;      // 歩道の幅
  const FLOOR_H = 3.2;   // ビルの階高
  const BLDG_COLORS = ['#d8d5cd', '#c9cdd2', '#b3ac9f', '#9fa8b0', '#e2decf', '#8f9aa3', '#cdbfae'];
  const CURTAIN_COLORS = ['#41505c', '#37424e', '#4a5f6e', '#3c4a58'];
  const KONBINI_COLORS = ['#2465b0', '#1f8a4d', '#e0542a'];
  const SIGN_COLORS = ['#d64541', '#2465b0', '#e0a12a', '#1f8a4d', '#7a3fa0'];
  const HOUSE_COLORS = ['#e8e2d4', '#ddd3c0', '#cfd6dc', '#e5d9c2'];
  const ROOF_COLORS = ['#5a6470', '#7a4a3a', '#46584a', '#39424e'];
  const SENGOKU_HOUSE_WALL_COLORS = ['#cbb98f', '#d8cfb0', '#c4b48a', '#dcd0a8'];
  const SENGOKU_THATCH_COLORS = ['#a8934f', '#93813f', '#b09a58'];
  const SENGOKU_TILE_COLORS = ['#4a5560', '#3d4750', '#566470'];
  const SENGOKU_SHINGLE_COLORS = ['#6d5638', '#5c4a2e', '#7a6142'];
  const MACHIYA_WALL_COLORS = ['#e8ddc4', '#ddd0ae', '#e2d6b8'];
  const MACHIYA_ROOF_COLORS = ['#5a5048', '#4a4640', '#3d4a3e'];
  const MACHIYA_SHINGLE_COLORS = ['#7a6248', '#6d5a3e', '#8a7050'];
  const BUKE_WALL_COLORS = ['#d8cfb0', '#c9bda0', '#dbcfa8'];
  const BUKE_ROOF_COLORS = ['#3d4a3e', '#33392f', '#2f3a30'];
  const MAT = {
    ground: '#cfc9b8', asphalt: '#3d4147', walk: '#b7b1a3',
    lotC: '#9b9890', lotR: '#c8bda4',
    glass: '#26313b', parapet: '#7e7a70', mullion: '#c8cdd2',
    entrance: '#1f2a33', canopy: '#4a5158', equip: '#9a958a',
    balcony: '#dcd8ce', door: '#4a3a2c', grass: '#7f9c62', fence: '#c5c0b2',
    stripe: '#e6e4dd', centerline: '#d9a441', laneline: '#dcdad2',
    sigpole: '#7d8288', sighead: '#2b3033',
    sigG: '#2ea86b', sigY: '#e6c229', sigR: '#d64541',
    pole: '#9a958c', wire: '#33363a', trafo: '#7a756c',
    konbiniWall: '#f0efe9', storefront: '#22303a', parking: '#484c52',
    grassPark: '#86a565', path: '#d8d2c0', bench: '#8a6a4a',
    trunk: '#6d5638', leaf: '#4e7a3d', leaf2: '#5c8a48',
    water: '#3e7fa5', bank: '#7f9c62',
    ballast: '#8d8a84', rail: '#5b6065', sleeper: '#54493d', platform: '#c9c6bd',
    stationWall: '#e9e5da', stationSign: '#2456a0',
    hospWall: '#f2f1ec', red: '#d43d33',
    policeWall: '#ded9c8', policeBand: '#1f3a6e', gold: '#d8b13a',
    gateWhite: '#f0eee8', gateRed: '#c8352b', lattice: '#463c30',
    ridgeTile: '#4a4642',
    // --- sengoku（戦国）era用パレット ---
    dirtRoad: '#8a7355', dirtGround: '#9c8f66', dirtLotC: '#8f7f5c', dirtLotR: '#7f9a5c',
    stonePath: '#8b8880', riverMuddy: '#7a6a3f', ditchWater: '#5c6b3f', moatWater: '#4f6a5c',
  };

  const roadW = (k, o) => (k === 'avenue' ? o.avenueW : o.streetW);

  // 碁盤の目のライン位置（n ブロック → n+1 本）。幅はシードでばらける
  function gridLines(r, n) {
    const lines = [0];
    for (let i = 0; i < n; i++) lines.push(lines[i] + 38 + r() * 26);
    return lines;
  }
  // ラインの種別: 3本に1本を大通りに
  function kinds(n) {
    const k = [];
    for (let i = 0; i <= n; i++) k.push(i % 3 === 1 ? 'avenue' : 'street');
    return k;
  }

  // 戦国建物の向き: ブロック端(道路に接する側)なら実際の道路側を向く。内部区画はランダムのまま。
  function sengokuRy(ix, iz, nx, nz, r) {
    if (iz === nz - 1) return 0;             // 手前(+z)の道路に面する
    if (iz === 0) return Math.PI;            // 奥(-z)の道路に面する
    if (ix === nx - 1) return Math.PI / 2;   // 右(+x)の道路に面する
    if (ix === 0) return Math.PI * 1.5;      // 左(-x)の道路に面する
    return r() < 0.5 ? 0 : Math.PI / 2;      // 内部区画は道路に接しないためランダム
  }

  // ============================================================
  // generate(opts) → 街データ
  // opts: { seed, blocks(2..10), maxFloors(2..12), density(0.3..1) }
  // ============================================================
  function generate(opts) {
    const o = Object.assign({
      seed: 1, blocks: 5, maxFloors: 8, density: 0.8,
      signals: 1, poles: 1, marks: 1, konbini: 1, parks: 1, river: 1, treeAmt: 0.6,
      station: 1, police: 1, hospital: 1,
      era: 'modern', avenueW: AVENUE_W, streetW: STREET_W,
    }, opts || {});
    const r = rng(o.seed);
    const bx = o.blocks;
    const bz = Math.max(2, Math.round(o.blocks * 0.8));
    const LX = gridLines(r, bx), LZ = gridLines(r, bz);
    const KX = kinds(bx), KZ = kinds(bz);
    const W = LX[bx], H = LZ[bz];
    const data = {
      seed: o.seed, opts: o, size: { w: W, h: H },
      roads: [], blocks: [], buildings: [],
      signals: [], crossings: [], poles: [], wires: [], marks: [],
      // ↓ Step3以降で埋まる（形式だけ先に確保）
      trees: [], parks: [], rivers: [], rails: [], props: [], paddies: [], ditches: [],
    };
    // 道路: 縦(v)と横(h)。交差点まで覆うよう端を少し延長
    for (let i = 0; i <= bx; i++) data.roads.push({
      x1: LX[i], z1: -roadW(KZ[0], o) / 2, x2: LX[i], z2: H + roadW(KZ[bz], o) / 2,
      width: roadW(KX[i], o), kind: KX[i], dir: 'v',
    });
    for (let j = 0; j <= bz; j++) data.roads.push({
      x1: -roadW(KX[0], o) / 2, z1: LZ[j], x2: W + roadW(KX[bx], o) / 2, z2: LZ[j],
      width: roadW(KZ[j], o), kind: KZ[j], dir: 'h',
    });
    // 区画（ブロック）: 道路にはさまれた四角。 大通りに面していれば商業地
    for (let i = 0; i < bx; i++) for (let j = 0; j < bz; j++) {
      const x0 = LX[i] + roadW(KX[i], o) / 2, x1 = LX[i + 1] - roadW(KX[i + 1], o) / 2;
      const z0 = LZ[j] + roadW(KZ[j], o) / 2, z1 = LZ[j + 1] - roadW(KZ[j + 1], o) / 2;
      const zone = (KX[i] === 'avenue' || KX[i + 1] === 'avenue' || KZ[j] === 'avenue' || KZ[j + 1] === 'avenue')
        ? 'commercial' : 'residential';
      data.blocks.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, zone });
    }
    // 公園: 住宅地の区画がたまに公園になる。ONなら最低1つは保証
    if (o.parks) {
      let hasPark = false;
      for (const b of data.blocks) {
        if (b.zone === 'residential' && r() < 0.16) { b.park = 1; hasPark = true; }
      }
      if (!hasPark) {
        const cands = data.blocks.filter(b => b.zone === 'residential');
        const pool = cands.length ? cands : data.blocks;
        pool[Math.floor(pool.length / 2)].park = 1;
      }
    }
    // 特別建物: 広い区画から順に1つずつ割り当て（現代=病院・警察／戦国=神社・寺）
    if (o.era === 'sengoku') {
      if (o.shrine || o.fortTemple !== 0) {
        const cands = data.blocks.filter(b => !b.park).sort((a, b2) => b2.w * b2.d - a.w * a.d);
        if (o.shrine && cands[0]) cands[0].special = 'shrine';
        if (o.fortTemple !== 0 && cands[1]) cands[1].special = o.fortTemple ? 'teraFort' : 'tera';
      }
    } else if (o.hospital || o.police) {
      const cands = data.blocks.filter(b => !b.park).sort((a, b2) => b2.w * b2.d - a.w * a.d);
      if (o.hospital && cands[0]) cands[0].special = 'hospital';
      if (o.police && cands[1]) cands[1].special = 'police';
    }
    data._kb = 0; data._kbCap = Math.max(1, Math.round(bx * bz / 6)); // コンビニは街の広さに応じて数店まで
    for (const b of data.blocks) {
      if (b.park) { if (o.era === 'sengoku') paddyFill(data, b, r, o); else parkFill(data, b, r, o); }
      else if (b.special) specialFill(data, b);
      else fillBlock(data, b, r, o);
    }
    if (o.station) addRail(data, LX, LZ, KX, KZ, bx, bz, o);
    if (o.signals) addSignals(data, LX, LZ, KX, KZ, o);
    if (o.marks) addMarks(data, LX, LZ, KX, KZ, bx, bz, o);
    if (o.poles) addPoles(data, LX, LZ, KX, KZ, bx, bz, r, o);
    addStreetTrees(data, LX, LZ, KX, KZ, bx, bz, r, o);
    if (o.river) addRiver(data, LX, LZ, KX, KZ, bx, bz, o);
    if (o.era === 'sengoku' && o.river) addWatermill(data);
    if (o.era === 'sengoku' && o.gate) addTownGates(data, LX, LZ, KX, KZ, bx, bz, o);
    if (o.era === 'sengoku' && o.ditch) addDitch(data, LX, LZ, KX, KZ, bx, bz, o);
    return data;
  }

  // 特別区画を埋める（区画をまるごと使う建物。正面+z、手前が駐車場/参道）
  function specialFill(data, b) {
    const iw = b.w - WALK * 2, id = b.d - WALK * 2;
    if (b.special === 'hospital') {
      const w = Math.min(iw * 0.72, 26), d = Math.min(id * 0.5, 14);
      data.buildings.push({
        x: b.x, z: b.z - (id - d) * 0.18, w, d, floors: 5, h: 5 * 3.4 + 1,
        kind: 'hospital', lotX: b.x, lotZ: b.z, lotW: iw, lotD: id,
      });
    } else if (b.special === 'police') {
      const w = Math.min(iw * 0.55, 16), d = Math.min(id * 0.45, 10);
      data.buildings.push({
        x: b.x, z: b.z - (id - d) * 0.18, w, d, floors: 3, h: 3 * 3.3 + 0.6,
        kind: 'police', lotX: b.x, lotZ: b.z, lotW: iw, lotD: id,
      });
    } else if (b.special === 'shrine') {
      data.buildings.push({
        x: b.x, z: b.z, w: Math.min(iw * 0.4, 8), d: Math.min(id * 0.35, 7),
        h: 3.0, kind: 'shrine', lotX: b.x, lotZ: b.z, lotW: iw, lotD: id,
      });
    } else if (b.special === 'tera') {
      data.buildings.push({
        x: b.x, z: b.z, w: Math.min(iw * 0.55, 14), d: Math.min(id * 0.5, 12),
        h: 5.0, kind: 'tera', lotX: b.x, lotZ: b.z, lotW: iw, lotD: id,
      });
    } else if (b.special === 'teraFort') {
      const w = Math.min(iw * 0.34, 9), d = Math.min(id * 0.3, 8);
      data.buildings.push({
        x: b.x, z: b.z, w, d, h: 6.0,
        kind: 'teraFort', lotX: b.x, lotZ: b.z, lotW: iw, lotD: id,
      });
    }
  }

  // 線路と駅: 街の西側に南北の線路。大通りと端の道は踏切で横断。駅は中ほど
  function addRail(data, LX, LZ, KX, KZ, bx, bz, o) {
    const RAIL_X = -20, z0 = LZ[0] - 35, z1 = LZ[bz] + 35;
    const crossings = [];
    for (let j = 0; j <= bz; j++) {
      if (KZ[j] === 'avenue' || j === 0 || j === bz) {
        crossings.push({ z: LZ[j], width: roadW(KZ[j], o), roadEndX: -roadW(KX[0], o) / 2 });
      }
    }
    const m = Math.floor(bz / 2);
    const stationZ = (LZ[m] + LZ[m + 1]) / 2;
    data.rails.push({ x: RAIL_X, z0, z1, crossings, stationZ });
    data.buildings.push({ x: -10.5, z: stationZ, w: 8, d: 22, kind: 'station', floors: 2, h: 7.4 });
  }

  // 公園: 芝生＋木＋十字の小道＋ベンチ
  function parkFill(data, b, r, o) {
    data.parks.push({ x: b.x, z: b.z, w: b.w, d: b.d });
    const n = Math.round(b.w * b.d / 110 * (0.3 + o.treeAmt));
    for (let k = 0; k < n; k++) {
      const tx = b.x + (r() - 0.5) * (b.w - 7), tz = b.z + (r() - 0.5) * (b.d - 7);
      if (Math.abs(tx - b.x) < 2.2 || Math.abs(tz - b.z) < 2.2) continue; // 小道の上は避ける
      data.trees.push({ x: tx, z: tz, s: 1.1 + r() * 0.9 });
    }
    for (let k = 0; k < 2; k++) {
      data.props.push({ kind: 'bench', x: b.x + (r() - 0.5) * (b.w - 8), z: b.z + (k ? 2.8 : -2.8), ry: 0 });
    }
  }

  // 田畑: 緑と土色の格子＋畦道
  function paddyFill(data, b, r, o) {
    data.paddies.push({ x: b.x, z: b.z, w: b.w, d: b.d });
    const cols = Math.max(1, Math.round(b.w / 4)), rows = Math.max(1, Math.round(b.d / 4));
    for (let ix = 0; ix < cols; ix++) for (let iz = 0; iz < rows; iz++) {
      if (r() > 0.9) continue; // たまに畦道のまま空ける
      const px = b.x - b.w / 2 + (b.w / cols) * (ix + 0.5);
      const pz = b.z - b.d / 2 + (b.d / rows) * (iz + 0.5);
      data.paddies.push({ x: px, z: pz, w: b.w / cols - 0.3, d: b.d / rows - 0.3, plot: 1 });
    }
    if (o.well && r() < 0.35) data.props.push({ kind: 'well', x: b.x + (r() - 0.5) * 3, z: b.z + (r() - 0.5) * 3 });
  }

  // 街路樹: 大通りの歩道に約18m間隔（交差点のそばは空ける）
  function addStreetTrees(data, LX, LZ, KX, KZ, bx, bz, r, o) {
    const near = (v, arr) => arr.some(g => Math.abs(g - v) < 7);
    for (let i = 0; i <= bx; i++) {
      if (KX[i] !== 'avenue') continue;
      for (const side of [-1, 1]) {
        const x = LX[i] + side * (o.avenueW / 2 + 1.6);
        for (let z = LZ[0] + 9; z <= LZ[bz] - 9; z += 18) {
          if (near(z, LZ) || r() > o.treeAmt) continue;
          data.trees.push({ x, z, s: 0.9 + r() * 0.4 });
        }
      }
    }
    for (let j = 0; j <= bz; j++) {
      if (KZ[j] !== 'avenue') continue;
      for (const side of [-1, 1]) {
        const z = LZ[j] + side * (o.avenueW / 2 + 1.6);
        for (let x = LX[0] + 9; x <= LX[bx] - 9; x += 18) {
          if (near(x, LX) || r() > o.treeAmt) continue;
          data.trees.push({ x, z, s: 0.9 + r() * 0.4 });
        }
      }
    }
  }

  // 川: 街の東側に南北の川＋土手。大通りと端の道には橋
  function addRiver(data, LX, LZ, KX, KZ, bx, bz, o) {
    const W = LX[bx], H = LZ[bz], RW = 13;
    const bridges = [];
    for (let j = 0; j <= bz; j++) {
      if (KZ[j] === 'avenue' || j === 0 || j === bz) bridges.push({ z: LZ[j], width: roadW(KZ[j], o) + 2.5 });
    }
    data.rivers.push({ x: W + 6 + RW / 2, z: H / 2, w: RW, len: H + 70, bridges });
  }

  // 水車小屋: 川がある場合、最初の橋の近くに1棟
  function addWatermill(data) {
    const rv = data.rivers[0];
    if (!rv) return;
    const br = (rv.bridges && rv.bridges[0]) ? rv.bridges[0].z : rv.z;
    data.buildings.push({
      x: rv.x + rv.w / 2 + 2.5, z: br + 6, w: 3.2, d: 3.2, h: 3.0, kind: 'suisha',
    });
  }

  // 木戸: 町境（マップ端）の大通り入口に配置
  function addTownGates(data, LX, LZ, KX, KZ, bx, bz, o) {
    data.buildings.push({ x: LX[0], z: (LZ[0] + LZ[bz]) / 2, kind: 'gate', dir: 'v', w: roadW(KX[0], o) });
    data.buildings.push({ x: LX[bx], z: (LZ[0] + LZ[bz]) / 2, kind: 'gate', dir: 'v', w: roadW(KX[bx], o) });
    data.buildings.push({ x: (LX[0] + LX[bx]) / 2, z: LZ[0], kind: 'gate', dir: 'h', w: roadW(KZ[0], o) });
    data.buildings.push({ x: (LX[0] + LX[bx]) / 2, z: LZ[bz], kind: 'gate', dir: 'h', w: roadW(KZ[bz], o) });
  }

  // どぶ川: 生活道路(street)を1本選び、その片側に沿って町の端から端まで細い水路を通す
  function addDitch(data, LX, LZ, KX, KZ, bx, bz, o) {
    let idx = -1;
    for (let i = 1; i < bx; i++) { if (KX[i] === 'street') { idx = i; break; } }
    if (idx < 0) return;
    const x = LX[idx] + (o.streetW / 2 + 0.7);
    data.ditches.push({ x, z0: LZ[0], z1: LZ[bz], dir: 'v', w: 1.2 });
  }

  // 信号機＋横断歩道: 大通りが絡む交差点に設置
  function addSignals(data, LX, LZ, KX, KZ, o) {
    for (let i = 0; i < LX.length; i++) for (let j = 0; j < LZ.length; j++) {
      if (KX[i] !== 'avenue' && KZ[j] !== 'avenue') continue;
      const wv = roadW(KX[i], o), wh = roadW(KZ[j], o);
      data.signals.push({ x: LX[i], z: LZ[j], wv, wh });
      data.crossings.push({ x: LX[i], z: LZ[j] - (wh / 2 + 2.1), dir: 'v', span: wv });
      data.crossings.push({ x: LX[i], z: LZ[j] + (wh / 2 + 2.1), dir: 'v', span: wv });
      data.crossings.push({ x: LX[i] - (wv / 2 + 2.1), z: LZ[j], dir: 'h', span: wh });
      data.crossings.push({ x: LX[i] + (wv / 2 + 2.1), z: LZ[j], dir: 'h', span: wh });
    }
  }

  // 道路の線: 大通りにセンターライン(オレンジ)＋車線の白破線。交差点内は塗らない
  function addMarks(data, LX, LZ, KX, KZ, bx, bz, o) {
    for (let i = 0; i <= bx; i++) {
      if (KX[i] !== 'avenue') continue;
      for (let j = 0; j < bz; j++) {
        const z0 = LZ[j] + roadW(KZ[j], o) / 2 + 3.5, z1 = LZ[j + 1] - roadW(KZ[j + 1], o) / 2 - 3.5;
        if (z1 - z0 < 5) continue;
        const zc = (z0 + z1) / 2, len = z1 - z0, wv = roadW(KX[i], o);
        data.marks.push({ x: LX[i], z: zc, dir: 'v', len, kind: 'center' });
        data.marks.push({ x: LX[i] - wv / 4, z: zc, dir: 'v', len, kind: 'lane' });
        data.marks.push({ x: LX[i] + wv / 4, z: zc, dir: 'v', len, kind: 'lane' });
      }
    }
    for (let j = 0; j <= bz; j++) {
      if (KZ[j] !== 'avenue') continue;
      for (let i = 0; i < bx; i++) {
        const x0 = LX[i] + roadW(KX[i], o) / 2 + 3.5, x1 = LX[i + 1] - roadW(KX[i + 1], o) / 2 - 3.5;
        if (x1 - x0 < 5) continue;
        const xc = (x0 + x1) / 2, len = x1 - x0, wh = roadW(KZ[j], o);
        data.marks.push({ x: xc, z: LZ[j], dir: 'h', len, kind: 'center' });
        data.marks.push({ x: xc, z: LZ[j] - wh / 4, dir: 'h', len, kind: 'lane' });
        data.marks.push({ x: xc, z: LZ[j] + wh / 4, dir: 'h', len, kind: 'lane' });
      }
    }
  }

  // 電柱＋電線: 生活道路ぞいに約24m間隔。道路の左右どちらに立つかは道ごとに交互
  function addPoles(data, LX, LZ, KX, KZ, bx, bz, r, o) {
    const off = o.streetW / 2 + 0.9;
    for (let i = 0; i <= bx; i++) {
      if (KX[i] !== 'street') continue;
      const x = LX[i] + (i % 2 ? off : -off);
      let prev = null;
      for (let z = LZ[0] + 6; z <= LZ[bz] - 3; z += 24) {
        data.poles.push({ x, z, dir: 'v', trafo: r() < 0.25 ? 1 : 0 });
        if (prev !== null) data.wires.push({ x1: x, z1: prev, x2: x, z2: z });
        prev = z;
      }
    }
    for (let j = 0; j <= bz; j++) {
      if (KZ[j] !== 'street') continue;
      const z = LZ[j] + (j % 2 ? off : -off);
      let prev = null;
      for (let x = LX[0] + 6; x <= LX[bx] - 3; x += 24) {
        data.poles.push({ x, z, dir: 'h', trafo: r() < 0.25 ? 1 : 0 });
        if (prev !== null) data.wires.push({ x1: prev, z1: z, x2: x, z2: z });
        prev = x;
      }
    }
  }

  // 区画に建物を詰める（商業地=ビル/町家 / 住宅地=家・アパート/住居・武家屋敷）
  function fillBlock(data, b, r, o) {
    const iw = b.w - WALK * 2, id = b.d - WALK * 2; // 歩道の内側
    if (iw < 8 || id < 8) return;
    const sengoku = o.era === 'sengoku';
    const lot = (b.zone === 'commercial') ? 15 : 11.5;
    const nx = Math.max(1, Math.floor(iw / lot)), nz = Math.max(1, Math.floor(id / lot));
    const lw = iw / nx, ld = id / nz;
    const used = new Set(); // コンビニが隣の敷地を取り込んだ場合の占有マーク
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
      if (used.has(ix + ',' + iz)) continue;
      if (r() > o.density) continue;
      const cx = b.x - iw / 2 + lw * (ix + 0.5);
      const cz = b.z - id / 2 + ld * (iz + 0.5);
      if (!sengoku && b.zone === 'commercial' && o.konbini && data._kb < data._kbCap
        && (ix === 0 || ix === nx - 1) && (iz === 0 || iz === nz - 1)
        && lw >= 11 && ld >= 9 && r() < 0.2) {
        data._kb++;
        const ix2 = ix === 0 ? ix + 1 : ix - 1; // 横隣（ブロック中央寄り）
        const merge = nx >= 2 && !used.has(ix2 + ',' + iz);
        if (merge) used.add(ix2 + ',' + iz);
        const siteW = merge ? lw * 2 : lw;
        const siteX = merge ? (cx + (b.x - iw / 2 + lw * (ix2 + 0.5))) / 2 : cx;
        const ry = iz === nz - 1 ? 0 : Math.PI;
        const d = Math.min(ld * 0.55, 8);
        const fs = ld - d;
        const z = cz - Math.cos(ry) * fs * 0.22;
        data.buildings.push({
          x: siteX, z, w: Math.min(siteW * 0.55, 14), d,
          h: 3.8, floors: 1, kind: 'konbini', ry,
          brand: KONBINI_COLORS[Math.floor(r() * KONBINI_COLORS.length)],
          lotX: siteX, lotZ: cz, lotW: siteW, lotD: ld,
        });
        continue;
      }
      // 順序注意: この関数内でr()の呼び出し回数・順序を変えると、以降の全建物のRNGシーケンスがずれる。
      // 固定seedのテストが壊れたら、seed値の差し替えではなく複数seed探索方式に倒すこと。
      if (sengoku) {
        const typeRoll = r();
        const isCommercial = b.zone === 'commercial';
        const machiyaP = isCommercial ? 0.70 : 0.15;
        const bukeP = isCommercial ? 0.15 : 0.23;
        if (typeRoll < machiyaP) {
          const floors = 1 + (r() < 0.3 ? 1 : 0);
          const roofStyle = r() < 0.8 ? 'tile' : 'shingle';
          const roofPalette = roofStyle === 'tile' ? MACHIYA_ROOF_COLORS : MACHIYA_SHINGLE_COLORS;
          data.buildings.push({
            x: cx + (r() - 0.5) * 1.5, z: cz + (r() - 0.5) * 1.5,
            w: Math.min(lw * 0.78, 8.5), d: Math.min(ld * 0.78, 9), floors,
            h: floors * 2.7, kind: 'machiya', ry: sengokuRy(ix, iz, nx, nz, r),
            color: MACHIYA_WALL_COLORS[Math.floor(r() * MACHIYA_WALL_COLORS.length)],
            roof: roofPalette[Math.floor(r() * roofPalette.length)],
            roofStyle,
          });
          used.add(ix + ',' + iz);
        } else if (typeRoll < machiyaP + bukeP) {
          const roofStyle = r() < 0.7 ? 'tile' : 'thatch';
          const ry = sengokuRy(ix, iz, nx, nz, r);
          const swap = Math.abs(Math.sin(ry)) > Math.abs(Math.cos(ry));

          // 区画統合: 道路に接する武家屋敷のみ、奥行き方向(道路と反対側)の隣接区画を1つ取り込む。
          // sengokuRyが向きを決めた軸(z優先、次にx)と同じ軸で統合先を選ぶ。
          // 内部区画(isEdgeZもisEdgeXも偽)はどちらの分岐にも入らないため、merged=falseのまま構造的に統合されない。
          let mergedLw = lw, mergedLd = ld, mergedCx = cx, mergedCz = cz, merged = false;
          const isEdgeZ = iz === nz - 1 || iz === 0;
          const isEdgeX = ix === nx - 1 || ix === 0;
          if (isEdgeZ) {
            const iz2 = iz === nz - 1 ? iz - 1 : iz + 1;
            const canMerge = nz >= 2 && iz2 >= 0 && iz2 < nz && !used.has(ix + ',' + iz2);
            if (canMerge && r() < 0.2) {
              used.add(ix + ',' + iz2);
              merged = true;
              mergedLd = ld * 2;
              mergedCz = (cz + (b.z - id / 2 + ld * (iz2 + 0.5))) / 2;
            }
          } else if (isEdgeX) {
            const ix2 = ix === nx - 1 ? ix - 1 : ix + 1;
            const canMerge = nx >= 2 && ix2 >= 0 && ix2 < nx && !used.has(ix2 + ',' + iz);
            if (canMerge && r() < 0.2) {
              used.add(ix2 + ',' + iz);
              merged = true;
              mergedLw = lw * 2;
              mergedCx = (cx + (b.x - iw / 2 + lw * (ix2 + 0.5))) / 2;
            }
          }

          const wLot = swap ? mergedLd : mergedLw, dLot = swap ? mergedLw : mergedLd;
          const bukeW = roofStyle === 'tile' ? Math.min(wLot * 0.90, 26) : Math.min(wLot * 0.75, 13);
          const dCap = (roofStyle === 'tile' ? 22 : 11) * (merged ? 2 : 1); // 統合時は奥行きの上限も2倍にして、伸びた区画分を実際に活かす
          const bukeD = roofStyle === 'tile' ? Math.min(dLot * 0.85, dCap) : Math.min(dLot * 0.65, dCap);
          data.buildings.push({
            x: mergedCx, z: mergedCz, w: bukeW, d: bukeD,
            h: 3.3, kind: 'buke', ry,
            lotW: mergedLw, lotD: mergedLd, merged,
            color: BUKE_WALL_COLORS[Math.floor(r() * BUKE_WALL_COLORS.length)],
            roof: roofStyle === 'tile'
              ? BUKE_ROOF_COLORS[Math.floor(r() * BUKE_ROOF_COLORS.length)]
              : SENGOKU_THATCH_COLORS[Math.floor(r() * SENGOKU_THATCH_COLORS.length)],
            roofStyle,
          });
          used.add(ix + ',' + iz);
        } else {
          const roofRoll = r();
          const roofStyle = roofRoll < 0.6 ? 'thatch' : (roofRoll < 0.8 ? 'tile' : 'shingle');
          const roofPalette = roofStyle === 'thatch' ? SENGOKU_THATCH_COLORS
            : (roofStyle === 'tile' ? SENGOKU_TILE_COLORS : SENGOKU_SHINGLE_COLORS);
          data.buildings.push({
            x: cx + (r() - 0.5) * 2, z: cz + (r() - 0.5) * 2,
            w: Math.min(lw * 0.68, 8), d: Math.min(ld * 0.68, 7), h: 2.6,
            kind: 'house-sengoku', ry: sengokuRy(ix, iz, nx, nz, r),
            color: SENGOKU_HOUSE_WALL_COLORS[Math.floor(r() * SENGOKU_HOUSE_WALL_COLORS.length)],
            roof: roofPalette[Math.floor(r() * roofPalette.length)],
            roofStyle,
            fence: r() < 0.5 ? 1 : 0, lotW: lw, lotD: ld,
          });
          used.add(ix + ',' + iz);
        }
        continue;
      }
      if (b.zone === 'commercial') {
        const floors = Math.max(2, Math.round(2 + Math.pow(r(), 1.6) * (o.maxFloors - 2)));
        data.buildings.push({
          x: cx, z: cz, w: lw * 0.82, d: ld * 0.82, floors,
          h: floors * FLOOR_H + 0.8, kind: 'bldg',
          color: BLDG_COLORS[Math.floor(r() * BLDG_COLORS.length)],
          style: r() < 0.4 ? 'curtain' : 'bands',
          glass: CURTAIN_COLORS[Math.floor(r() * CURTAIN_COLORS.length)],
          setback: floors >= 6 && r() < 0.4 ? 1 : 0,
          equip: r() < 0.75 ? 1 : 0,
          eqx: (r() - 0.5) * 0.6, eqz: (r() - 0.5) * 0.6,
          sign: floors <= 6 && r() < 0.55
            ? { c: SIGN_COLORS[Math.floor(r() * SIGN_COLORS.length)], side: r() < 0.5 ? -1 : 1 } : null,
        });
      } else if (r() < 0.12) {
        const floors = 3 + Math.floor(r() * 2);
        data.buildings.push({
          x: cx, z: cz, w: Math.min(lw * 0.85, 13), d: Math.min(ld * 0.7, 9), floors,
          h: floors * 2.9 + 0.5, kind: 'apart',
          color: HOUSE_COLORS[Math.floor(r() * HOUSE_COLORS.length)],
        });
      } else {
        const floors = 1 + (r() < 0.4 ? 1 : 0);
        data.buildings.push({
          x: cx + (r() - 0.5) * 2, z: cz + (r() - 0.5) * 2,
          w: Math.min(lw * 0.72, 9.5), d: Math.min(ld * 0.72, 8), floors,
          h: floors * 3.0, kind: 'house', ry: r() < 0.5 ? 0 : Math.PI / 2,
          color: HOUSE_COLORS[Math.floor(r() * HOUSE_COLORS.length)],
          roof: ROOF_COLORS[Math.floor(r() * ROOF_COLORS.length)],
          fence: r() < 0.65 ? 1 : 0,
          lotW: lw, lotD: ld,
        });
      }
    }
  }

  // ============================================================
  // buildPrims(data) → { prims, bounds }
  // プリミティブ共通語彙: {t:'box'|'prism', x,y,z, sx,sy,sz, ry?, c:'#hex'}
  //   box   = 直方体（sx,sy,sz は各辺の長さ、x,y,z は中心）
  //   prism = 三角屋根（底辺sx × 奥行sz × 高さsy、底面中心が x,y,z）
  // ※新しい部品を足すときは、この語彙の組合せで表現すること
  // ============================================================
  function buildPrims(data, opt) {
    const P = [];
    const W = data.size.w, H = data.size.h;
    const gm = (opt && opt.groundMargin !== undefined) ? opt.groundMargin : 45; // 地面の余白
    const sengoku = data.opts && data.opts.era === 'sengoku';
    const groundC = sengoku ? MAT.dirtGround : MAT.ground;
    const roadC = sengoku ? MAT.dirtRoad : MAT.asphalt;
    // 地面（1枚）
    P.push({ t: 'box', x: W / 2, y: -0.06, z: H / 2, sx: W + gm * 2, sy: 0.12, sz: H + gm * 2, c: groundC });
    // 道路: 縦と横で高さを 5mm ずらして重なり面のチラつき(Zファイティング)を回避
    for (const rd of data.roads) {
      if (rd.dir === 'v') {
        P.push({ t: 'box', x: rd.x1, y: 0.06, z: (rd.z1 + rd.z2) / 2, sx: rd.width, sy: 0.12, sz: rd.z2 - rd.z1, c: roadC });
      } else {
        P.push({ t: 'box', x: (rd.x1 + rd.x2) / 2, y: 0.055, z: rd.z1, sx: rd.x2 - rd.x1, sy: 0.12, sz: rd.width, c: roadC });
      }
    }
    // 歩道スラブ（現代=縁石つき／戦国=無し）＋内側の敷地色
    for (const b of data.blocks) {
      if (!sengoku) P.push({ t: 'box', x: b.x, y: 0.15, z: b.z, sx: b.w, sy: 0.3, sz: b.d, c: MAT.walk });
      const iw = b.w - WALK * 2, id = b.d - WALK * 2;
      if (iw > 1 && id > 1) {
        const c = (b.park && !sengoku)
          ? MAT.grassPark
          : (sengoku ? (b.zone === 'commercial' ? MAT.dirtLotC : MAT.dirtLotR) : (b.zone === 'commercial' ? MAT.lotC : MAT.lotR));
        P.push({ t: 'box', x: b.x, y: sengoku ? 0.06 : 0.325, z: b.z, sx: iw, sy: 0.05, sz: id, c });
        if (b.park && !sengoku) { // 十字の小道（現代の公園のみ）
          P.push({ t: 'box', x: b.x, y: 0.36, z: b.z, sx: iw, sy: 0.03, sz: 2.4, c: MAT.path });
          P.push({ t: 'box', x: b.x, y: 0.365, z: b.z, sx: 2.4, sy: 0.03, sz: id, c: MAT.path });
        }
      }
    }
    // 建物
    const TOP = 0.3; // 歩道スラブの上面
    // 建物ローカル座標(dx,dz)を ry 回転して世界座標に変換
    const rot = (bl, dx, dz) => {
      const ry = bl.ry || 0, c = Math.cos(ry), s = Math.sin(ry);
      return { x: bl.x + dx * c + dz * s, z: bl.z - dx * s + dz * c };
    };
    for (const bl of data.buildings) {
      if (bl.kind === 'house') houseP(P, bl, rot, TOP);
      else if (bl.kind === 'apart') apartP(P, bl, TOP);
      else if (bl.kind === 'konbini') konbiniP(P, bl, rot, TOP);
      else if (bl.kind === 'hospital') hospitalP(P, bl, TOP);
      else if (bl.kind === 'police') policeP(P, bl, TOP);
      else if (bl.kind === 'station') stationP(P, bl, TOP);
      else if (bl.kind === 'machiya') machiyaP(P, bl, rot, TOP);
      else if (bl.kind === 'house-sengoku') houseSengokuP(P, bl, rot, TOP);
      else if (bl.kind === 'buke') bukeP(P, bl, rot, TOP);
      else if (bl.kind === 'shrine') jinjaP(P, bl, TOP);
      else if (bl.kind === 'tera') teraP(P, bl, TOP);
      else if (bl.kind === 'teraFort') teraFortP(P, bl, TOP);
      else if (bl.kind === 'suisha') suishaP(P, bl, TOP);
      else if (bl.kind === 'gate') gateP(P, bl);
      else bldgP(P, bl, TOP);
    }
    // 線路・踏切・駅のホーム
    for (const rl of data.rails) railP(P, rl, sengoku);
    // 木（幹＋丸い樹冠。大きい木は樹冠を2つ重ねて自然な形に）
    data.trees.forEach((tr, ti) => {
      const s = tr.s || 1, leaf = ti % 2 ? MAT.leaf : MAT.leaf2;
      P.push({ t: 'cyl', x: tr.x, y: 0.3 + 1.0 * s, z: tr.z, sx: 0.32 * s, sy: 2.0 * s, sz: 0.32 * s, c: MAT.trunk });
      P.push({ t: 'sphere', x: tr.x, y: 0.3 + 2.0 * s + 1.25 * s, z: tr.z, sx: 3.1 * s, sy: 2.7 * s, sz: 3.1 * s, c: leaf });
      if (s > 1.2) {
        const dx = (ti % 3 - 1) * 0.9 * s;
        P.push({ t: 'sphere', x: tr.x + dx, y: 0.3 + 2.0 * s + 2.3 * s, z: tr.z + 0.5 * s, sx: 1.9 * s, sy: 1.7 * s, sz: 1.9 * s, c: ti % 2 ? MAT.leaf2 : MAT.leaf });
      }
    });
    // 小物（ベンチ・井戸）
    for (const pr of data.props) {
      if (pr.kind === 'bench') {
        P.push({ t: 'box', x: pr.x, y: 0.75, z: pr.z, sx: 2.2, sy: 0.12, sz: 0.6, ry: pr.ry, c: MAT.bench });
        P.push({ t: 'box', x: pr.x, y: 0.5, z: pr.z, sx: 2.0, sy: 0.38, sz: 0.15, ry: pr.ry, c: MAT.bench });
      } else if (pr.kind === 'well') {
        P.push({ t: 'cyl', x: pr.x, y: 0.45, z: pr.z, sx: 1.1, sy: 0.9, sz: 1.1, c: MAT.stonePath });
        for (const sx of [-0.5, 0.5]) P.push({ t: 'box', x: pr.x + sx, y: 1.3, z: pr.z, sx: 0.12, sy: 1.6, sz: 0.12, c: MAT.trunk });
        P.push({ t: 'prism', x: pr.x, y: 2.1, z: pr.z, sx: 1.6, sy: 0.6, sz: 1.6, c: '#5a5048' });
      }
    }
    // 田畑（緑と土色の格子）
    data.paddies.forEach((pd, pi) => {
      if (!pd.plot) return;
      P.push({ t: 'box', x: pd.x, y: 0.05, z: pd.z, sx: pd.w, sy: 0.06, sz: pd.d, c: pi % 2 ? MAT.dirtLotR : '#6f8a4a' });
    });
    // 川と橋
    const riverC = sengoku ? MAT.riverMuddy : MAT.water, bridgeC = sengoku ? MAT.stonePath : MAT.asphalt;
    for (const rv of data.rivers) {
      P.push({ t: 'box', x: rv.x, y: 0.02, z: rv.z, sx: rv.w, sy: 0.16, sz: rv.len, c: riverC });
      for (const side of [-1, 1]) {
        const bankW = sengoku ? 4.2 : 2.8, bankH = sengoku ? 0.5 : 0.26, bankY = sengoku ? bankH / 2 + 0.01 : 0.13;
        P.push({ t: 'box', x: rv.x + side * (rv.w / 2 + bankW / 2), y: bankY, z: rv.z, sx: bankW, sy: bankH, sz: rv.len, c: MAT.bank });
      }
      for (const br of rv.bridges || []) {
        P.push({ t: 'box', x: rv.x, y: 0.14, z: br.z, sx: rv.w + 7, sy: 0.24, sz: br.width, c: bridgeC });
        for (const side of [-1, 1]) {
          P.push({ t: 'box', x: rv.x, y: 0.66, z: br.z + side * (br.width / 2 - 0.1), sx: rv.w + 7, sy: 0.8, sz: 0.14, c: sengoku ? MAT.trunk : MAT.walk });
        }
      }
    }
    // どぶ川
    for (const dt of data.ditches) {
      const len = dt.z1 - dt.z0, zc = (dt.z0 + dt.z1) / 2;
      P.push({ t: 'box', x: dt.x, y: 0.03, z: zc, sx: dt.w, sy: 0.1, sz: len, c: MAT.ditchWater });
    }
    // 道路の線（縦道路の上面0.12 / 横0.115 に合わせて浮かせる）
    for (const m of data.marks) {
      const y = m.dir === 'v' ? 0.13 : 0.125;
      if (m.kind === 'center') {
        if (m.dir === 'v') P.push({ t: 'box', x: m.x, y, z: m.z, sx: 0.25, sy: 0.02, sz: m.len, c: MAT.centerline });
        else P.push({ t: 'box', x: m.x, y, z: m.z, sx: m.len, sy: 0.02, sz: 0.25, c: MAT.centerline });
      } else { // 車線の白破線（3m塗り・3m空き）
        const n = Math.floor(m.len / 6);
        for (let k = 0; k < n; k++) {
          const p = -m.len / 2 + 3 + k * 6;
          if (m.dir === 'v') P.push({ t: 'box', x: m.x, y, z: m.z + p, sx: 0.18, sy: 0.02, sz: 3, c: MAT.laneline });
          else P.push({ t: 'box', x: m.x + p, y, z: m.z, sx: 3, sy: 0.02, sz: 0.18, c: MAT.laneline });
        }
      }
    }
    // 横断歩道（ゼブラ: 道路の進行方向に長い白バーを並べる）
    for (const cw of data.crossings) {
      const n = Math.floor(cw.span / 0.95);
      const y = cw.dir === 'v' ? 0.135 : 0.13;
      for (let k = 0; k < n; k++) {
        const p = -cw.span / 2 + 0.5 + k * 0.95;
        if (cw.dir === 'v') P.push({ t: 'box', x: cw.x + p, y, z: cw.z, sx: 0.45, sy: 0.02, sz: 2.6, c: MAT.stripe });
        else P.push({ t: 'box', x: cw.x, y, z: cw.z + p, sx: 2.6, sy: 0.02, sz: 0.45, c: MAT.stripe });
      }
    }
    // 信号機（対角2本の柱、それぞれ縦横の道路へ腕を伸ばす）
    for (const s of data.signals) signalP(P, s);
    // 電柱と電線
    for (const p of data.poles) {
      P.push({ t: 'cyl', x: p.x, y: 0.3 + 4.4, z: p.z, sx: 0.34, sy: 8.8, sz: 0.34, c: MAT.pole });
      if (p.dir === 'v') P.push({ t: 'box', x: p.x, y: 8.75, z: p.z, sx: 2.0, sy: 0.14, sz: 0.14, c: MAT.pole });
      else P.push({ t: 'box', x: p.x, y: 8.75, z: p.z, sx: 0.14, sy: 0.14, sz: 2.0, c: MAT.pole });
      if (p.trafo) P.push({ t: 'box', x: p.x + (p.dir === 'v' ? 0.55 : 0), y: 7.0, z: p.z + (p.dir === 'v' ? 0 : 0.55), sx: 0.8, sy: 1.15, sz: 0.7, c: MAT.trafo });
    }
    for (const w of data.wires) {
      const dx = w.x2 - w.x1, dz = w.z2 - w.z1;
      const len = Math.hypot(dx, dz), mx = (w.x1 + w.x2) / 2, mz = (w.z1 + w.z2) / 2;
      const ry = Math.atan2(dx, dz);
      const side = dz !== 0 ? 'v' : 'h'; // 腕金の向きに合わせて2本＋下に1本
      for (const o2 of [-0.7, 0.7]) {
        P.push({ t: 'box', x: mx + (side === 'v' ? o2 : 0), y: 8.68, z: mz + (side === 'v' ? 0 : o2), sx: 0.06, sy: 0.05, sz: len, ry, c: MAT.wire });
      }
      P.push({ t: 'box', x: mx, y: 8.0, z: mz, sx: 0.06, sy: 0.05, sz: len, ry, c: MAT.wire });
    }
    // 持ち込んだ城（mesh プリミティブ）。形状本体は data.assets が持ち、ここでは参照のみ
    for (const pl of (data.placements || [])) {
      P.push({ t: 'mesh', asset: pl.asset, x: pl.x, y: 0, z: pl.z, ry: pl.ry || 0, s: pl.scale || 1 });
    }
    const west = data.rails.length ? 32 : 0, east = data.rivers.length ? 22 : 0;
    const bounds = { cx: (W + east - west) / 2, cz: H / 2, r: Math.hypot(W + west + east, H) / 2 };
    for (const pl of (data.placements || [])) {
      const a = (data.assets || [])[pl.asset]; if (!a || !a.size) continue;
      const rr = Math.hypot(pl.x - bounds.cx, pl.z - bounds.cz) + Math.max(a.size.w, a.size.d) * (pl.scale || 1) / 2;
      if (rr > bounds.r) bounds.r = rr;
    }
    return { prims: P, bounds, assets: data.assets || [] };
  }

  // --- 信号機（1交差点=対角2本、各柱から縦横の道路上へ腕＋灯器）---
  function signalP(P, s) {
    for (const c of [{ cx: 1, cz: 1 }, { cx: -1, cz: -1 }]) {
      const px = s.x + c.cx * (s.wv / 2 + 0.9), pz = s.z + c.cz * (s.wh / 2 + 0.9);
      P.push({ t: 'cyl', x: px, y: 0.3 + 2.6, z: pz, sx: 0.32, sy: 5.2, sz: 0.32, c: MAT.sigpole });
      // 縦道路の上へ（x方向の腕）
      const av = s.wv / 2 + 1.4;
      P.push({ t: 'box', x: px - c.cx * av / 2, y: 5.35, z: pz, sx: av, sy: 0.12, sz: 0.12, c: MAT.sigpole });
      headP(P, px - c.cx * av, 4.95, pz, 'x');
      // 横道路の上へ（z方向の腕）
      const ah = s.wh / 2 + 1.4;
      P.push({ t: 'box', x: px, y: 5.35, z: pz - c.cz * ah / 2, sx: 0.12, sy: 0.12, sz: ah, c: MAT.sigpole });
      headP(P, px, 4.95, pz - c.cz * ah, 'z');
    }
  }
  // 灯器（横型3灯: 青・黄・赤。両面に灯を付けてどこから見ても信号らしく）
  function headP(P, x, y, z, along) {
    if (along === 'x') {
      P.push({ t: 'box', x, y, z, sx: 1.35, sy: 0.42, sz: 0.28, c: MAT.sighead });
      [MAT.sigG, MAT.sigY, MAT.sigR].forEach((col, k) => {
        for (const f of [-0.16, 0.16]) P.push({ t: 'box', x: x + (k - 1) * 0.42, y, z: z + f, sx: 0.26, sy: 0.26, sz: 0.06, c: col });
      });
    } else {
      P.push({ t: 'box', x, y, z, sx: 0.28, sy: 0.42, sz: 1.35, c: MAT.sighead });
      [MAT.sigG, MAT.sigY, MAT.sigR].forEach((col, k) => {
        for (const f of [-0.16, 0.16]) P.push({ t: 'box', x: x + f, y, z: z + (k - 1) * 0.42, sx: 0.06, sy: 0.26, sz: 0.26, c: col });
      });
    }
  }

  // --- 線路・踏切・ホーム ---
  function railP(P, rl, sengoku) {
    const len = rl.z1 - rl.z0, zc = (rl.z0 + rl.z1) / 2;
    P.push({ t: 'box', x: rl.x, y: 0.125, z: zc, sx: 5, sy: 0.25, sz: len, c: MAT.ballast });      // バラスト
    for (const sx of [-0.72, 0.72]) {                                                               // レール2本
      P.push({ t: 'box', x: rl.x + sx, y: 0.36, z: zc, sx: 0.12, sy: 0.18, sz: len, c: MAT.rail });
    }
    for (let z = rl.z0 + 1; z < rl.z1; z += 1.7) {                                                  // 枕木
      P.push({ t: 'box', x: rl.x, y: 0.27, z, sx: 2.3, sy: 0.06, sz: 0.45, c: MAT.sleeper });
    }
    // 踏切: 道路を線路の先まで延長＋渡り板＋遮断機
    for (const cr of rl.crossings || []) {
      const xw = rl.x - 8;
      const crossingRoadC = sengoku ? MAT.dirtRoad : MAT.asphalt;
      P.push({ t: 'box', x: (xw + cr.roadEndX) / 2, y: 0.055, z: cr.z, sx: cr.roadEndX - xw, sy: 0.12, sz: cr.width, c: crossingRoadC });
      P.push({ t: 'box', x: rl.x, y: 0.3, z: cr.z, sx: 5.6, sy: 0.07, sz: cr.width - 0.5, c: MAT.parking }); // 渡り板
      for (const s of [{ dx: 3.6, dz: 1 }, { dx: -3.6, dz: -1 }]) {                                  // 遮断機（対角2基）
        const gx = rl.x + s.dx, gz = cr.z + s.dz * (cr.width / 2 + 0.9);
        P.push({ t: 'cyl', x: gx, y: 1.55, z: gz, sx: 0.22, sy: 2.5, sz: 0.22, c: MAT.gateWhite });
        P.push({ t: 'box', x: gx, y: 2.65, z: gz, sx: 0.5, sy: 0.35, sz: 0.35, c: MAT.gateRed });    // 警報灯
        P.push({ t: 'box', x: gx, y: 1.1, z: gz - s.dz * cr.width / 4, sx: 0.12, sy: 0.12, sz: cr.width / 2, c: MAT.gateRed }); // 遮断棒
      }
    }
    // 駅のホーム（駅の裏、線路ぞい）＋屋根
    const pz = rl.stationZ, px = rl.x + 3.2;
    P.push({ t: 'box', x: px, y: 0.55, z: pz, sx: 2.8, sy: 1.1, sz: 30, c: MAT.platform });
    P.push({ t: 'box', x: px, y: 4.0, z: pz, sx: 3.2, sy: 0.15, sz: 26, c: MAT.parapet });          // ホーム屋根
    for (let k = -2; k <= 2; k++) {
      P.push({ t: 'cyl', x: px, y: 2.5, z: pz + k * 6, sx: 0.18, sy: 2.9, sz: 0.18, c: MAT.sigpole });
    }
  }

  // --- 駅舎（正面は街side=+x）---
  function stationP(P, bl, TOP) {
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h / 2, z: bl.z, sx: bl.w, sy: bl.h, sz: bl.d, c: MAT.stationWall });
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h + 0.18, z: bl.z, sx: bl.w + 0.3, sy: 0.36, sz: bl.d + 0.3, c: MAT.parapet });
    // 正面の大きなガラス＋青い駅名看板＋庇
    P.push({ t: 'box', x: bl.x + bl.w / 2 + 0.07, y: TOP + 2.2, z: bl.z, sx: 0.14, sy: 4.2, sz: bl.d * 0.62, c: MAT.storefront });
    P.push({ t: 'box', x: bl.x + bl.w / 2 + 0.12, y: TOP + bl.h - 1.1, z: bl.z, sx: 0.25, sy: 1.3, sz: bl.d * 0.72, c: MAT.stationSign });
    P.push({ t: 'box', x: bl.x + bl.w / 2 + 0.9, y: TOP + 4.7, z: bl.z, sx: 1.9, sy: 0.18, sz: bl.d * 0.68, c: MAT.canopy });
    // 2階の窓帯
    P.push({ t: 'box', x: bl.x, y: TOP + 5.6, z: bl.z, sx: bl.w + 0.1, sy: 1.1, sz: bl.d * 0.85, c: MAT.glass });
    // 駅前ロータリー（丸い島＋木）
    P.push({ t: 'cyl', x: bl.x + bl.w / 2 + 8, y: 0.34, z: bl.z, sx: 7, sy: 0.08, sz: 7, c: MAT.grassPark });
  }

  // --- 病院（白い大きな建物＋赤十字＋駐車場）---
  function hospitalP(P, bl, TOP) {
    P.push({ t: 'box', x: bl.lotX, y: 0.355, z: bl.lotZ, sx: bl.lotW * 0.94, sy: 0.05, sz: bl.lotD * 0.94, c: MAT.parking });
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h / 2, z: bl.z, sx: bl.w, sy: bl.h, sz: bl.d, c: MAT.hospWall });
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h + 0.18, z: bl.z, sx: bl.w + 0.3, sy: 0.36, sz: bl.d + 0.3, c: MAT.parapet });
    for (let f = 1; f < bl.floors; f++) {
      P.push({ t: 'box', x: bl.x, y: TOP + f * 3.4 + 1.7, z: bl.z, sx: bl.w + 0.1, sy: 1.2, sz: bl.d * 0.85, c: MAT.glass });
      P.push({ t: 'box', x: bl.x, y: TOP + f * 3.4 + 1.7, z: bl.z, sx: bl.w * 0.85, sy: 1.2, sz: bl.d + 0.1, c: MAT.glass });
    }
    // 正面(+z)の赤十字と玄関
    const fz = bl.z + bl.d / 2;
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h - 2.0, z: fz + 0.1, sx: 0.9, sy: 2.7, sz: 0.16, c: MAT.red });
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h - 2.0, z: fz + 0.1, sx: 2.7, sy: 0.9, sz: 0.16, c: MAT.red });
    P.push({ t: 'box', x: bl.x, y: TOP + 1.6, z: fz + 0.08, sx: Math.min(bl.w * 0.4, 7), sy: 3.2, sz: 0.24, c: MAT.entrance });
    P.push({ t: 'box', x: bl.x, y: TOP + 3.5, z: fz + 1.1, sx: Math.min(bl.w * 0.5, 9), sy: 0.25, sz: 2.4, c: MAT.canopy });
    // 駐車枠
    const stall = Math.min(5, (bl.lotZ + bl.lotD * 0.47 - fz) * 0.8);
    if (stall > 2) {
      const lz = fz + 1.6 + stall / 2, padW = bl.lotW * 0.7, n = Math.floor(padW / 2.7);
      for (let k = 0; k <= n; k++) {
        P.push({ t: 'box', x: bl.lotX - (n * 2.7) / 2 + k * 2.7, y: 0.39, z: lz, sx: 0.12, sy: 0.02, sz: stall, c: MAT.stripe });
      }
    }
  }

  // --- 警察署（紺の帯＋金の紋章＋赤色灯）---
  function policeP(P, bl, TOP) {
    P.push({ t: 'box', x: bl.lotX, y: 0.355, z: bl.lotZ, sx: bl.lotW * 0.94, sy: 0.05, sz: bl.lotD * 0.94, c: MAT.parking });
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h / 2, z: bl.z, sx: bl.w, sy: bl.h, sz: bl.d, c: MAT.policeWall });
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h + 0.15, z: bl.z, sx: bl.w + 0.25, sy: 0.3, sz: bl.d + 0.25, c: MAT.parapet });
    for (let f = 1; f < bl.floors; f++) {
      P.push({ t: 'box', x: bl.x, y: TOP + f * 3.3 + 1.6, z: bl.z, sx: bl.w + 0.1, sy: 1.15, sz: bl.d * 0.8, c: MAT.glass });
    }
    const fz = bl.z + bl.d / 2;
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h - 0.75, z: fz + 0.1, sx: bl.w * 0.96, sy: 1.0, sz: 0.16, c: MAT.policeBand }); // 紺の帯
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h - 0.75, z: fz + 0.2, sx: 0.8, sy: 0.8, sz: 0.1, c: MAT.gold });               // 紋章
    P.push({ t: 'box', x: bl.x, y: TOP + 1.5, z: fz + 0.08, sx: 3.2, sy: 3.0, sz: 0.2, c: MAT.entrance });
    // 玄関前の赤色灯2本
    for (const s of [-1, 1]) {
      P.push({ t: 'cyl', x: bl.x + s * 3.2, y: TOP + 1.5, z: fz + 2.2, sx: 0.16, sy: 3.0, sz: 0.16, c: MAT.sigpole });
      P.push({ t: 'sphere', x: bl.x + s * 3.2, y: TOP + 3.2, z: fz + 2.2, sx: 0.42, sy: 0.42, sz: 0.42, c: MAT.red });
    }
  }

  // --- オフィスビル ---
  function bldgP(P, bl, TOP) {
    const fh = FLOOR_H;
    // 本体（セットバック=上層が細くなる2段構成）
    const lowFloors = bl.setback ? Math.max(2, Math.ceil(bl.floors * 0.55)) : bl.floors;
    const lowH = bl.setback ? lowFloors * fh + 0.4 : bl.h;
    const upW = bl.w * 0.68, upD = bl.d * 0.68;
    const bodyC = bl.style === 'curtain' ? bl.glass : bl.color;
    P.push({ t: 'box', x: bl.x, y: TOP + lowH / 2, z: bl.z, sx: bl.w, sy: lowH, sz: bl.d, c: bodyC });
    P.push({ t: 'box', x: bl.x, y: TOP + lowH + 0.18, z: bl.z, sx: bl.w + 0.3, sy: 0.36, sz: bl.d + 0.3, c: MAT.parapet });
    let roofY = TOP + lowH, roofW = bl.w, roofD = bl.d;
    if (bl.setback) {
      const upH = bl.h - lowH;
      P.push({ t: 'box', x: bl.x, y: TOP + lowH + upH / 2, z: bl.z, sx: upW, sy: upH, sz: upD, c: bodyC });
      P.push({ t: 'box', x: bl.x, y: TOP + bl.h + 0.18, z: bl.z, sx: upW + 0.3, sy: 0.36, sz: upD + 0.3, c: MAT.parapet });
      roofY = TOP + bl.h; roofW = upW; roofD = upD;
    }
    // 窓
    const winSeg = (y, w, d) => {
      P.push({ t: 'box', x: bl.x, y, z: bl.z, sx: w + 0.12, sy: 1.25, sz: d * 0.8, c: MAT.glass });
      P.push({ t: 'box', x: bl.x, y, z: bl.z, sx: w * 0.8, sy: 1.25, sz: d + 0.12, c: MAT.glass });
    };
    const mullSeg = (y, w, d) => { // カーテンウォールは逆に「白い桟」を巻く
      P.push({ t: 'box', x: bl.x, y, z: bl.z, sx: w + 0.1, sy: 0.16, sz: d + 0.1, c: MAT.mullion });
    };
    for (let f = 1; f < bl.floors; f++) {
      const inUpper = bl.setback && f >= lowFloors;
      const w = inUpper ? upW : bl.w, d = inUpper ? upD : bl.d;
      if (bl.style === 'curtain') mullSeg(TOP + f * fh, w, d);       // 階の境目に白い桟
      else winSeg(TOP + f * fh + fh * 0.62, w, d);                    // 2階以上に窓帯
    }
    if (bl.style === 'curtain') { // 四隅の柱で引き締める
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        P.push({ t: 'box', x: bl.x + sx * (bl.w / 2 - 0.25), y: TOP + lowH / 2, z: bl.z + sz * (bl.d / 2 - 0.25), sx: 0.5, sy: lowH, sz: 0.5, c: MAT.mullion });
      }
    }
    // 1階エントランス（正面 +z）: ガラスの出入口 + 庇
    P.push({ t: 'box', x: bl.x, y: TOP + 1.4, z: bl.z + bl.d / 2 + 0.08, sx: Math.min(bl.w * 0.42, 5.5), sy: 2.8, sz: 0.3, c: MAT.entrance });
    P.push({ t: 'box', x: bl.x, y: TOP + 3.0, z: bl.z + bl.d / 2 + 0.55, sx: Math.min(bl.w * 0.5, 6.5), sy: 0.22, sz: 1.3, c: MAT.canopy });
    // 屋上設備
    if (bl.equip) {
      P.push({ t: 'box', x: bl.x + bl.eqx * roofW, y: roofY + 1.0, z: bl.z + bl.eqz * roofD, sx: roofW * 0.28, sy: 2.0, sz: roofD * 0.24, c: MAT.equip });
      P.push({ t: 'box', x: bl.x - bl.eqx * roofW * 0.7, y: roofY + 0.7, z: bl.z - bl.eqz * roofD * 0.9, sx: roofW * 0.14, sy: 1.4, sz: roofD * 0.14, c: MAT.equip });
    }
    // 1階が店: テント庇＋縦の袖看板
    if (bl.sign) {
      P.push({ t: 'box', x: bl.x, y: TOP + 3.1, z: bl.z + bl.d / 2 + 0.35, sx: bl.w * 0.88, sy: 0.5, sz: 1.0, c: bl.sign.c });
      P.push({ t: 'box', x: bl.x + bl.sign.side * (bl.w / 2 - 0.4), y: TOP + 5.6, z: bl.z + bl.d / 2 + 0.45, sx: 0.7, sy: 2.8, sz: 0.2, c: bl.sign.c });
    }
  }

  // --- コンビニ（白い平屋＋ブランド色の帯看板＋ガラス正面＋駐車場）---
  function konbiniP(P, bl, rot, TOP) {
    // 敷地は建物以外ぜんぶ駐車場（全面アスファルト＋店の前に駐車線）
    if (bl.lotW) {
      const f = Math.cos(bl.ry || 0) >= 0 ? 1 : -1; // 正面の向き（±z）
      P.push({ t: 'box', x: bl.lotX, y: 0.36, z: bl.lotZ, sx: bl.lotW * 0.94, sy: 0.05, sz: bl.lotD * 0.94, c: MAT.parking });
      // 店の正面に頭から突っ込む駐車枠
      const avail = bl.lotD * 0.47 - f * (bl.z - bl.lotZ) - bl.d / 2; // 店の前の空き奥行き
      const stall = Math.min(5, avail * 0.8);
      if (stall > 2) {
        const lz = bl.z + f * (bl.d / 2 + 0.4 + stall / 2);
        const padW = bl.lotW * 0.85, n = Math.floor(padW / 2.7);
        for (let k = 0; k <= n; k++) {
          P.push({ t: 'box', x: bl.lotX - (n * 2.7) / 2 + k * 2.7, y: 0.395, z: lz, sx: 0.12, sy: 0.02, sz: stall, c: MAT.stripe });
        }
      }
    }
    // 本体・帯看板・屋上の縁
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h / 2, z: bl.z, sx: bl.w, sy: bl.h, sz: bl.d, ry: bl.ry, c: MAT.konbiniWall });
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h - 0.45, z: bl.z, sx: bl.w + 0.22, sy: 0.75, sz: bl.d + 0.22, ry: bl.ry, c: bl.brand });
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h + 0.12, z: bl.z, sx: bl.w + 0.15, sy: 0.24, sz: bl.d + 0.15, ry: bl.ry, c: MAT.parapet });
    // 正面ガラス＋ドア
    const g = rot(bl, 0, bl.d / 2 + 0.07);
    P.push({ t: 'box', x: g.x, y: TOP + 1.35, z: g.z, sx: bl.w * 0.86, sy: 2.5, sz: 0.12, ry: bl.ry, c: MAT.storefront });
    const dr = rot(bl, bl.w * 0.28, bl.d / 2 + 0.14);
    P.push({ t: 'box', x: dr.x, y: TOP + 1.15, z: dr.z, sx: 1.6, sy: 2.3, sz: 0.08, ry: bl.ry, c: MAT.glass });
  }

  // --- アパート（ベランダつき）---
  function apartP(P, bl, TOP) {
    const fh = 2.9;
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h / 2, z: bl.z, sx: bl.w, sy: bl.h, sz: bl.d, c: bl.color });
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h + 0.15, z: bl.z, sx: bl.w + 0.25, sy: 0.3, sz: bl.d + 0.25, c: MAT.parapet });
    const bz = bl.z + bl.d / 2; // 正面 +z にベランダ
    for (let f = 0; f < bl.floors; f++) {
      const fy = TOP + f * fh;
      P.push({ t: 'box', x: bl.x, y: fy + fh * 0.55, z: bz + 0.05, sx: bl.w * 0.9, sy: 1.35, sz: 0.1, c: MAT.glass });     // 掃き出し窓
      P.push({ t: 'box', x: bl.x, y: fy + 0.06, z: bz + 0.55, sx: bl.w * 0.96, sy: 0.12, sz: 1.1, c: MAT.balcony });       // 床
      P.push({ t: 'box', x: bl.x, y: fy + 0.62, z: bz + 1.05, sx: bl.w * 0.96, sy: 1.0, sz: 0.08, c: MAT.balcony });       // 手すり
    }
    // 背面の窓帯と外階段
    for (let f = 0; f < bl.floors; f++) {
      P.push({ t: 'box', x: bl.x, y: TOP + f * fh + fh * 0.55, z: bl.z - bl.d / 2 - 0.05, sx: bl.w * 0.8, sy: 1.1, sz: 0.1, c: MAT.glass });
    }
    P.push({ t: 'box', x: bl.x + bl.w / 2 + 0.7, y: TOP + bl.h / 2, z: bl.z - bl.d * 0.2, sx: 1.4, sy: bl.h, sz: 2.6, c: MAT.parapet });
  }

  // --- 一軒家（庭・塀・玄関・窓つき）---
  function houseP(P, bl, rot, TOP) {
    // 庭（芝生パッド。敷地よりひと回り小さい）
    if (bl.lotW) P.push({ t: 'box', x: bl.x, y: TOP + 0.03, z: bl.z, sx: bl.lotW * 0.86, sy: 0.06, sz: bl.lotD * 0.86, c: MAT.grass });
    // 本体と屋根
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h / 2, z: bl.z, sx: bl.w, sy: bl.h, sz: bl.d, ry: bl.ry, c: bl.color });
    P.push({ t: 'prism', x: bl.x, y: TOP + bl.h, z: bl.z, sx: bl.w + 0.9, sy: Math.max(1.6, bl.w * 0.28), sz: bl.d + 0.9, ry: bl.ry, c: bl.roof });
    // 玄関（正面=ローカル+z）と窓
    const door = rot(bl, bl.w * 0.24, bl.d / 2 + 0.07);
    P.push({ t: 'box', x: door.x, y: TOP + 1.05, z: door.z, sx: 1.0, sy: 2.1, sz: 0.14, ry: bl.ry, c: MAT.door });
    for (let f = 0; f < bl.floors; f++) {
      const win = rot(bl, -bl.w * 0.2, bl.d / 2 + 0.06);
      P.push({ t: 'box', x: win.x, y: TOP + f * 3.0 + 1.6, z: win.z, sx: 1.7, sy: 1.15, sz: 0.12, ry: bl.ry, c: MAT.glass });
    }
    // ブロック塀（玄関が向いている側に出入口の切れ目）
    if (bl.fence && bl.lotW) {
      const fw = bl.lotW * 0.9, fd = bl.lotD * 0.9, fy = TOP + 0.55, fh2 = 1.1, t = 0.14;
      const gate = 2.2;
      const gateOnX = Math.abs((bl.ry || 0) - Math.PI / 2) < 0.01; // 家が90度回転→玄関は+x側
      if (gateOnX) {
        P.push({ t: 'box', x: bl.x, y: fy, z: bl.z - fd / 2, sx: fw + t, sy: fh2, sz: t, c: MAT.fence });                // 裏
        P.push({ t: 'box', x: bl.x, y: fy, z: bl.z + fd / 2, sx: fw + t, sy: fh2, sz: t, c: MAT.fence });                // 前
        P.push({ t: 'box', x: bl.x - fw / 2, y: fy, z: bl.z, sx: t, sy: fh2, sz: fd + t, c: MAT.fence });                // 左
        const seg = (fd - gate) / 2;                                                                                      // 右（門）
        P.push({ t: 'box', x: bl.x + fw / 2, y: fy, z: bl.z - (gate / 2 + seg / 2), sx: t, sy: fh2, sz: seg, c: MAT.fence });
        P.push({ t: 'box', x: bl.x + fw / 2, y: fy, z: bl.z + (gate / 2 + seg / 2), sx: t, sy: fh2, sz: seg, c: MAT.fence });
      } else {
        P.push({ t: 'box', x: bl.x, y: fy, z: bl.z - fd / 2, sx: fw + t, sy: fh2, sz: t, c: MAT.fence });                // 裏
        P.push({ t: 'box', x: bl.x - fw / 2, y: fy, z: bl.z, sx: t, sy: fh2, sz: fd + t, c: MAT.fence });                // 左
        P.push({ t: 'box', x: bl.x + fw / 2, y: fy, z: bl.z, sx: t, sy: fh2, sz: fd + t, c: MAT.fence });                // 右
        const seg = (fw - gate) / 2;                                                                                      // 前（門）
        P.push({ t: 'box', x: bl.x - (gate / 2 + seg / 2), y: fy, z: bl.z + fd / 2, sx: seg, sy: fh2, sz: t, c: MAT.fence });
        P.push({ t: 'box', x: bl.x + (gate / 2 + seg / 2), y: fy, z: bl.z + fd / 2, sx: seg, sy: fh2, sz: t, c: MAT.fence });
      }
    }
  }

  // --- 町家（瓦屋根・格子・暖簾）---
  const MACHIYA_ROOF_GEOM = {
    tile: { overhang: 0.6, slope: 0.22, minH: 1.2 },
    shingle: { overhang: 0.4, slope: 0.18, minH: 0.9 },
  };
  function machiyaP(P, bl, rot, TOP) {
    const wallC = bl.color, roofC = bl.roof;
    const geom = MACHIYA_ROOF_GEOM[bl.roofStyle] || MACHIYA_ROOF_GEOM.tile;
    const roofH = Math.max(geom.minH, bl.w * geom.slope);
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h / 2, z: bl.z, sx: bl.w, sy: bl.h, sz: bl.d, ry: bl.ry, c: wallC });
    P.push({ t: 'prism', x: bl.x, y: TOP + bl.h, z: bl.z, sx: bl.w + geom.overhang, sy: roofH, sz: bl.d + geom.overhang, ry: bl.ry, c: roofC });
    roofRidgeP(P, bl, rot, TOP, roofH, geom, bl.roofStyle, roofC);
    // 暖簾（正面=ローカル+z）
    const noren = rot(bl, 0, bl.d / 2 + 0.05);
    P.push({ t: 'box', x: noren.x, y: TOP + bl.h * 0.5, z: noren.z, sx: bl.w * 0.5, sy: bl.h * 0.42, sz: 0.06, ry: bl.ry, c: MAT.gateRed });
    // 格子窓（正面）
    const win = rot(bl, -bl.w * 0.25, bl.d / 2 + 0.05);
    P.push({ t: 'box', x: win.x, y: TOP + bl.h * 0.6, z: win.z, sx: bl.w * 0.22, sy: bl.h * 0.32, sz: 0.05, ry: bl.ry, c: MAT.door });
    // 窓帯（4面。ry回転込みで2つの箱を交差させる）
    const winY2 = TOP + bl.h * 0.62, winH2 = 0.6;
    P.push({ t: 'box', x: bl.x, y: winY2, z: bl.z, sx: bl.w + 0.1, sy: winH2, sz: bl.d * 0.5, ry: bl.ry, c: MAT.lattice });
    P.push({ t: 'box', x: bl.x, y: winY2, z: bl.z, sx: bl.w * 0.5, sy: winH2, sz: bl.d + 0.1, ry: bl.ry, c: MAT.lattice });
  }

  // --- 屋根の棟飾り（屋根タイプでシルエットを作り分ける。ry回転のみ対応のため横向き円柱は使わない）---
  function roofRidgeP(P, bl, rot, TOP, roofH, geom, roofStyle, roofC) {
    const peakY = TOP + bl.h + roofH;
    const ridgeLen = bl.d + geom.overhang;
    if (roofStyle === 'thatch') {
      // 引き伸ばした球で丸みのある棟を表現
      P.push({ t: 'sphere', x: bl.x, y: peakY, z: bl.z, sx: 0.55, sy: 0.5, sz: ridgeLen * 0.8, ry: bl.ry, c: roofC });
    } else if (roofStyle === 'tile') {
      // 段違いの箱2段で熨斗瓦を積んだ棟を表現
      P.push({ t: 'box', x: bl.x, y: peakY + 0.12, z: bl.z, sx: bl.w * 0.18, sy: 0.24, sz: ridgeLen * 0.65, ry: bl.ry, c: MAT.ridgeTile });
      P.push({ t: 'box', x: bl.x, y: peakY + 0.32, z: bl.z, sx: bl.w * 0.11, sy: 0.2, sz: ridgeLen * 0.45, ry: bl.ry, c: MAT.ridgeTile });
    } else if (roofStyle === 'shingle') {
      // 石置き屋根の石を棟に沿って点在させる
      const n = 4, span = ridgeLen * 0.7;
      for (let i = 0; i < n; i++) {
        const dz = (i / (n - 1) - 0.5) * span;
        const p = rot(bl, 0, dz);
        P.push({ t: 'sphere', x: p.x, y: peakY + 0.15, z: p.z, sx: 0.32, sy: 0.28, sz: 0.32, c: MAT.stonePath });
      }
    }
  }

  // --- 住居（藁葺き/瓦葺き/板葺きの3タイプ）---
  const ROOF_GEOM = {
    thatch: { overhang: 1.1, slope: 0.32, minH: 1.4 },
    tile: { overhang: 0.5, slope: 0.22, minH: 1.1 },
    shingle: { overhang: 0.7, slope: 0.20, minH: 0.9 },
  };
  // 敷地を囲む塀（門の切れ目つき）。ryに応じて門を建物の正面側に配置する
  function fenceP(P, bl, fw, fd, fy, fh2, t, gateW, color) {
    const ry = bl.ry || 0;
    const fsin = Math.sin(ry), fcos = Math.cos(ry);
    const gateOnX = Math.abs(fsin) > Math.abs(fcos);
    const gatePos = gateOnX ? fsin > 0 : fcos > 0;
    if (gateOnX) {
      P.push({ t: 'box', x: bl.x, y: fy, z: bl.z - fd / 2, sx: fw + t, sy: fh2, sz: t, c: color });
      P.push({ t: 'box', x: bl.x, y: fy, z: bl.z + fd / 2, sx: fw + t, sy: fh2, sz: t, c: color });
      const seg = (fd - gateW) / 2;
      const gx = gatePos ? bl.x + fw / 2 : bl.x - fw / 2;
      P.push({ t: 'box', x: gx, y: fy, z: bl.z - (gateW / 2 + seg / 2), sx: t, sy: fh2, sz: seg, c: color });
      P.push({ t: 'box', x: gx, y: fy, z: bl.z + (gateW / 2 + seg / 2), sx: t, sy: fh2, sz: seg, c: color });
      const otherX = gatePos ? bl.x - fw / 2 : bl.x + fw / 2;
      P.push({ t: 'box', x: otherX, y: fy, z: bl.z, sx: t, sy: fh2, sz: fd + t, c: color });
    } else {
      P.push({ t: 'box', x: bl.x - fw / 2, y: fy, z: bl.z, sx: t, sy: fh2, sz: fd + t, c: color });
      P.push({ t: 'box', x: bl.x + fw / 2, y: fy, z: bl.z, sx: t, sy: fh2, sz: fd + t, c: color });
      const seg = (fw - gateW) / 2;
      const gz = gatePos ? bl.z + fd / 2 : bl.z - fd / 2;
      P.push({ t: 'box', x: bl.x - (gateW / 2 + seg / 2), y: fy, z: gz, sx: seg, sy: fh2, sz: t, c: color });
      P.push({ t: 'box', x: bl.x + (gateW / 2 + seg / 2), y: fy, z: gz, sx: seg, sy: fh2, sz: t, c: color });
      const otherZ = gatePos ? bl.z - fd / 2 : bl.z + fd / 2;
      P.push({ t: 'box', x: bl.x, y: fy, z: otherZ, sx: fw + t, sy: fh2, sz: t, c: color });
    }
  }

  function houseSengokuP(P, bl, rot, TOP) {
    const wallC = bl.color, roofC = bl.roof;
    const geom = ROOF_GEOM[bl.roofStyle] || ROOF_GEOM.thatch;
    const roofH = Math.max(geom.minH, bl.w * geom.slope);
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h / 2, z: bl.z, sx: bl.w, sy: bl.h, sz: bl.d, ry: bl.ry, c: wallC });
    P.push({ t: 'prism', x: bl.x, y: TOP + bl.h, z: bl.z, sx: bl.w + geom.overhang, sy: roofH, sz: bl.d + geom.overhang, ry: bl.ry, c: roofC });
    roofRidgeP(P, bl, rot, TOP, roofH, geom, bl.roofStyle, roofC);
    const door = rot(bl, 0, bl.d / 2 + 0.06);
    P.push({ t: 'box', x: door.x, y: TOP + 0.9, z: door.z, sx: 0.9, sy: 1.8, sz: 0.12, ry: bl.ry, c: MAT.door });
    // 窓帯（4面）
    const winY2 = TOP + bl.h * 0.55, winH2 = 0.7;
    P.push({ t: 'box', x: bl.x, y: winY2, z: bl.z, sx: bl.w + 0.1, sy: winH2, sz: bl.d * 0.55, ry: bl.ry, c: MAT.lattice });
    P.push({ t: 'box', x: bl.x, y: winY2, z: bl.z, sx: bl.w * 0.55, sy: winH2, sz: bl.d + 0.1, ry: bl.ry, c: MAT.lattice });
    // 敷地の低い木柵（門の切れ目つき、木色で低め）
    if (bl.fence && bl.lotW) {
      fenceP(P, bl, bl.lotW * 0.92, bl.lotD * 0.92, TOP + 0.45, 0.9, 0.12, 2.0, MAT.trunk);
    }
  }

  // --- 武家屋敷（塀で囲った大きめの屋敷）---
  const BUKE_ROOF_GEOM = {
    tile: { overhang: 1.0, slope: 0.20, minH: 2.2 },
    thatch: { overhang: 0.8, slope: 0.30, minH: 1.5 },
  };
  function bukeP(P, bl, rot, TOP) {
    const wallC = bl.color, roofC = bl.roof;
    const geom = BUKE_ROOF_GEOM[bl.roofStyle] || BUKE_ROOF_GEOM.tile;
    const roofH = Math.max(geom.minH, bl.w * geom.slope);
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h / 2, z: bl.z, sx: bl.w, sy: bl.h, sz: bl.d, ry: bl.ry, c: wallC });
    P.push({ t: 'prism', x: bl.x, y: TOP + bl.h, z: bl.z, sx: bl.w + geom.overhang, sy: roofH, sz: bl.d + geom.overhang, ry: bl.ry, c: roofC });
    roofRidgeP(P, bl, rot, TOP, roofH, geom, bl.roofStyle, roofC);
    const gate = rot(bl, 0, bl.d / 2 + 0.06);
    P.push({ t: 'box', x: gate.x, y: TOP + 1.1, z: gate.z, sx: 1.3, sy: 2.2, sz: 0.14, ry: bl.ry, c: MAT.door });
    // 窓帯（4面）
    const winY2 = TOP + bl.h * 0.5, winH2 = 0.8;
    P.push({ t: 'box', x: bl.x, y: winY2, z: bl.z, sx: bl.w + 0.1, sy: winH2, sz: bl.d * 0.45, ry: bl.ry, c: MAT.lattice });
    P.push({ t: 'box', x: bl.x, y: winY2, z: bl.z, sx: bl.w * 0.45, sy: winH2, sz: bl.d + 0.1, ry: bl.ry, c: MAT.lattice });
    // 敷地を囲む塀（門の切れ目つき）
    if (bl.lotW) {
      fenceP(P, bl, bl.lotW * 0.94, bl.lotD * 0.94, TOP + 0.7, 1.4, 0.16, 2.6, MAT.fence);
    }
  }

  // --- 神社（鳥居＋拝殿）---
  function jinjaP(P, bl, TOP) {
    const toriiZ = bl.lotZ + bl.lotD * 0.42;
    for (const side of [-1, 1]) {
      P.push({ t: 'cyl', x: bl.x + side * 2.2, y: TOP + 1.6, z: toriiZ, sx: 0.28, sy: 3.2, sz: 0.28, c: MAT.gateRed });
    }
    P.push({ t: 'box', x: bl.x, y: TOP + 3.15, z: toriiZ, sx: 5.2, sy: 0.3, sz: 0.3, c: MAT.gateRed });
    P.push({ t: 'box', x: bl.x, y: TOP + 3.55, z: toriiZ, sx: 5.8, sy: 0.24, sz: 0.36, c: MAT.gateWhite });
    // 拝殿
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h / 2, z: bl.z, sx: bl.w, sy: bl.h, sz: bl.d, c: MAT.gateWhite });
    P.push({ t: 'prism', x: bl.x, y: TOP + bl.h, z: bl.z, sx: bl.w + 1.0, sy: Math.max(1.6, bl.w * 0.3), sz: bl.d + 1.0, c: '#3d4a3e' });
  }

  // --- 寺（通常。本堂＋山門）---
  function teraP(P, bl, TOP) {
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h / 2, z: bl.z, sx: bl.w, sy: bl.h, sz: bl.d, c: '#6b5a3f' });
    P.push({ t: 'prism', x: bl.x, y: TOP + bl.h, z: bl.z, sx: bl.w + 1.4, sy: Math.max(2.2, bl.w * 0.3), sz: bl.d + 1.4, c: '#2f3a30' });
    const gateZ = bl.lotZ + bl.lotD * 0.42;
    for (const side of [-1, 1]) {
      P.push({ t: 'box', x: bl.x + side * 2.6, y: TOP + 1.6, z: gateZ, sx: 0.6, sy: 3.2, sz: 0.6, c: '#4a3a2c' });
    }
    P.push({ t: 'box', x: bl.x, y: TOP + 3.3, z: gateZ, sx: 6.0, sy: 0.5, sz: 0.9, c: '#2f3a30' });
  }

  // --- 寺(要塞化・本願寺タイプ): 本堂＋土塀＋堀＋四隅見張り櫓＋大仏＋石畳参道 ---
  function teraFortP(P, bl, TOP) {
    // 本堂（金と朱を効かせる）
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h / 2, z: bl.z, sx: bl.w, sy: bl.h, sz: bl.d, c: MAT.gateRed });
    P.push({ t: 'prism', x: bl.x, y: TOP + bl.h, z: bl.z, sx: bl.w + 1.2, sy: Math.max(2.0, bl.w * 0.32), sz: bl.d + 1.2, c: MAT.gold });

    const wallW = bl.lotW * 0.86, wallD = bl.lotD * 0.86, wy = TOP + 1.0, wh = 2.0, wt = 0.3;
    const gateW = 3.2, gateZ = bl.lotZ + wallD / 2;

    // 土塀（正面=+z に山門の切れ目）
    P.push({ t: 'box', x: bl.lotX, y: wy, z: bl.lotZ - wallD / 2, sx: wallW + wt, sy: wh, sz: wt, c: MAT.stonePath });
    P.push({ t: 'box', x: bl.lotX - wallW / 2, y: wy, z: bl.lotZ, sx: wt, sy: wh, sz: wallD + wt, c: MAT.stonePath });
    P.push({ t: 'box', x: bl.lotX + wallW / 2, y: wy, z: bl.lotZ, sx: wt, sy: wh, sz: wallD + wt, c: MAT.stonePath });
    const segX = (wallW - gateW) / 2;
    P.push({ t: 'box', x: bl.lotX - (gateW / 2 + segX / 2), y: wy, z: gateZ, sx: segX, sy: wh, sz: wt, c: MAT.stonePath });
    P.push({ t: 'box', x: bl.lotX + (gateW / 2 + segX / 2), y: wy, z: gateZ, sx: segX, sy: wh, sz: wt, c: MAT.stonePath });

    // 堀（壁の外周を囲む矩形リング、山門前に橋）
    const moatW = 2.4, ringW = wallW + 3.4, ringD = wallD + 3.4;
    for (const side of [-1, 1]) {
      P.push({ t: 'box', x: bl.lotX + side * (ringW / 2), y: 0.05, z: bl.lotZ, sx: moatW, sy: 0.14, sz: ringD, c: MAT.moatWater });
      P.push({ t: 'box', x: bl.lotX, y: 0.05, z: bl.lotZ + side * (ringD / 2), sx: ringW, sy: 0.14, sz: moatW, c: MAT.moatWater });
    }
    P.push({ t: 'box', x: bl.lotX, y: 0.16, z: gateZ + 1.5, sx: gateW, sy: 0.2, sz: 3.4, c: MAT.stonePath }); // 橋

    // 四隅見張り櫓（箱＋屋根の2段構成）
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tx = bl.lotX + sx * (wallW / 2), tz = bl.lotZ + sz * (wallD / 2);
      P.push({ t: 'box', x: tx, y: TOP + 1.4, z: tz, sx: 1.4, sy: 2.8, sz: 1.4, c: MAT.gateRed });
      P.push({ t: 'prism', x: tx, y: TOP + 2.8, z: tz, sx: 2.0, sy: 1.0, sz: 2.0, c: MAT.gold });
    }

    // 大仏（円柱の台座＋箱/球で簡略化した座像シルエット、青銅色）
    const bz = bl.lotZ - wallD * 0.22, bronzeC = '#5a6a52';
    P.push({ t: 'cyl', x: bl.lotX, y: 0.5, z: bz, sx: 2.2, sy: 1.0, sz: 2.2, c: MAT.stonePath }); // 台座
    P.push({ t: 'sphere', x: bl.lotX, y: 2.3, z: bz, sx: 1.7, sy: 1.6, sz: 1.7, c: bronzeC }); // 胴
    P.push({ t: 'sphere', x: bl.lotX, y: 3.5, z: bz, sx: 1.0, sy: 1.0, sz: 1.0, c: bronzeC }); // 頭

    // 石畳参道（山門から町の道へ）
    P.push({ t: 'box', x: bl.lotX, y: 0.02, z: gateZ + 3.5, sx: 3.0, sy: 0.05, sz: 4.0, c: MAT.stonePath });
  }

  // --- 水車小屋（小屋＋回転する水車）---
  function suishaP(P, bl, TOP) {
    P.push({ t: 'box', x: bl.x, y: TOP + bl.h / 2, z: bl.z, sx: bl.w, sy: bl.h, sz: bl.d, c: '#8a7355' });
    P.push({ t: 'prism', x: bl.x, y: TOP + bl.h, z: bl.z, sx: bl.w + 0.5, sy: 1.2, sz: bl.d + 0.5, c: '#5a5048' });
    // 水車（円柱を薄い円盤状に）
    P.push({ t: 'cyl', x: bl.x - bl.w / 2 - 0.9, y: TOP + 1.8, z: bl.z, sx: 3.4, sy: 0.3, sz: 3.4, c: '#6d5638' });
  }

  // --- 木戸（町境の木の門）---
  function gateP(P, bl) {
    const span = bl.w + 1.5, postH = 3.4;
    for (const side of [-1, 1]) {
      if (bl.dir === 'v') P.push({ t: 'box', x: bl.x, y: postH / 2, z: bl.z + side * span / 2, sx: 0.4, sy: postH, sz: 0.4, c: MAT.trunk });
      else P.push({ t: 'box', x: bl.x + side * span / 2, y: postH / 2, z: bl.z, sx: 0.4, sy: postH, sz: 0.4, c: MAT.trunk });
    }
    if (bl.dir === 'v') P.push({ t: 'box', x: bl.x, y: postH + 0.3, z: bl.z, sx: 0.5, sy: 0.5, sz: span + 0.6, c: MAT.trunk });
    else P.push({ t: 'box', x: bl.x, y: postH + 0.3, z: bl.z, sx: span + 0.6, sy: 0.5, sz: 0.5, c: MAT.trunk });
  }

  // ============================================================
  // makeBuilding(kind, x, z, r) → 建物1棟
  // 配置モードのパレットから追加する建物をつくる。rは0〜1を返す乱数関数。
  // ※generate()からは呼ばない（既存のr()呼び出し順を変えないため）
  // ============================================================
  function makeBuilding(kind, x, z, r) {
    const pick = arr => arr[Math.floor(r() * arr.length) % arr.length];
    if (kind === 'machiya') {
      const floors = 1 + (r() < 0.3 ? 1 : 0);
      const roofStyle = r() < 0.8 ? 'tile' : 'shingle';
      return {
        x, z, w: 7.5, d: 8, floors, h: floors * 2.7, kind, ry: 0,
        color: pick(MACHIYA_WALL_COLORS),
        roof: pick(roofStyle === 'tile' ? MACHIYA_ROOF_COLORS : MACHIYA_SHINGLE_COLORS),
        roofStyle,
      };
    }
    if (kind === 'buke') {
      const roofStyle = r() < 0.7 ? 'tile' : 'thatch';
      return {
        x, z, w: 13, d: 11, h: 3.3, kind, ry: 0, lotW: 15, lotD: 13,
        color: pick(BUKE_WALL_COLORS),
        roof: pick(roofStyle === 'tile' ? BUKE_ROOF_COLORS : SENGOKU_THATCH_COLORS),
        roofStyle,
      };
    }
    if (kind === 'house-sengoku') {
      const roll = r();
      const roofStyle = roll < 0.6 ? 'thatch' : (roll < 0.8 ? 'tile' : 'shingle');
      return {
        x, z, w: 7, d: 6.5, h: 2.6, kind, ry: 0, fence: 1, lotW: 9, lotD: 8.5,
        color: pick(SENGOKU_HOUSE_WALL_COLORS),
        roof: pick(roofStyle === 'thatch' ? SENGOKU_THATCH_COLORS
          : (roofStyle === 'tile' ? SENGOKU_TILE_COLORS : SENGOKU_SHINGLE_COLORS)),
        roofStyle,
      };
    }
    if (kind === 'shrine') return { x, z, w: 7, d: 6, h: 3.0, kind, lotX: x, lotZ: z, lotW: 16, lotD: 14 };
    if (kind === 'tera') return { x, z, w: 12, d: 10, h: 5.0, kind, lotX: x, lotZ: z, lotW: 20, lotD: 18 };
    if (kind === 'suisha') return { x, z, w: 3.2, d: 3.2, h: 3.0, kind };
    return null;
  }

  return { generate, buildPrims, makeBuilding, MAT };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CityGen;
