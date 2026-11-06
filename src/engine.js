// ================= ENGINE (pure logic, no DOM) =================
const N = 8;
const S_NONE = 0, S_RH = 1, S_RV = 2, S_TNT = 3, S_LIGHT = 4, S_PROP = 5;
const CRATE = -2, LIGHTC = -1;

function makeRng(seed) {
  let s = seed >>> 0;
  const f = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.get = () => s;
  f.set = v => { s = v >>> 0; };
  return f;
}
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const K = (r, c) => r * N + c;
const inB = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
const isTile = t => t && t.c !== CRATE;           // movable piece (gem or special)
const isGem = t => t && t.c >= 0;                 // has a matchable color

class Game {
  // def: {seed, colors, moves, grass:[[r,c,hp]], crates:[[r,c,hp]], goals:{grass?, crate?, collect?:{color:n}}}
  constructor(def, skipGen) {
    this.def = def;
    this.rng = makeRng(def.seed);
    this.nextId = 1;
    this.colors = def.colors;
    this.moves = def.moves;
    this.movesUsed = 0;
    this.chain = 0;
    this.collected = {};
    this.combos = 0;
    this.grass = Array.from({ length: N }, () => Array(N).fill(0));
    this.board = Array.from({ length: N }, () => Array(N).fill(null));
    if (skipGen) return;
    (def.grass || []).forEach(([r, c, h]) => { this.grass[r][c] = h || 1; });
    (def.crates || []).forEach(([r, c, h]) => { this.board[r][c] = { id: this.nextId++, c: CRATE, s: 0, hp: h || 1 }; });
    this.generate();
  }
  newTile(color, s = S_NONE) { return { id: this.nextId++, c: color, s }; }
  randColor() { return Math.floor(this.rng() * this.colors); }
  at(r, c) { return inB(r, c) ? this.board[r][c] : null; }

  generate() {
    const B = this.board;
    for (let tries = 0; tries < 300; tries++) {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (B[r][c] && B[r][c].c === CRATE) continue;
        let col, guard = 0;
        const same = (y, x, v) => inB(y, x) && isGem(B[y][x]) && B[y][x].c === v;
        do { col = this.randColor(); guard++; } while (guard < 60 && (
          (same(r, c - 1, col) && same(r, c - 2, col)) ||
          (same(r - 1, c, col) && same(r - 2, c, col)) ||
          (same(r - 1, c, col) && same(r, c - 1, col) && same(r - 1, c - 1, col))));
        B[r][c] = this.newTile(col);
      }
      if (!this.findGroups().length && this.findMove()) return;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (B[r][c] && B[r][c].c !== CRATE) B[r][c] = null;
    }
  }

  clone() {
    const g = new Game(this.def, true);
    g.restore(this.snapshot());
    g.nextId = this.nextId;
    return g;
  }

  // ---------- matching ----------
  findGroups() {
    const B = this.board;
    const shapes = [];
    for (let r = 0; r < N; r++) {
      let c = 0;
      while (c < N) {
        const t = B[r][c];
        if (!isGem(t)) { c++; continue; }
        let e = c + 1;
        while (e < N && isGem(B[r][e]) && B[r][e].c === t.c) e++;
        if (e - c >= 3) { const cells = []; for (let x = c; x < e; x++) cells.push([r, x]); shapes.push({ kind: 'h', cells, color: t.c }); }
        c = e;
      }
    }
    for (let c = 0; c < N; c++) {
      let r = 0;
      while (r < N) {
        const t = B[r][c];
        if (!isGem(t)) { r++; continue; }
        let e = r + 1;
        while (e < N && isGem(B[e][c]) && B[e][c].c === t.c) e++;
        if (e - r >= 3) { const cells = []; for (let y = r; y < e; y++) cells.push([y, c]); shapes.push({ kind: 'v', cells, color: t.c }); }
        r = e;
      }
    }
    for (let r = 0; r < N - 1; r++) for (let c = 0; c < N - 1; c++) {
      const t = B[r][c];
      if (!isGem(t)) continue;
      const v = t.c;
      if ([B[r][c + 1], B[r + 1][c], B[r + 1][c + 1]].every(u => isGem(u) && u.c === v))
        shapes.push({ kind: 'sq', cells: [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]], color: v });
    }
    const parent = shapes.map((_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const owner = new Map();
    shapes.forEach((s, i) => s.cells.forEach(([r, c]) => {
      const k = K(r, c);
      if (owner.has(k)) parent[find(i)] = find(owner.get(k)); else owner.set(k, i);
    }));
    const groups = new Map();
    shapes.forEach((s, i) => {
      const g = find(i);
      if (!groups.has(g)) groups.set(g, { shapes: [], cells: new Map(), color: s.color });
      const grp = groups.get(g);
      grp.shapes.push(s);
      s.cells.forEach(([r, c]) => grp.cells.set(K(r, c), [r, c]));
    });
    return [...groups.values()];
  }

  // ---------- goals helpers ----------
  remaining() {
    const g = this.def.goals, out = {};
    if (g.grass) { let n = 0; for (const row of this.grass) for (const v of row) if (v > 0) n++; out.grass = n; }
    if (g.crate) { let n = 0; for (const row of this.board) for (const t of row) if (t && t.c === CRATE) n++; out.crate = n; }
    if (g.collect) for (const [c, need] of Object.entries(g.collect)) out['c' + c] = Math.max(0, need - (this.collected[c] || 0));
    return out;
  }
  goalMet() { const r = this.remaining(); return Object.keys(r).length > 0 && Object.values(r).every(v => v === 0); }
  progressValue() { // lower is better; used by bots + propeller targeting
    const r = this.remaining(); let s = 0;
    for (const [k, v] of Object.entries(r)) s += v;
    return s;
  }

  propellerTarget(exclude) {
    const rem = this.remaining();
    const cands = [];
    const B = this.board;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (exclude && exclude.has(K(r, c))) continue;
      const t = B[r][c];
      if (!t) continue;
      let w = 0;
      if (t.c === CRATE && rem.crate) w = 3;
      else if (this.grass[r][c] > 0 && rem.grass) w = 2;
      else if (isGem(t) && rem['c' + t.c]) w = 1;
      if (w) cands.push([w, r, c]);
    }
    if (!cands.length) {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (isTile(B[r][c]) && !(exclude && exclude.has(K(r, c)))) cands.push([0, r, c]);
    }
    if (!cands.length) return null;
    const top = Math.max(...cands.map(x => x[0]));
    const best = cands.filter(x => x[0] === top);
    const p = best[Math.floor(this.rng() * best.length)];
    return [p[1], p[2]];
  }

  // ---------- clearing ----------
  // Clears cells, detonating specials. Crates hit or adjacent to a cleared gem lose 1 layer (once per wave).
  clearCells(keys, opts = {}) {
    const queue = [...keys];
    const seen = new Set();
    const cleared = [], blasts = [];
    const crateHits = new Set();
    const add = (r, c) => { if (inB(r, c)) queue.push(K(r, c)); };
    const B = this.board;
    while (queue.length) {
      const k = queue.shift();
      if (seen.has(k)) continue;
      seen.add(k);
      const r = Math.floor(k / N), c = k % N;
      const t = B[r][c];
      if (!t) continue;
      if (t.c === CRATE) { crateHits.add(k); continue; }
      cleared.push({ r, c, t });
      const s = t.s;
      t.s = S_NONE;
      if (s === S_RH) { blasts.push({ type: 'h', r, c }); for (let x = 0; x < N; x++) add(r, x); }
      else if (s === S_RV) { blasts.push({ type: 'v', r, c }); for (let y = 0; y < N; y++) add(y, c); }
      else if (s === S_TNT) {
        const rad = opts.bigTnt ? 3 : 2;
        blasts.push({ type: 'tnt', r, c, rad });
        for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) add(r + dy, c + dx);
      } else if (s === S_LIGHT) {
        const col = opts.lightColor != null ? opts.lightColor : this.mostCommonColor();
        blasts.push({ type: 'light', r, c, color: col });
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const u = B[y][x]; if (isGem(u) && u.c === col) add(y, x); }
      } else if (s === S_PROP) {
        add(r - 1, c); add(r + 1, c); add(r, c - 1); add(r, c + 1);
        const tgt = this.propellerTarget(seen);
        if (tgt) {
          blasts.push({ type: 'prop', r, c, to: tgt, carry: opts.carry });
          if (opts.carry && isTile(B[tgt[0]][tgt[1]])) { B[tgt[0]][tgt[1]].s = opts.carry; opts.carry = null; }
          add(tgt[0], tgt[1]);
        }
      }
    }
    const mult = Math.max(1, this.chain);
    for (const { r, c, t } of cleared) {
      if (this.grass[r][c] > 0) this.grass[r][c]--;
      if (t.c >= 0) this.collected[t.c] = (this.collected[t.c] || 0) + 1;
      B[r][c] = null;
      if (!opts.noSplash) for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const y = r + dy, x = c + dx;
        if (inB(y, x) && B[y][x] && B[y][x].c === CRATE) crateHits.add(K(y, x));
      }
    }
    const crates = [];
    for (const k of crateHits) {
      const r = Math.floor(k / N), c = k % N, t = B[r][c];
      if (!t || t.c !== CRATE) continue;
      t.hp--;
      crates.push({ r, c, t, broke: t.hp <= 0 });
      if (t.hp <= 0) { B[r][c] = null; if (this.grass[r][c] > 0) this.grass[r][c]--; }
    }
    return { cleared, blasts, crates, mult };
  }

  mostCommonColor() {
    const cnt = Array(this.colors).fill(0);
    for (const row of this.board) for (const t of row) if (isGem(t)) cnt[t.c]++;
    // prefer colors the player needs to collect
    const need = this.def.goals.collect || {};
    let best = -1, bestV = -1;
    cnt.forEach((v, i) => { const w = v + ((need[i] && (this.collected[i] || 0) < need[i]) ? 100 : 0); if (w > bestV) { bestV = w; best = i; } });
    return Math.max(0, best);
  }

  // One cascade step. focus = cells the player just swapped (new special spawns there). Returns null when stable.
  resolveStep(focus = []) {
    const groups = this.findGroups();
    if (!groups.length) return null;
    this.chain++;
    const toClear = new Set();
    const creates = [];
    const focusKeys = new Set(focus.map(([r, c]) => K(r, c)));
    for (const g of groups) {
      g.cells.forEach((_, k) => toClear.add(k));
      const lines = g.shapes.filter(s => s.kind !== 'sq');
      const maxRun = lines.length ? Math.max(...lines.map(s => s.cells.length)) : 0;
      const hasH = lines.some(s => s.kind === 'h'), hasV = lines.some(s => s.kind === 'v');
      const hasSq = g.shapes.some(s => s.kind === 'sq');
      let special = S_NONE;
      if (maxRun >= 5) special = S_LIGHT;
      else if (hasH && hasV) special = S_TNT;
      else if (maxRun === 4) special = lines[0].kind === 'h' ? S_RV : S_RH;
      else if (hasSq) special = S_PROP;
      if (!special) continue;
      let pos = null;
      for (const k of g.cells.keys()) if (focusKeys.has(k)) { pos = g.cells.get(k); break; }
      if (!pos && special === S_TNT) {
        const cnt = new Map();
        lines.forEach(s => s.cells.forEach(([r, c]) => { const k = K(r, c); cnt.set(k, (cnt.get(k) || 0) + 1); }));
        for (const [k, v] of cnt) if (v > 1) { pos = [Math.floor(k / N), k % N]; break; }
      }
      if (!pos) {
        const src = lines.length ? lines.reduce((a, b) => (b.cells.length > a.cells.length ? b : a)) : g.shapes[0];
        pos = src.cells[Math.floor((src.cells.length - 1) / 2)];
      }
      creates.push({ r: pos[0], c: pos[1], color: LIGHTC, special }); // specials are colourless (Royal Match style)
    }
    const res = this.clearCells(toClear);
    const created = [];
    for (const cr of creates) {
      if (this.board[cr.r][cr.c]) continue;
      const t = this.newTile(cr.color, cr.special);
      t.born = true;
      this.board[cr.r][cr.c] = t;
      created.push({ r: cr.r, c: cr.c, t });
    }
    return { ...res, created, chain: this.chain };
  }

  // Gravity with crates as fixed blockers; pieces slide diagonally around them (Royal Match style).
  gravity() {
    const B = this.board;
    let changed = true, guard = 0;
    const cnt = Array(N).fill(0);
    while (changed && guard++ < 2000) {
      changed = false;
      for (let c = 0; c < N; c++) {
        for (let r = N - 1; r >= 0; r--) {
          if (B[r][c]) continue;
          // pull straight down from the nearest piece above, stopping at a crate
          let y = r - 1;
          while (y >= 0 && !B[y][c]) y--;
          if (y >= 0 && isTile(B[y][c])) { B[r][c] = B[y][c]; B[y][c] = null; changed = true; continue; }
          if (y < 0) { // open to the sky: spawn
            const t = this.newTile(this.randColor());
            t.spawn = -(++cnt[c]);
            B[r][c] = t; changed = true; continue;
          }
        }
      }
      if (changed) continue;
      // diagonal slides into cells that are blocked from above
      outer: for (let r = N - 1; r >= 1; r--) for (let c = 0; c < N; c++) {
        if (B[r][c]) continue;
        for (const dx of [-1, 1]) {
          const x = c + dx;
          if (!inB(r - 1, x)) continue;
          const t = B[r - 1][x];
          if (isTile(t) && B[r][x] !== null) { B[r][c] = t; B[r - 1][x] = null; changed = true; break outer; }
        }
      }
    }
  }

  // ---------- moves ----------
  isAdjacent(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1; }
  matchAt(r, c) {
    const B = this.board, t = B[r][c];
    if (!isGem(t)) return false;
    const v = t.c, same = (y, x) => inB(y, x) && isGem(B[y][x]) && B[y][x].c === v;
    let h = 1, w = 1;
    for (let x = c - 1; same(r, x); x--) h++;
    for (let x = c + 1; same(r, x); x++) h++;
    for (let y = r - 1; same(y, c); y--) w++;
    for (let y = r + 1; same(y, c); y++) w++;
    if (h >= 3 || w >= 3) return true;
    for (const [dy, dx] of [[-1, -1], [-1, 1], [1, -1], [1, 1]])
      if (same(r + dy, c) && same(r, c + dx) && same(r + dy, c + dx)) return true;
    return false;
  }
  swapCells(a, b) {
    const t = this.board[a[0]][a[1]];
    this.board[a[0]][a[1]] = this.board[b[0]][b[1]];
    this.board[b[0]][b[1]] = t;
  }
  canSwap(a, b) { return this.isAdjacent(a, b) && isTile(this.at(...a)) && isTile(this.at(...b)); }
  isComboSwap(a, b) {
    const A = this.at(...a), B = this.at(...b);
    return isTile(A) && isTile(B) && (A.s && B.s || A.s === S_LIGHT || B.s === S_LIGHT);
  }
  isValidSwap(a, b) {
    if (!this.canSwap(a, b)) return false;
    if (this.isComboSwap(a, b)) return true;
    const A = this.at(...a), B = this.at(...b);
    if (A.s || B.s) return true; // moving a special always fires it
    this.swapCells(a, b);
    const ok = this.matchAt(...a) || this.matchAt(...b);
    this.swapCells(a, b);
    return ok;
  }
  allMoves() {
    const out = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (c + 1 < N && this.isValidSwap([r, c], [r, c + 1])) out.push([[r, c], [r, c + 1]]);
      if (r + 1 < N && this.isValidSwap([r, c], [r + 1, c])) out.push([[r, c], [r + 1, c]]);
    }
    return out;
  }
  findMove() {
    // prefer a plain match for hints
    let special = null;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const a = [r, c], b = [r + dr, c + dc];
        if (!inB(...b) || !this.canSwap(a, b)) continue;
        const A = this.at(...a), B = this.at(...b);
        if (A.s || B.s) { if (!special) special = [a, b]; continue; }
        if (this.isValidSwap(a, b)) return [a, b];
      }
    }
    if (special) return special;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const t = this.board[r][c]; if (isTile(t) && t.s) return [[r, c], [r, c]]; }
    return null;
  }

  // Player swapped a special with something. Board already swapped; b = where the dragged piece landed.
  fireSwap(a, b) {
    const A = this.board[a[0]][a[1]], B = this.board[b[0]][b[1]];
    this.chain = 1;
    const keys = new Set();
    const blasts = [];
    const addRow = r => { if (r >= 0 && r < N) for (let x = 0; x < N; x++) keys.add(K(r, x)); };
    const addCol = c => { if (c >= 0 && c < N) for (let y = 0; y < N; y++) keys.add(K(y, c)); };
    const light = A.s === S_LIGHT ? A : B.s === S_LIGHT ? B : null;
    const isRocket = s => s === S_RH || s === S_RV;
    let opts = {};
    if (light) {
      const other = light === A ? B : A;
      const lp = light === A ? a : b;
      light.s = S_NONE;
      keys.add(K(...lp));
      if (other.s === S_LIGHT) {
        other.s = S_NONE;
        for (let k = 0; k < N * N; k++) keys.add(k);
        blasts.push({ type: 'mega', r: b[0], c: b[1] });
      } else {
        const conv = other.s;
        const col = conv ? this.mostCommonColor() : other.c;
        if (!conv) other.s = S_NONE;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const u = this.board[y][x];
          if (isGem(u) && u.c === col) {
            if (isRocket(conv)) u.s = this.rng() < 0.5 ? S_RH : S_RV;
            else if (conv) u.s = conv;
            keys.add(K(y, x));
          }
        }
        blasts.push({ type: 'light', r: lp[0], c: lp[1], color: col });
        opts.lightColor = col;
      }
      this.combos++;
    } else if (A.s && B.s) {
      const sa = A.s, sb = B.s;
      A.s = B.s = S_NONE;
      keys.add(K(...a)); keys.add(K(...b));
      const [r, c] = b;
      this.combos++;
      if (isRocket(sa) && isRocket(sb)) { addRow(r); addCol(c); blasts.push({ type: 'h', r, c }, { type: 'v', r, c }); }
      else if (sa === S_TNT && sb === S_TNT) { B.s = S_TNT; opts.bigTnt = true; }
      else if ((isRocket(sa) && sb === S_TNT) || (sa === S_TNT && isRocket(sb))) {
        for (let d = -1; d <= 1; d++) { addRow(r + d); addCol(c + d); }
        blasts.push({ type: 'h', r, c }, { type: 'v', r, c }, { type: 'h', r: r - 1, c }, { type: 'h', r: r + 1, c }, { type: 'v', r, c: c - 1 }, { type: 'v', r, c: c + 1 });
      } else if (sa === S_PROP && sb === S_PROP) {
        B.s = S_PROP; A.s = S_PROP;
      } else { // propeller carries the other special to its target
        const carry = sa === S_PROP ? sb : sa;
        B.s = S_PROP;
        opts.carry = carry;
      }
    } else {
      // single special swapped with a gem: fire it in place
      const sp = A.s ? a : b;
      keys.add(K(...sp));
    }
    const res = this.clearCells(keys, opts);
    res.blasts = blasts.concat(res.blasts);
    return { ...res, created: [], chain: 1 };
  }

  // Tap a special to fire it (costs a move, like Royal Match).
  fireAt(r, c) {
    this.chain = 1;
    return { ...this.clearCells(new Set([K(r, c)])), created: [], chain: 1 };
  }

  // ---------- boosters (free: don't cost moves) ----------
  boosterHammer(r, c) { this.chain = 1; return { ...this.clearCells(new Set([K(r, c)]), { noSplash: false }), created: [] }; }
  boosterRow(r) { this.chain = 1; const s = new Set(); for (let x = 0; x < N; x++) s.add(K(r, x)); return { ...this.clearCells(s), blasts: [{ type: 'h', r, c: 0 }], created: [] }; }
  boosterCol(c) { this.chain = 1; const s = new Set(); for (let y = 0; y < N; y++) s.add(K(y, c)); return { ...this.clearCells(s), blasts: [{ type: 'v', r: 0, c }], created: [] }; }

  placeSpecials(list) {
    const cells = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const t = this.board[r][c]; if (isGem(t) && !t.s) cells.push([r, c]); }
    for (const s of list) {
      if (!cells.length) break;
      const i = Math.floor(this.rng() * cells.length);
      const [r, c] = cells.splice(i, 1)[0];
      const t = this.board[r][c];
      t.s = s; t.c = LIGHTC;
      t.born = true;
    }
  }

  shuffle() {
    const pos = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (isTile(this.board[r][c])) pos.push([r, c]);
    const tiles = pos.map(([r, c]) => this.board[r][c]);
    for (let tries = 0; tries < 200; tries++) {
      for (let i = tiles.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [tiles[i], tiles[j]] = [tiles[j], tiles[i]]; }
      pos.forEach(([r, c], i) => { this.board[r][c] = tiles[i]; });
      if (!this.findGroups().length && this.findMove()) return true;
    }
    for (let tries = 0; tries < 80; tries++) {
      for (const t of tiles) if (isGem(t) && !t.s) t.c = this.randColor();
      if (!this.findGroups().length && this.findMove()) return true;
    }
    return false;
  }

  snapshot() {
    return {
      board: this.board.map(row => row.map(t => (t ? { id: t.id, c: t.c, s: t.s, hp: t.hp } : null))),
      grass: this.grass.map(r => r.slice()),
      moves: this.moves, movesUsed: this.movesUsed, combos: this.combos,
      collected: { ...this.collected }, rng: this.rng.get(),
    };
  }
  restore(s) {
    this.board = s.board.map(row => row.map(t => (t ? { ...t } : null)));
    this.grass = s.grass.map(r => r.slice());
    this.moves = s.moves; this.movesUsed = s.movesUsed; this.combos = s.combos;
    this.collected = { ...s.collected }; this.rng.set(s.rng);
  }
}

// ---------- full move resolution (used by bots/tests; UI runs the same steps with animation) ----------
function resolveAll(g, first, focus) {
  let step = first;
  if (step) g.gravity();
  let f = focus || [];
  for (;;) {
    const s = g.resolveStep(f);
    f = [];
    if (!s) break;
    g.gravity();
  }
  g.chain = 0;
  if (!g.findMove()) g.shuffle();
}
function playMove(g, a, b) {
  if (a[0] === b[0] && a[1] === b[1]) { g.moves--; g.movesUsed++; resolveAll(g, g.fireAt(...a)); return true; }
  if (!g.isValidSwap(a, b)) return false;
  const A = g.at(...a), B = g.at(...b);
  g.swapCells(a, b);
  g.moves--; g.movesUsed++;
  if (A.s || B.s) resolveAll(g, g.fireSwap(a, b));
  else resolveAll(g, null, [a, b]);
  return true;
}

// ---------- levels ----------
let MOVES_TABLE = (typeof module !== 'undefined' && require('fs').existsSync(__dirname + '/../data/moves.json')) ? JSON.parse(require('fs').readFileSync(__dirname + '/../data/moves.json', 'utf8')) : (typeof MOVES_DATA !== 'undefined' ? MOVES_DATA : null);
// A smooth curve. Every 7th level is a clearly-labelled Hard level (worth 2 stars); the level after it is a breather.
function levelDef(n) {
  const r = makeRng(hashStr('lk-level-' + n));
  const hard = n >= 7 && n % 7 === 0;
  const breather = n > 7 && n % 7 === 1;
  const d = Math.min(1, (n - 1) / 80);
  const colors = hard ? 6 : 5; // 5 baseline stones; rose quartz joins only on labelled Hard levels
  const def = { n, seed: hashStr('lk-board-' + n), colors, grass: [], crates: [], goals: {}, hard };
  const sym = (cells, y, x) => { cells.add(K(y, x)); cells.add(K(y, N - 1 - x)); };
  // which goals: introduce slowly
  const kinds = [];
  if (n <= 3) kinds.push('collect');
  else if (n <= 6) kinds.push(n % 2 ? 'grass' : 'collect');
  else {
    const roll = r();
    if (roll < 0.3) kinds.push('grass');
    else if (roll < 0.55) kinds.push('crate');
    else if (roll < 0.75) kinds.push('crate', 'collect');
    else kinds.push('grass', 'crate');
    if (n > 100) { // later chapters mix goals more freely
      const r2 = r();
      if (r2 < 0.15) { kinds.length = 0; kinds.push('grass', 'collect'); }
      else if (r2 < 0.25) { kinds.length = 0; kinds.push('collect'); }
      else if (r2 < 0.33) { kinds.length = 0; kinds.push('crate', 'grass', 'collect'); }
    }
  }
  if (n === 7) { kinds.length = 0; kinds.push('crate'); }
  const crateCells = new Set();
  if (kinds.includes('crate')) {
    const pats = ['band', 'corners', 'pillars', 'center', 'zig'];
    if (n > 100) pats.push('frame', 'twin', 'cup', 'steps', 'diag', 'dots');
    const p = pats[Math.floor(r() * pats.length)];
    if (p === 'band') for (let x = 0; x < N; x++) crateCells.add(K(4, x));
    else if (p === 'corners') { for (const [y, x] of [[5, 0], [6, 0], [7, 0], [6, 1], [7, 1], [7, 2]]) sym(crateCells, y, x); }
    else if (p === 'pillars') { for (let y = 4; y < 8; y++) { sym(crateCells, y, 1); } }
    else if (p === 'center') { for (let y = 3; y < 6; y++) for (let x = 2; x < 6; x++) crateCells.add(K(y, x)); }
    else if (p === 'zig') { for (let x = 0; x < N; x++) crateCells.add(K(x % 2 ? 5 : 6, x)); }
    else if (p === 'frame') { for (let i = 2; i < 6; i++) { crateCells.add(K(2, i)); crateCells.add(K(5, i)); crateCells.add(K(i, 2)); crateCells.add(K(i, 5)); } }
    else if (p === 'twin') { for (const [y, x] of [[4, 1], [4, 2], [5, 1], [5, 2]]) sym(crateCells, y, x); }
    else if (p === 'cup') { for (let x = 1; x < 7; x++) crateCells.add(K(7, x)); for (let y = 4; y < 7; y++) sym(crateCells, y, 1); }
    else if (p === 'steps') { for (let i = 0; i < 4; i++) { sym(crateCells, 4 + i, i); } }
    else if (p === 'diag') { for (let i = 0; i < N; i++) crateCells.add(K(Math.min(7, 3 + Math.floor(i / 2)), i)); }
    else { for (const [y, x] of [[3, 1], [5, 3], [6, 0], [7, 2]]) sym(crateCells, y, x); }
    const hpMin = hard ? 1 : 2, hpMax = 2 + Math.floor(d * 1.5);
    def.crates = [...crateCells].map(k => [Math.floor(k / N), k % N, Math.min(3, hpMin + Math.floor(r() * (hpMax - hpMin + 1)))]);
    if (breather) def.crates.forEach(c => { c[2] = Math.min(c[2], 2); });
    def.goals.crate = true;
  }
  if (kinds.includes('grass')) {
    const cells = new Set();
    const pats = ['block', 'ring', 'cross', 'bottom', 'diamond', 'heart'];
    if (n > 100) pats.push('checker', 'x', 'stripes', 'lotus', 'corners', 'border', 'clusters');
    const p = pats[Math.floor(r() * pats.length)];
    const addc = (y, x) => { if (inB(y, x) && !crateCells.has(K(y, x))) cells.add(K(y, x)); };
    if (p === 'block') { for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) addc(y, x); }
    else if (p === 'ring') { for (let i = 1; i < 7; i++) { addc(1, i); addc(6, i); addc(i, 1); addc(i, 6); } }
    else if (p === 'cross') { for (let i = 0; i < N; i++) { addc(3, i); addc(4, i); addc(i, 3); addc(i, 4); } }
    else if (p === 'bottom') { for (let y = 5; y < 8; y++) for (let x = 0; x < N; x++) addc(y, x); }
    else if (p === 'diamond') { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (Math.abs(y - 3.5) + Math.abs(x - 3.5) <= 3) addc(y, x); }
    else if (p === 'checker') { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x + y) % 2 === 0) addc(y, x); }
    else if (p === 'x') { for (let i = 0; i < N; i++) { addc(i, i); addc(i, N - 1 - i); if (i > 0) { addc(i, i - 1); addc(i, N - i); } } }
    else if (p === 'stripes') { const v = r() < 0.5; for (let a = 0; a < N; a += 2) for (let b = 0; b < N; b++) v ? addc(b, a) : addc(a, b); }
    else if (p === 'lotus') { ['...##...', '..####..', '.##..##.', '########', '.######.', '..####..'].forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') addc(y + 1, x); })); }
    else if (p === 'corners') { for (const [y0, x0] of [[0, 0], [0, 5], [5, 0], [5, 5]]) for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) addc(y0 + y, x0 + x); }
    else if (p === 'border') { for (let i = 0; i < N; i++) { addc(0, i); addc(7, i); addc(i, 0); addc(i, 7); } }
    else if (p === 'clusters') { for (let k = 0; k < 4; k++) { const y0 = Math.floor(r() * 6), x0 = Math.floor(r() * 6); for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (r() < 0.75) addc(y0 + y, x0 + x); } }
    else { // heart
      const rows = ['.##..##.', '########', '########', '.######.', '..####..', '...##...'];
      rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') addc(y + 1, x); }));
    }
    const dbl = breather ? 0.3 : hard ? 0.4 : 0.6 + d * 0.4;
    def.grass = [...cells].map(k => [Math.floor(k / N), k % N, r() < dbl ? 2 : 1]);
    def.goals.grass = true;
  }
  if (kinds.includes('collect')) {
    const k = kinds.length > 1 ? 1 : (n <= 2 ? 1 : 2);
    const picks = [];
    while (picks.length < k) { const c = Math.floor(r() * colors); if (!picks.includes(c)) picks.push(c); }
    const need = Math.round((n <= 3 ? 14 + n * 4 : 40 + 25 * d) * (colors === 5 ? 1 : 0.6) * (hard ? 1.25 : 1) * (breather ? 0.8 : 1) * (kinds.length > 1 ? 0.8 : 1));
    def.goals.collect = Object.fromEntries(picks.map(c => [c, need]));
  }
  // moves: tuned by the bot simulation in sim.js
  let moves = 22 + Math.round(4 * d);
  if (kinds.length > 1) moves += 4;
  if (kinds.includes('grass')) moves += 2;
  if (hard) moves -= 2;
  if (breather) moves += 3;
  if (n <= 3) moves = 15;
  def.moves = (MOVES_TABLE && MOVES_TABLE[n]) || moves + 4;
  def.difficulty = hard ? 'Hard' : breather ? 'Breather' : d > 0.5 ? 'Tricky' : 'Normal';
  return def;
}

function dailyDef(dateStr) {
  const n = 101 + (hashStr('daily' + dateStr) % 900);
  const def = levelDef(n);
  def.seed = hashStr('daily-board-' + dateStr);
  def.daily = dateStr;
  def.moves += 3;
  def.hard = false;
  def.difficulty = 'Daily';
  return def;
}
function zenDef(seed) {
  return { n: 'Zen', seed, colors: 5, moves: Infinity, goals: {}, grass: [], crates: [], difficulty: 'Relaxed', zen: true };
}

if (typeof module !== 'undefined') module.exports = { Game, levelDef, dailyDef, zenDef, playMove, resolveAll, N, S_RH, S_RV, S_TNT, S_LIGHT, S_PROP, CRATE };
