// Builds the single-file game (index.html) from src/ + data/.
//   node tools/build.js           write index.html
//   node tools/build.js --check   exit 1 if index.html differs from a fresh build (it was edited by hand)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const ui = read('src/ui_top.html') + read('src/ui_bottom.html');
let engine = read('src/engine.js').replace("if (typeof module !== 'undefined') module.exports", "if (typeof module !== 'undefined' && module.exports) module.exports");
const moves = JSON.stringify(JSON.parse(read('data/moves.json')));
const out = ui.replace('/*__MOVES__*/', () => 'const MOVES_DATA = ' + moves + ';').replace('/*__ENGINE__*/', () => engine);
const target = path.join(root, 'index.html');
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (cur !== out) { console.error('index.html is out of date or was edited by hand. Edit src/ or data/, then run: node tools/build.js'); process.exit(1); }
  console.log('index.html matches a fresh build');
} else {
  fs.writeFileSync(target, out);
  console.log('index.html', (out.length / 1024).toFixed(0) + ' KB');
}
