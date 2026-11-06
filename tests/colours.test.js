// Colour checks: WCAG contrast for UI text and colour-vision-deficiency (CVD) separation of the stones.
// Run: node --test tests/colours.test.js   (prints a CVD report)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui_top.html'), 'utf8');

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const unlin = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const lum = h => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (fg, a, bg) => '#' + hex(fg).map((v, i) => Math.round((v * a + hex(bg)[i] * (1 - a)) * 255).toString(16).padStart(2, '0')).join('');
const cssVar = (name, scope = ':root{') => { const blk = css.slice(css.indexOf(scope)); const m = blk.match(new RegExp('--' + name + ':(#[0-9a-fA-F]{6})')); return m[1].toLowerCase(); };

test('WCAG AA contrast for UI text', () => {
  const ink = cssVar('ink'), ink2 = cssVar('ink2'), card = '#fbf7ef', sand = '#efe6d6', glass = mix('#ffffff', 0.55, sand);
  const pairs = [
    ['primary text on cards', ink, card, 4.5], ['secondary text on cards', ink2, card, 4.5], ['secondary text on sand', ink2, sand, 4.5],
    ['secondary text on the frosted HUD', ink2, glass, 4.5], ['segmented control', ink2, mix(ink, 0.08, card), 4.5],
    ['Hard label (11px)', cssVar('hardText'), glass, 4.5], ['low-moves counter (24px bold = large)', cssVar('amberText'), mix('#ffffff', 0.75, sand), 3],
    ['lotus button', '#5b2f3b', cssVar('lotus'), 4.5], ['jade button', '#1f4a3c', cssVar('jade'), 4.5], ['sky button', '#2b4e6b', '#bcd6ea', 4.5],
    ['ribbon', '#8c4558', mix('#e8a9b8', 0.35, card), 4.5], ['breather ribbon', '#2d6b55', mix('#8ecdb3', 0.35, card), 4.5],
    ['paragraphs', '#5f6b67', card, 4.5], ['skipped level', '#6b4a14', '#f0d6a8', 4.5], ['level button', ink, '#e9e1d2', 4.5],
    ['coins won (30px bold = large)', '#a8833a', card, 3],
  ];
  const fails = pairs.filter(([, a, b, min]) => contrast(a, b) < min).map(([n, a, b, min]) => `${n}: ${contrast(a, b).toFixed(2)} < ${min}`);
  assert.deepEqual(fails, []);
});

// Machado, Oliveira & Fernandes (2009), severity 1.0, applied in linear RGB.
const CVD = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const simulate = (h, M) => { const v = hex(h).map(lin); return M.map(row => unlin(Math.min(1, Math.max(0, row[0] * v[0] + row[1] * v[1] + row[2] * v[2])))); };
const toLab = rgb => {
  const [r, g, b] = rgb.map(lin);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const NAMES = ['jade', 'lavender', 'terracotta', 'moon', 'river', 'rose'];
function palette(scope) { return NAMES.map((_, i) => cssVar('c' + i + 'b', scope)); }

test('stones stay distinguishable under protanopia, deuteranopia and tritanopia', () => {
  const report = [];
  for (const [label, scope] of [['default', ':root{'], ['colour-blind', 'body.cb{']]) {
    const pal = palette(scope);
    for (const [type, M] of [['normal', null], ...Object.entries(CVD)]) {
      const labs = pal.map(h => toLab(M ? simulate(h, M) : hex(h)));
      let min = Infinity, pair = '';
      for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) { const d = dE(labs[i], labs[j]); if (d < min) { min = d; pair = NAMES[i] + '/' + NAMES[j]; } }
      let min5 = Infinity; // the 5 everyday stones (rose quartz is Hard-only)
      for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) min5 = Math.min(min5, dE(labs[i], labs[j]));
      report.push({ palette: label, vision: type, 'min dE (6)': +min.toFixed(1), closest: pair, 'min dE (5)': +min5.toFixed(1) });
    }
  }
  console.log('# CVD report (CIE76 dE between stone body colours; shapes are unique regardless)');
  for (const r of report) console.log('# ' + JSON.stringify(r));
  // Every stone also has a unique silhouette, so colour is never the only cue. This guards the
  // colour-blind palette against regressions: at the time of the audit its weakest pair is
  // terracotta/rose quartz under tritanopia (dE 7.2). See docs/AUDIT.md.
  for (const r of report.filter(r => r.palette === 'colour-blind')) assert.ok(r['min dE (6)'] >= 7, JSON.stringify(r));
});
