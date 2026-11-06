// Builds the single-file game (index.html) from src/ + data/.  Usage: node tools/build.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const ui = read('src/ui_top.html') + read('src/ui_bottom.html');
let engine = read('src/engine.js').replace("if (typeof module !== 'undefined') module.exports", "if (typeof module !== 'undefined' && module.exports) module.exports");
const moves = JSON.stringify(JSON.parse(read('data/moves.json')));
const out = ui.replace('/*__MOVES__*/', () => 'const MOVES_DATA = ' + moves + ';').replace('/*__ENGINE__*/', () => engine);
fs.writeFileSync(path.join(root, 'index.html'), out);
console.log('index.html', (out.length / 1024).toFixed(0) + ' KB');
