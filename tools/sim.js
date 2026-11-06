const E = require('../src/engine.js');
const { Game, levelDef, playMove, N } = E;

function check(g, where) {
  const ids = new Set();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const t = g.board[r][c];
    if (!t) continue;
    if (ids.has(t.id)) throw new Error('dup id ' + where);
    ids.add(t.id);
  }
  if (g.findGroups().length) throw new Error('unresolved matches ' + where);
}

function bot(def, greedy, seedOff) {
  const d = { ...def, seed: def.seed + seedOff };
  const g = new Game(d);
  check(g, 'start');
  let pick = Math.random;
  while (g.moves > 0) {
    if (g.goalMet()) break;
    const moves = g.allMoves();
    if (!moves.length) { g.shuffle(); continue; }
    let best = moves[Math.floor(pick() * moves.length)];
    if (greedy) {
      let bv = Infinity;
      for (const [a, b] of moves) {
        const h = g.clone();
        playMove(h, a, b);
        const v = h.progressValue() + Math.random() * 0.5;
        if (v < bv) { bv = v; best = [a, b]; }
      }
    }
    playMove(g, best[0], best[1]);
    check(g, 'after move');
  }
  return { win: g.goalMet(), left: g.moves };
}

const from = +process.argv[2] || 1, to = +process.argv[3] || 30, trials = +process.argv[4] || 8;
let tot = 0;
for (let n = from; n <= to; n++) {
  const def = levelDef(n);
  let gw = 0, rw = 0, left = 0;
  for (let t = 0; t < trials; t++) {
    const a = bot(def, true, t * 104729 + 13); if (a.win) { gw++; left += a.left; }
    if (bot(def, false, t * 104729).win) rw++;
  }
  tot += gw / trials;
  const goals = Object.keys(def.goals).join('+');
  console.log(`L${n} ${def.difficulty.padEnd(8)} ${goals.padEnd(14)} mv${def.moves} crates${def.crates.length} grass${def.grass.length}  greedy ${(100 * gw / trials).toFixed(0)}%  (avg left ${(gw ? left / gw : 0).toFixed(1)})  random ${(100 * rw / trials).toFixed(0)}%`);
}
console.log('avg greedy', (100 * tot / (to - from + 1)).toFixed(0) + '%');
