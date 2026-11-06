// Merges calibration part files into data/moves.json.  Usage: node tools/merge-moves.js part1.json part2.json ...
const fs = require('fs');
const out = {};
for (const f of process.argv.slice(2)) Object.assign(out, JSON.parse(fs.readFileSync(f, 'utf8')));
const keys = Object.keys(out).map(Number).sort((a, b) => a - b);
fs.writeFileSync(__dirname + '/../data/moves.json', JSON.stringify(out));
console.log('levels', keys.length, 'from', keys[0], 'to', keys[keys.length - 1]);
