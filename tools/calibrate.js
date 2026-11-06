const E = require('../src/engine.js');
const { Game, levelDef, playMove } = E;
function need(def, off) {
  const g = new Game({ ...def, seed: def.seed + off, moves: 999 });
  let used = 0;
  while (!g.goalMet() && used < 150) {
    const moves = g.allMoves();
    if (!moves.length) { g.shuffle(); continue; }
    let best = moves[0], bv = Infinity;
    for (const [a, b] of moves) { const h = g.clone(); playMove(h, a, b); const v = h.progressValue() + Math.random() * 0.5; if (v < bv) { bv = v; best = [a, b]; } }
    playMove(g, ...best); used++;
  }
  return used;
}
const FROM = +process.argv[2] || 1, TO = +process.argv[3] || 100, T = +process.argv[4] || 24, OUT = process.argv[5] || 'data/moves.part.json';
const table = {};
for (let n = FROM; n <= TO; n++) {
  const def = levelDef(n);
  const xs = []; for (let t = 0; t < T; t++) xs.push(need(def, t === 0 ? 0 : t * 7919));
  xs.sort((a, b) => a - b);
  const q = p => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  let m;
  if (n <= 3) m = Math.max(15, Math.ceil(q(0.95) * 1.6));
  else if (def.hard) m = Math.ceil(q(0.6) * 1.1);
  else if (def.difficulty === 'Breather') m = Math.ceil(q(0.95) * 1.35);
  else m = Math.ceil(q(0.85) * 1.15);
  m = Math.max(12, Math.min(Object.keys(def.goals).length > 2 ? 50 : 45, m));
  table[n] = m;
  if (n % 250 === 0) require('fs').writeFileSync(OUT, JSON.stringify(table));
  if (n % 500 === 0) console.error(`L${n} ${def.difficulty} median ${q(0.5)} p85 ${q(0.85)} -> ${m}`);
}
require('fs').writeFileSync(OUT, JSON.stringify(table)); console.error('DONE', FROM, TO);
