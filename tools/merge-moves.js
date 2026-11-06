// Merges calibration part files into data/moves.json.  Usage: node tools/merge-moves.js part1.json part2.json ...
// Parts are applied on top of the existing table, so recalibrating one range keeps every other level.
// Pass --fresh to start from an empty table instead.
const fs = require('fs'), path = require('path');
const target = path.join(__dirname, '..', 'data', 'moves.json');
const args = process.argv.slice(2);
const fresh = args.includes('--fresh');
const files = args.filter(a => a !== '--fresh');
if (!files.length) { console.error('usage: node tools/merge-moves.js [--fresh] part1.json [part2.json ...]'); process.exit(1); }
const out = fresh || !fs.existsSync(target) ? {} : JSON.parse(fs.readFileSync(target, 'utf8'));
let changed = 0;
for (const f of files) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(f, 'utf8')))) {
  if (!Number.isInteger(v) || v < 12 || v > 50) throw new Error(`${f}: level ${k} has invalid moves ${v}`);
  if (out[k] !== v) changed++;
  out[k] = v;
}
const keys = Object.keys(out).map(Number).sort((a, b) => a - b);
const sorted = {}; for (const k of keys) sorted[k] = out[k];
fs.writeFileSync(target, JSON.stringify(sorted));
console.log('levels', keys.length, 'from', keys[0], 'to', keys[keys.length - 1], '· changed', changed);
