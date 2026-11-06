// Engine test suite. Run: node --test tests/   (no dependencies)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const { Game, levelDef, dailyDef, playMove, resolveAll, makeRng, N, S_NONE, S_RH, S_RV, S_TNT, S_LIGHT, S_PROP, CRATE, LIGHTC, K, isGem } = E;

// ---------- helpers ----------
// Board legend: 0-5 stone colour, . empty, x/y/z driftwood with 1/2/3 layers,
// H/V koi (row/column), T whirlpool, L lotus, P dragonfly.
const SPECIAL = { H: S_RH, V: S_RV, T: S_TNT, L: S_LIGHT, P: S_PROP };
function makeGame(rows, opts = {}) {
  const def = { seed: opts.seed || 1, colors: opts.colors || 5, moves: 20, goals: opts.goals || { collect: { 0: 99 } }, grass: [], crates: [] };
  const g = new Game(def, true);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const ch = (rows[r] || '........')[c] || '.';
    if (ch === '.') continue;
    if ('xyz'.includes(ch)) g.board[r][c] = { id: g.nextId++, c: CRATE, s: 0, hp: 'xyz'.indexOf(ch) + 1 };
    else if (SPECIAL[ch]) g.board[r][c] = g.newTile(LIGHTC, SPECIAL[ch]);
    else g.board[r][c] = g.newTile(+ch);
  }
  if (opts.grass) for (const [r, c, h] of opts.grass) g.grass[r][c] = h;
  return g;
}
// A full board with no matches anywhere: colour (2r + c) mod 5.
const BG = Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => String((2 * r + c) % 5)).join(''));
const createdKinds = res => res.created.map(x => x.t.s);

function checkBoard(g, where) {
  const ids = new Set();
  for (let r = 0; r < N; r++) {
    assert.equal(g.board[r].length, N, `row length ${where}`);
    for (let c = 0; c < N; c++) {
      const t = g.board[r][c];
      assert.notEqual(t, undefined, `undefined cell ${r},${c} ${where}`);
      if (!t) {
        // Empty cells are allowed only where driftwood blocks the way from the sky.
        let blocked = false;
        for (let y = r - 1; y >= 0; y--) if (g.board[y][c] && g.board[y][c].c === CRATE) { blocked = true; break; }
        assert.ok(blocked, `unblocked empty cell ${r},${c} ${where}`);
        continue;
      }
      assert.ok(!ids.has(t.id), `duplicate id ${t.id} ${where}`);
      ids.add(t.id);
      if (t.c === CRATE) assert.ok(t.hp >= 1 && t.hp <= 3, `crate hp ${where}`);
      else if (t.s) assert.equal(t.c, LIGHTC, `power-up with a colour ${where}`);
      else assert.ok(t.c >= 0 && t.c < g.colors, `bad colour ${t.c} ${where}`);
    }
  }
  assert.equal(g.findGroups().length, 0, `unresolved matches ${where}`);
  assert.ok(g.findMove(), `no move available ${where}`);
}
const crateMap = g => { const m = {}; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const t = g.board[r][c]; if (t && t.c === CRATE) m[K(r, c)] = t.id; } return m; };
const boardSig = g => g.board.map(row => row.map(t => (t ? (t.c === CRATE ? 'k' + t.hp : t.c + ':' + t.s) : '.')).join(',')).join('|');

// ---------- matching ----------
test('runs of 3, 4 and 5', () => {
  let g = makeGame(['000.....']);
  let res = g.resolveStep();
  assert.equal(res.cleared.length, 3); assert.deepEqual(createdKinds(res), []);

  g = makeGame(['0000....']);
  res = g.resolveStep([[0, 1]]);
  assert.equal(res.cleared.length, 4); assert.deepEqual(createdKinds(res), [S_RV], 'horizontal 4 makes a column koi');

  g = makeGame(['0', '0', '0', '0']);
  res = g.resolveStep();
  assert.deepEqual(createdKinds(res), [S_RH], 'vertical 4 makes a row koi');

  g = makeGame(['00000...']);
  res = g.resolveStep();
  assert.equal(res.cleared.length, 5); assert.deepEqual(createdKinds(res), [S_LIGHT]);
});

test('L and T shapes make a Whirlpool', () => {
  const L = makeGame(['0.......', '0.......', '000.....']);
  let res = L.resolveStep();
  assert.equal(res.cleared.length, 5); assert.deepEqual(createdKinds(res), [S_TNT]);
  assert.deepEqual([res.created[0].r, res.created[0].c], [2, 0], 'L whirlpool sits on the corner');

  const T = makeGame(['000.....', '.0......', '.0......']);
  res = T.resolveStep();
  assert.deepEqual(createdKinds(res), [S_TNT]);
  assert.deepEqual([res.created[0].r, res.created[0].c], [0, 1]);
});

test('2x2 square makes a Dragonfly', () => {
  const g = makeGame(['00......', '00......']);
  const res = g.resolveStep();
  assert.equal(res.cleared.length, 4); assert.deepEqual(createdKinds(res), [S_PROP]);
});

test('square overlapping a line merges into one group', () => {
  const g = makeGame(['000.....', '00......']);
  const groups = g.findGroups();
  assert.equal(groups.length, 1);
  assert.equal(groups[0].cells.size, 5);
  const res = g.resolveStep();
  assert.equal(res.cleared.length, 5);
  assert.equal(res.created.length, 1, 'one power-up for one merged group');
});

test('power-up spawns on the swapped cell when it is part of the match', () => {
  for (let x = 0; x < 4; x++) {
    const g = makeGame(['0000....']);
    const res = g.resolveStep([[0, x], [1, x]]);
    assert.deepEqual([res.created[0].r, res.created[0].c], [0, x]);
  }
  // through a real swap: row 0 is 0 0 1 0 with a 0 under the 1; swapping them makes 0000
  const g = makeGame(['0010....', '..0.....']);
  assert.ok(g.isValidSwap([1, 2], [0, 2]));
  g.swapCells([0, 2], [1, 2]);
  const res = g.resolveStep([[1, 2], [0, 2]]);
  assert.deepEqual(createdKinds(res), [S_RV]);
  assert.deepEqual([res.created[0].r, res.created[0].c], [0, 2]);
});

// ---------- specials are colourless ----------
test('power-ups never take part in colour matches', () => {
  for (const ch of 'HVTLP') {
    assert.equal(makeGame([`00${ch}00...`]).findGroups().length, 0, ch + ' between two pairs');
    assert.equal(makeGame([`${ch}${ch}${ch}.....`]).findGroups().length, 0, 'three ' + ch);
    assert.equal(makeGame([`${ch}${ch}......`, `${ch}${ch}......`]).findGroups().length, 0, 'square of ' + ch);
  }
  const res = makeGame(['0000....']).resolveStep();
  assert.equal(res.created[0].t.c, LIGHTC);
});

test('moving any power-up is always a valid move', () => {
  for (const ch of 'HVTLP') {
    const rows = BG.slice(); rows[3] = rows[3].slice(0, 3) + ch + rows[3].slice(4);
    const g = makeGame(rows);
    for (const nb of [[2, 3], [4, 3], [3, 2], [3, 4]]) assert.ok(g.isValidSwap([3, 3], nb), ch + ' -> ' + nb);
  }
});

// ---------- combos ----------
function comboGame(chA, chB, extra) {
  const rows = BG.slice();
  const put = (r, c, ch) => { rows[r] = rows[r].slice(0, c) + ch + rows[r].slice(c + 1); };
  put(3, 3, chA); put(3, 4, chB);
  if (extra) extra(put);
  return makeGame(rows, { goals: { collect: { 1: 50 } } });
}
function fire(g, a = [3, 3], b = [3, 4]) { g.swapCells(a, b); return g.fireSwap(a, b); }
const gemCount = g => { let n = 0; for (const row of g.board) for (const t of row) if (isGem(t)) n++; return n; };
const pairs = ['HH', 'HV', 'VV', 'HT', 'VT', 'TH', 'TT', 'LH', 'LV', 'LT', 'LP', 'LL', 'L0', '0L', 'PP', 'PH', 'PV', 'PT', 'HP', 'TP', 'H0', 'T0', 'P0'];

test('every combo resolves without throwing, leftovers or double counting', () => {
  for (const p of pairs) for (let seed = 1; seed <= 40; seed++) {
    const g = comboGame(p[0], p[1]);
    g.rng = makeRng(seed);
    const before = gemCount(g);
    const res = fire(g);
    const after = gemCount(g);
    const clearedGems = res.cleared.filter(x => x.t.c >= 0).length;
    const sumCollected = Object.values(g.collected).reduce((a, b) => a + b, 0);
    assert.equal(sumCollected, clearedGems, p + ' collected = cleared gems');
    assert.equal(before - after, clearedGems, p + ' every cleared gem left the board');
    assert.equal(new Set(res.cleared.map(x => K(x.r, x.c))).size, res.cleared.length, p + ' no cell cleared twice');
    for (const row of g.board) for (const t of row) if (t && t.c >= 0) assert.equal(t.s, S_NONE, p + ' no coloured power-up left behind');
    resolveAll(g, res);
    checkBoard(g, 'combo ' + p + ' seed ' + seed);
  }
});

test('Koi+Koi clears a cross, Koi+Whirlpool clears 3 rows and 3 columns', () => {
  let g = comboGame('H', 'V'); fire(g);
  for (let i = 0; i < N; i++) { assert.equal(g.board[3][i], null); assert.equal(g.board[i][4], null); }
  g = comboGame('H', 'T'); fire(g);
  for (let i = 0; i < N; i++) for (const d of [-1, 0, 1]) { assert.equal(g.board[3 + d][i], null); assert.equal(g.board[i][4 + d], null); }
});

test('Whirlpool+Whirlpool clears 7x7 but other whirlpools in the chain stay 5x5', () => {
  // combo lands at (1,1): 7x7 covers rows/cols 0..4. A whirlpool at (4,4) is hit and must go off at 5x5 (2..6).
  const rows = BG.slice();
  const put = (r, c, ch) => { rows[r] = rows[r].slice(0, c) + ch + rows[r].slice(c + 1); };
  put(1, 0, 'T'); put(1, 1, 'T'); put(4, 4, 'T');
  const h = makeGame(rows);
  fire(h, [1, 0], [1, 1]);
  for (let y = 0; y <= 4; y++) for (let x = 0; x <= 4; x++) assert.equal(h.board[y][x], null, `7x7 ${y},${x}`);
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) assert.equal(h.board[y][x], null, `chained 5x5 ${y},${x}`);
  assert.notEqual(h.board[7][7], null, 'chained whirlpool must not grow to 7x7');
  assert.notEqual(h.board[7][1], null);
});

test('Lotus + stone clears that colour; Lotus + power-up fires the partner too', () => {
  let g = comboGame('L', '2');
  fire(g);
  for (const row of g.board) for (const t of row) assert.ok(!(t && t.c === 2), 'all colour-2 stones cleared');
  for (const ch of 'HVTP') {
    g = comboGame('L', ch);
    g.rng = makeRng(7);
    const res = fire(g);
    assert.equal(g.board[3][3], null, 'partner cell cleared for ' + ch);
    assert.equal(g.board[3][4], null, 'lotus cell cleared for ' + ch);
    const kinds = new Set(res.blasts.map(b => b.type));
    assert.ok(kinds.has('light'), ch);
  }
});

test('Lotus + power-up fires the partner even when nothing else reaches it', () => {
  for (const ch of 'HVT') for (let seed = 1; seed <= 20; seed++) {
    const g = makeGame([ch + 'L......', '', '', '', '', '.....2..', '.......2']);
    g.rng = makeRng(seed);
    const res = fire(g, [0, 0], [0, 1]);
    assert.ok(res.blasts.some(b => b.r === 0 && b.c === 1 && ['h', 'v', 'tnt'].includes(b.type)), ch + ' partner fired where it landed');
    for (const row of g.board) for (const t of row) assert.ok(!(t && t.s), 'no power-up left over');
  }
});

test('a lotus set off in a chain picks a colour that is not already being cleared', () => {
  const g = makeGame(['L0000...', '1111....', '2.......', '........', '.......L']);
  const res = g.clearCells(new Set([K(0, 0), K(4, 7)]));
  const cols = res.blasts.filter(b => b.type === 'light').map(b => b.color);
  assert.equal(cols.length, 2);
  assert.notEqual(cols[0], cols[1]);
});

test('Lotus+Lotus clears the whole board and damages every driftwood once', () => {
  const g = comboGame('L', 'L', put => { put(0, 0, 'z'); put(7, 7, 'x'); });
  fire(g);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (r === 0 && c === 0) { assert.equal(g.board[r][c].hp, 2); continue; }
    assert.equal(g.board[r][c], null);
  }
});

test('Dragonfly carries Koi/Whirlpool to its target, even when the target is driftwood', () => {
  for (const ch of 'HVT') {
    const g = comboGame('P', ch, put => put(7, 0, 'z'));
    g.def.goals = { crate: true };
    const res = fire(g);
    const prop = res.blasts.find(b => b.type === 'prop');
    assert.deepEqual(prop.to, [7, 0], 'dragonfly targets the driftwood');
    const carried = res.blasts.find(b => ['h', 'v', 'tnt'].includes(b.type) && b.r === 7 && b.c === 0);
    assert.ok(carried, 'carried ' + ch + ' went off at the driftwood');
    if (ch === 'H') for (let x = 1; x < N; x++) assert.equal(g.board[7][x], null);
    if (ch === 'V') for (let y = 0; y < 7; y++) assert.equal(g.board[y][0], null);
    assert.equal(g.board[7][0].hp, 2, 'driftwood loses exactly one layer');
  }
});

// ---------- gravity with driftwood ----------
test('gravity: stones never overlap driftwood, it always terminates, crates never move', () => {
  const rng = makeRng(12345);
  for (let trial = 0; trial < 3000; trial++) {
    const g = makeGame(BG, { seed: trial + 1 });
    g.rng = makeRng(trial + 99);
    const nCrates = Math.floor(rng() * 20);
    for (let i = 0; i < nCrates; i++) { const r = Math.floor(rng() * N), c = Math.floor(rng() * N); g.board[r][c] = { id: g.nextId++, c: CRATE, s: 0, hp: 1 + Math.floor(rng() * 3) }; }
    const nHoles = Math.floor(rng() * 40);
    for (let i = 0; i < nHoles; i++) { const r = Math.floor(rng() * N), c = Math.floor(rng() * N); if (g.board[r][c] && g.board[r][c].c !== CRATE) g.board[r][c] = null; }
    const crates = crateMap(g);
    g.gravity();
    assert.deepEqual(crateMap(g), crates, 'driftwood never moves');
    const sig = boardSig(g); g.gravity();
    assert.equal(boardSig(g), sig, 'gravity reaches a fixed point in one call');
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (g.board[r][c]) continue;
      let blocked = false;
      for (let y = r - 1; y >= 0; y--) if (g.board[y][c] && g.board[y][c].c === CRATE) { blocked = true; break; }
      assert.ok(blocked, 'empty cells only under driftwood');
    }
    // the board is still playable after the usual end-of-move repair
    resolveAll(g, null);
    assert.ok(g.findMove(), 'playable');
  }
});

test('cells fully enclosed by driftwood may stay empty but the board stays playable', () => {
  const rows = BG.slice();
  rows[2] = rows[2].slice(0, 2) + 'zzz' + rows[2].slice(5);
  rows[3] = rows[3].slice(0, 2) + 'z.z' + rows[3].slice(5);
  rows[4] = rows[4].slice(0, 2) + 'zzz' + rows[4].slice(5);
  const g = makeGame(rows);
  g.gravity();
  assert.equal(g.board[3][3], null);
  resolveAll(g, null);
  assert.ok(g.findMove());
});

// ---------- damage ----------
test('driftwood loses at most one layer per clear wave', () => {
  // two separate matches both touch the driftwood at (1,1)
  const g = makeGame(['000.....', '1z1.....', '222.....']);
  const res = g.resolveStep();
  assert.equal(res.cleared.length, 6);
  assert.equal(g.board[1][1].hp, 2);
  // blast + adjacency in one wave: still one layer
  const h = makeGame(['H00.....', '.y......', '.3......']);
  h.clearCells(new Set([K(0, 0)]));
  assert.equal(h.board[1][1].hp, 1);
  // a hit on its own cell (Tap) removes exactly one layer
  const t = makeGame(['z']);
  t.boosterHammer(0, 0);
  assert.equal(t.board[0][0].hp, 2);
});

test('silt loses one layer per cleared stone on top', () => {
  const g = makeGame(['000.....'], { grass: [[0, 0, 2], [0, 1, 1]] });
  g.resolveStep();
  assert.deepEqual(g.grass[0].slice(0, 3), [1, 0, 0]);
});

// ---------- board health ----------
test('generate() never starts with a match and always has a move', () => {
  for (let n = 1; n <= 1500; n++) {
    const g = new Game(levelDef(n));
    for (const row of g.board) for (const t of row) assert.ok(t, 'no empty cells at the start, level ' + n);
    checkBoard(g, 'level ' + n + ' start');
  }
});

test('shuffle() ends with no matches and at least one move', () => {
  for (let n = 1; n <= 600; n++) {
    const g = new Game(levelDef(n));
    g.shuffle();
    checkBoard(g, 'shuffle ' + n);
  }
  // nearly empty board: the documented last resort still leaves a move
  const g = makeGame(['zzzzzzzz', 'z01zzzzz', 'zzzzzzzz']);
  g.shuffle();
  assert.equal(g.findGroups().length, 0);
  assert.ok(g.findMove());
});

// ---------- undo determinism ----------
test('snapshot()/restore() including RNG: same move after undo gives the same result', () => {
  for (let n = 1; n <= 200; n++) {
    const g = new Game(levelDef(n));
    const snap = g.snapshot();
    const moves = g.allMoves();
    const m = moves[n % moves.length];
    playMove(g, ...m);
    const after1 = boardSig(g), coll1 = JSON.stringify(g.collected), rng1 = g.rng.get();
    g.restore(snap);
    assert.deepEqual(g.snapshot(), snap);
    playMove(g, ...m);
    assert.equal(boardSig(g), after1, 'level ' + n);
    assert.equal(JSON.stringify(g.collected), coll1);
    assert.equal(g.rng.get(), rng1);
  }
});

// ---------- level generator ----------
test('levelDef(n) for every n in 1..10,000', () => {
  for (let n = 1; n <= 10000; n++) {
    const d = levelDef(n);
    const crates = new Set(d.crates.map(([r, c]) => K(r, c)));
    for (const [r, c, h] of d.grass) { assert.ok(!crates.has(K(r, c)), 'silt under driftwood L' + n); assert.ok(h === 1 || h === 2); }
    for (const [r, c, h] of d.crates) { assert.ok(r >= 0 && r < N && c >= 0 && c < N); assert.ok(h >= 1 && h <= 3); }
    assert.ok(Object.keys(d.goals).length > 0, 'has a goal L' + n);
    if (d.goals.collect) for (const c of Object.keys(d.goals.collect)) assert.ok(+c >= 0 && +c < d.colors, 'collect colour exists L' + n);
    if (d.goals.crate) assert.ok(d.crates.length > 0);
    if (d.goals.grass) assert.ok(d.grass.length > 0);
    assert.ok(d.moves >= 12 && d.moves <= 50, 'moves ' + d.moves + ' L' + n);
    assert.equal(d.hard, n >= 7 && n % 7 === 0, 'hard L' + n);
    assert.equal(d.colors, d.hard ? 6 : 5);
    if (d.hard && n < 10000) assert.equal(levelDef(n + 1).difficulty, 'Breather', 'breather after L' + n);
    assert.equal(JSON.stringify(levelDef(n)), JSON.stringify(d), 'deterministic');
  }
});

test('dailyDef() is stable for a date and never an unlabelled Hard level', () => {
  const day = new Date(Date.UTC(2026, 0, 1));
  for (let i = 0; i < 730; i++) {
    const s = new Date(day.getTime() + i * 864e5).toISOString().slice(0, 10);
    const a = dailyDef(s), b = dailyDef(s);
    assert.deepEqual(a, b);
    assert.equal(a.daily, s);
    assert.notEqual(a.n % 7, 0, 'daily borrows a Hard layout on ' + s);
    assert.equal(a.colors, 5);
  }
  assert.notEqual(dailyDef('2026-11-06').seed, dailyDef('2026-11-07').seed);
});

// ---------- fuzz ----------
test('fuzz: 2,000 random games x 40 random valid moves keep every invariant', () => {
  const rng = makeRng(20261106);
  let moves = 0;
  for (let game = 0; game < 2000; game++) {
    const n = 1 + Math.floor(rng() * 10000);
    const g = new Game({ ...levelDef(n), moves: 999 });
    checkBoard(g, `L${n} start`);
    const crates0 = crateMap(g);
    for (let i = 0; i < 40; i++) {
      const all = g.allMoves();
      assert.ok(all.length, `L${n} move ${i}: no moves`);
      const before = JSON.stringify(g.grass);
      let m = all[Math.floor(rng() * all.length)];
      // sometimes tap a power-up instead of swapping
      if (rng() < 0.15) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (g.board[r][c] && g.board[r][c].s) m = [[r, c], [r, c]];
      const used = g.movesUsed;
      assert.ok(playMove(g, ...m), 'valid move accepted');
      moves++;
      assert.equal(g.movesUsed, used + 1);
      checkBoard(g, `L${n} game ${game} move ${i}`);
      // driftwood never moves (it can only disappear) and silt only goes down
      for (const [k, id] of Object.entries(crateMap(g))) assert.equal(crates0[k], id, 'driftwood moved');
      const prev = JSON.parse(before);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) assert.ok(g.grass[r][c] <= prev[r][c]);
      if (g.goalMet()) break;
    }
  }
  assert.ok(moves > 40000);
});
