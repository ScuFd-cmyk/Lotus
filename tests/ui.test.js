// Headless UI tests (Playwright + Chromium). Run: node --test tests/ui.test.js
// Playwright is a dev dependency only; the game itself never loads it.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  test('ui (skipped: playwright not installed — npm i -D playwright && npx playwright install chromium)', { skip: !process.env.CI }, () => { throw e; });
  return;
}
const FILE = 'file://' + path.join(__dirname, '..', 'index.html');
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 };
const DESKTOP = { viewport: { width: 1280, height: 800 } };
const BASE_SAVE = { seenIntro: true, settings: { speed: 2, hint: 0, cb: false, sound: false, still: false } };

let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser.close(); });

async function open(ctxOpts = PHONE, save = BASE_SAVE) {
  const ctx = await browser.newContext(ctxOpts);
  // offline: only the local file may load (Google Fonts is blocked on purpose: the game must still work)
  await ctx.route(/^https?:/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_INTERNET|net::/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(FILE);
  // seed the save, then reload so the game boots from it (later reloads keep the real save)
  if (save) { await page.evaluate(s => localStorage.setItem('lotus-kingdom-save', s), JSON.stringify(save)); await page.reload(); }
  return { ctx, page, errors };
}
// settled = no move running (or the level just ended and its end screen is on the way)
const settle = page => page.waitForFunction(() => G && (!busy || endTimer !== null || document.querySelector('#modal').classList.contains('on')), null, { timeout: 15000 });
// Tests don't need to watch every animation: shrink the timings (the CSS transitions still run).
const fast = page => page.evaluate(() => { T = { swap: 15, clear: 15, fall: 15 }; });
const modalOn = page => page.evaluate(() => document.querySelector('#modal').classList.contains('on'));
async function startLevel1(page) {
  await page.click('#playBtn');
  await page.click('#goBtn');
  await fast(page);
  await settle(page);
}
async function cellCenter(page, [r, c]) {
  const box = await page.locator('#board').boundingBox();
  const cell = await page.evaluate(() => CELL);
  return { x: box.x + (c + 0.5) * cell, y: box.y + (r + 0.5) * cell };
}
async function swipe(page, a, b) {
  const p = await cellCenter(page, a), q = await cellCenter(page, b);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, { steps: 3 });
  await page.mouse.move(q.x, q.y, { steps: 3 }); await page.mouse.up();
}
async function tap(page, a) { const p = await cellCenter(page, a); await page.mouse.click(p.x, p.y); }
const plainMove = page => page.evaluate(() => G.findMove());
// The board's internal invariants plus DOM agreement: one .piece per tile, no leftovers.
async function boardOk(page) {
  return page.evaluate(() => {
    const ids = new Set(); let tiles = 0;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const t = G.board[r][c];
      if (t === undefined) return 'undefined cell';
      if (!t) continue;
      if (ids.has(t.id)) return 'dup id'; ids.add(t.id); tiles++;
      const e = els.get(t.id);
      if (!e) return 'tile without element';
      if (e._pos[0] !== r || e._pos[1] !== c) return 'element out of place';
    }
    if (G.findGroups().length) return 'unresolved match';
    if (!G.findMove()) return 'no move';
    if (els.size !== tiles) return 'els map leak ' + els.size + ' vs ' + tiles;
    return 'ok';
  });
}

test('boots offline from file:// with fonts blocked, intro shows once, no errors', async () => {
  const { ctx, page, errors } = await open(DESKTOP, null);
  await page.waitForSelector('#introBtn');
  await page.click('#introBtn');
  assert.equal(await modalOn(page), false);
  await page.reload();
  assert.equal(await modalOn(page), false, 'intro only once');
  assert.match(await page.textContent('#playBtn'), /Level 1/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('level 1 with real swipes: valid, invalid, tap-tap and power-up taps', async () => {
  const { ctx, page, errors } = await open();
  await startLevel1(page);
  const moves0 = await page.evaluate(() => G.moves);
  // invalid swipe: stones nudge back, no move spent
  const bad = await page.evaluate(() => { for (let r = 0; r < N; r++) for (let c = 0; c < N - 1; c++) if (G.canSwap([r, c], [r, c + 1]) && !G.isValidSwap([r, c], [r, c + 1])) return [[r, c], [r, c + 1]]; });
  await swipe(page, ...bad); await page.waitForTimeout(50); await settle(page);
  assert.equal(await page.evaluate(() => G.moves), moves0, 'invalid swap is free');
  // valid swipe
  await swipe(page, ...(await plainMove(page))); await page.waitForTimeout(50); await settle(page);
  assert.equal(await page.evaluate(() => G.moves), moves0 - 1);
  assert.equal(await boardOk(page), 'ok');
  // tap-tap swap
  const m = await plainMove(page);
  await tap(page, m[0]); await tap(page, m[1]); await page.waitForTimeout(50); await settle(page);
  assert.equal(await page.evaluate(() => G.moves), moves0 - 2);
  // tapping each power-up fires it and costs one move
  for (const s of ['S_RH', 'S_RV', 'S_TNT', 'S_LIGHT', 'S_PROP']) {
    const before = await page.evaluate(() => G.moves);
    const at = await page.evaluate(s => { G.placeSpecials([eval(s)]); render(); for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (G.board[r][c] && G.board[r][c].s) return [r, c]; }, s);
    await tap(page, at); await page.waitForTimeout(50); await settle(page);
    if (await page.evaluate(() => endTimer !== null || document.querySelector('#modal').classList.contains('on'))) break; // goal reached
    assert.equal(await page.evaluate(() => G.moves), before - 1, s);
    assert.equal(await boardOk(page), 'ok', s);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('garden tools: each works, costs no move, undo returns it; buying mid-level survives undo', async () => {
  const { ctx, page, errors } = await open();
  await startLevel1(page);
  const inv0 = await page.evaluate(() => ({ ...SAVE.inv }));
  const moves0 = await page.evaluate(() => G.moves);
  for (const [k, cell] of [['hammer', [4, 4]], ['arrow', [2, 0]], ['cannon', [0, 5]]]) {
    await page.click(`.bst[data-k="${k}"]`);
    assert.equal(await page.isVisible('#boostHint'), true);
    await tap(page, cell); await page.waitForTimeout(50); await settle(page);
    assert.equal(await page.evaluate(k => SAVE.inv[k], k), inv0[k] - 1, k);
  }
  await page.click('.bst[data-k="shuffle"]'); await page.waitForTimeout(30); await settle(page);
  assert.equal(await page.evaluate(() => SAVE.inv.shuffle), inv0.shuffle - 1);
  assert.equal(await page.evaluate(() => G.moves), moves0, 'tools never cost moves');
  assert.equal(await boardOk(page), 'ok');
  await page.click('#undoBtn');
  assert.equal(await page.evaluate(() => SAVE.inv.shuffle), inv0.shuffle, 'undo returns the Stir');
  // spend the last Tap, buy one with coins, then undo the Tap: we must end with 2 (1 refunded + 1 bought)
  await page.evaluate(() => { SAVE.inv.hammer = 1; SAVE.coins = 500; renderBoosters(); });
  await page.click('.bst[data-k="hammer"]'); await tap(page, [3, 3]); await page.waitForTimeout(30); await settle(page);
  assert.equal(await page.evaluate(() => SAVE.inv.hammer), 0);
  await page.click('.bst[data-k="hammer"]'); // buys one
  assert.equal(await page.evaluate(() => [SAVE.inv.hammer, SAVE.coins]).then(x => x.join()), '1,440');
  await page.click('#undoBtn');
  assert.equal(await page.evaluate(() => SAVE.inv.hammer), 2, 'purchase kept after undo');
  assert.deepEqual(errors, []);
  await ctx.close();
});

async function runOut(page) {
  await page.evaluate(() => { G.moves = 1; updateHud(); });
  await swipe(page, ...(await plainMove(page)));
  await page.waitForSelector('#retryBtn', { timeout: 10000 });
}

test('out of moves: +5 once (kept through undo), 3 undos, retry works, streak -1, skip after 3 fails', async () => {
  const { ctx, page, errors } = await open(PHONE, { ...BASE_SAVE, streak: 3 });
  await page.click('#playBtn');
  await page.click('.pre .bst[data-k="rocket"]'); // a starting koi
  await page.click('#goBtn'); await settle(page);
  assert.equal(await page.evaluate(() => SAVE.inv.rocket), 1);
  await runOut(page);
  await page.click('#plusBtn');
  assert.equal(await page.evaluate(() => G.moves), 5);
  await page.click('#undoBtn');
  assert.equal(await page.evaluate(() => G.moves), 6, 'undo after +5 keeps the free moves');
  // use up the moves, the +5 is gone
  await page.evaluate(() => { G.moves = 1; updateHud(); });
  await swipe(page, ...(await plainMove(page)));
  await page.waitForSelector('#retryBtn');
  assert.equal(await page.isVisible('#plusBtn'), false, '+5 only once per attempt');
  assert.equal(await page.isVisible('#skipBtn'), false, 'no skip on the first failure');
  await page.click('#retryBtn');
  assert.equal(await page.evaluate(() => [SAVE.streak, SAVE.fails[1], SAVE.inv.rocket]).then(x => x.join()), '2,1,2', 'streak -1, fail counted, koi refunded');
  assert.equal(await page.evaluate(() => busy), false, 'board responsive after Try again');
  await swipe(page, ...(await plainMove(page))); await page.waitForTimeout(50); await settle(page);
  assert.equal(await page.evaluate(() => G.movesUsed), 1, 'a move after retry is accepted');
  // undo is capped at 3
  for (let i = 0; i < 4; i++) { await swipe(page, ...(await plainMove(page))); await page.waitForTimeout(30); await settle(page); }
  for (let i = 0; i < 4; i++) await page.evaluate(() => doUndo());
  assert.equal(await page.evaluate(() => undosLeft), 0);
  // fail twice more: skip appears on the 3rd failure
  await runOut(page); await page.click('#retryBtn');
  await settle(page);
  await runOut(page);
  assert.equal(await page.isVisible('#skipBtn'), true, 'skip on the 3rd failure');
  assert.equal(await page.evaluate(() => SAVE.streak), 1);
  await page.click('#skipBtn');
  assert.equal(await page.evaluate(() => [SAVE.level, SAVE.skipped[1], SAVE.streak]).then(x => x.join()), '2,true,0');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('win modal, next level responds, coins only from wins, boosters refunded on restart/quit and after reload', async () => {
  const { ctx, page, errors } = await open();
  await startLevel1(page);
  const coins0 = await page.evaluate(() => SAVE.coins);
  await page.evaluate(() => { for (const [c, n] of Object.entries(G.def.goals.collect)) G.collected[c] = n; });
  await swipe(page, ...(await plainMove(page)));
  await page.waitForSelector('#nextBtn', { timeout: 10000 });
  const coins1 = await page.evaluate(() => SAVE.coins);
  assert.ok(coins1 > coins0);
  assert.equal(await page.evaluate(() => [SAVE.level, SAVE.stars, SAVE.streak]).then(x => x.join()), '2,1,1');
  await page.click('#nextBtn'); await page.click('#goBtn'); await settle(page);
  assert.equal(await page.evaluate(() => busy), false, 'board responsive after Next level');
  await swipe(page, ...(await plainMove(page))); await page.waitForTimeout(50); await settle(page);
  assert.equal(await page.evaluate(() => G.movesUsed), 1);
  // spend tools, restart: refunded
  const inv = await page.evaluate(() => ({ ...SAVE.inv }));
  await page.click('.bst[data-k="shuffle"]'); await page.waitForTimeout(30); await settle(page);
  await page.click('#btnPause'); await page.click('#rstBtn'); await settle(page);
  assert.deepEqual(await page.evaluate(() => ({ ...SAVE.inv })), inv, 'restart refunds');
  // undo then quit: no duplication
  await page.click('.bst[data-k="shuffle"]'); await page.waitForTimeout(30); await settle(page);
  await page.click('#undoBtn');
  await page.click('#btnPause'); await page.click('#exitBtn');
  assert.deepEqual(await page.evaluate(() => ({ ...SAVE.inv })), inv, 'undo + quit: no duplicate');
  // closing the tab mid-level gives the tools back on the next load
  await page.click('#playBtn'); await page.click('#goBtn'); await settle(page);
  await page.click('.bst[data-k="shuffle"]'); await page.waitForTimeout(30); await settle(page);
  await page.click('.bst[data-k="hammer"]'); await tap(page, [2, 2]); await page.waitForTimeout(30); await settle(page);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lotus-kingdom-save')));
  assert.equal(saved.inv.shuffle, inv.shuffle - 1, 'the spend is saved');
  assert.deepEqual(saved.attempt.used, { shuffle: 1, hammer: 1 });
  await page.reload();
  assert.deepEqual(await page.evaluate(() => ({ ...SAVE.inv })), inv, 'refund after closing mid-level');
  assert.equal(await page.evaluate(() => SAVE.coins), coins1, 'no coins without a win');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('concurrency: double taps, pause and resize mid-cascade, leaving mid-cascade, modal + undo', async () => {
  const { ctx, page, errors } = await open();
  await startLevel1(page);
  // double swipe during a cascade: the second is ignored, board stays consistent
  const m = await plainMove(page);
  await swipe(page, ...m); await swipe(page, ...m); await tap(page, [0, 0]); await tap(page, [0, 0]);
  await page.waitForTimeout(30); await settle(page);
  assert.equal(await boardOk(page), 'ok');
  // pause tapped mid-cascade opens once the basin settles, not on top of a running move
  await page.evaluate(() => { G.placeSpecials([S_LIGHT]); render(); });
  const at = await page.evaluate(() => { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (G.board[r][c]?.s) return [r, c]; });
  await tap(page, at); await page.waitForTimeout(20);
  assert.equal(await page.evaluate(() => busy), true);
  await page.click('#btnPause');
  assert.equal(await modalOn(page), false, 'pause waits for the cascade');
  await settle(page); await page.waitForTimeout(50);
  assert.equal(await modalOn(page), true, 'pause opened after settling');
  assert.equal(await page.isVisible('#resBtn'), true);
  // a booster can't be used while a modal is open (keyboard / programmatic)
  const sh = await page.evaluate(() => SAVE.inv.shuffle);
  await page.evaluate(() => document.querySelector('.bst[data-k="shuffle"]').click());
  assert.equal(await page.evaluate(() => SAVE.inv.shuffle), sh);
  await page.click('#resBtn');
  // resize / rotate mid-move
  await swipe(page, ...(await plainMove(page)));
  await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(80);
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page); await page.waitForTimeout(120);
  assert.equal(await boardOk(page), 'ok');
  assert.equal(await page.evaluate(() => { for (const [, e] of els) { const [r, c] = e._pos; if (e.style.transform !== `translate(${c * CELL}px, ${r * CELL}px)` && e.style.transform !== `translate(${c * CELL}px,${r * CELL}px)`) return false; } return true; }), true, 'pieces match the new cell size');
  // leaving mid-cascade (e.g. Reset progress from settings) must not throw
  await page.evaluate(() => { const m = G.findMove(); doSwap(...m); setTimeout(goHome, 60); });
  await page.waitForTimeout(1500);
  // out-of-moves undo leaves the board usable
  await startLevel1(page);
  await runOut(page);
  await page.click('#undoBtn2');
  assert.equal(await page.evaluate(() => busy), false);
  await swipe(page, ...(await plainMove(page))); await page.waitForTimeout(30);
  await page.waitForSelector('#retryBtn');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('200 moves: DOM stays flat (no leaked #fx or #pieceLayer nodes)', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#btnZen'); await fast(page); await settle(page);
  const t0 = Date.now();
  await page.evaluate(async () => {
    for (let i = 0; i < 200; i++) {
      const m = G.findMove();
      if (m[0][0] === m[1][0] && m[0][1] === m[1][1]) await doFire(...m[0]); else await doSwap(m[0], m[1]);
      while (busy) await new Promise(r => setTimeout(r, 10));
    }
  });
  const ms = Date.now() - t0;
  await page.waitForTimeout(1600);
  const counts = await page.evaluate(() => ({ fx: document.querySelector('#fx').children.length, pieces: document.querySelector('#pieceLayer').children.length, tiles: G.board.flat().filter(Boolean).length, all: document.getElementsByTagName('*').length }));
  assert.equal(counts.fx, 0, 'fx empty');
  assert.equal(counts.pieces, counts.tiles, 'one element per tile');
  assert.ok(counts.all < 1500, 'total DOM nodes ' + counts.all);
  assert.equal(await boardOk(page), 'ok');
  assert.deepEqual(errors, []);
  console.log(`# 200 Zen moves in ${ms} ms; DOM nodes ${counts.all}`);
  await ctx.close();
});

test('screens: Zen, Daily, Shop, Settings, Promise, Levels across all 100 chapters, garden build', async () => {
  const { ctx, page, errors } = await open(DESKTOP, { ...BASE_SAVE, stars: 40, level: 1234 });
  for (const id of ['#btnShop', '#btnPromise', '#btnSettings']) { await page.click(id); assert.equal(await modalOn(page), true, id); await page.click('#card .close'); }
  await page.click('#btnDaily'); assert.match(await page.textContent('#card'), /Daily stillness/); await page.click('#goBtn'); await settle(page);
  assert.equal(await page.textContent('#lvlName'), 'Daily');
  await page.click('#btnPause'); await page.click('#exitBtn');
  await page.click('#btnZen'); await settle(page); assert.equal(await page.textContent('#movesN'), '∞');
  await page.click('#btnPause'); await page.click('#exitBtn');
  await page.click('#btnLevels');
  assert.match(await page.textContent('#card'), /Chapter 13/);
  await page.click('#chFirst');
  const t0 = Date.now();
  for (let i = 1; i < 100; i++) await page.click('#chNext');
  const per = (Date.now() - t0) / 99;
  assert.match(await page.textContent('#card'), /Chapter 100 · 9901–10000/);
  assert.equal(await page.isDisabled('#chNext'), true);
  await page.click('#chCur'); assert.match(await page.textContent('#card'), /Chapter 13/);
  await page.click('.lv.cur'); await page.click('#goBtn'); await settle(page);
  assert.equal(await page.textContent('#lvlName'), 'Level 1234');
  await page.click('#btnPause'); await page.click('#exitBtn');
  // garden build flow
  for (let i = 0; i < 5; i++) await page.click('#buildBtn');
  await page.waitForTimeout(1400);
  assert.equal(await page.evaluate(() => [SAVE.stars, Object.keys(SAVE.built).length]).then(x => x.join()), '32,5');
  assert.ok(per < 150, 'Levels paging ' + per.toFixed(0) + ' ms per chapter');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mobile layout: 320 px, landscape, no page scroll, all buttons named', async () => {
  for (const vp of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
    const { ctx, page, errors } = await open({ ...PHONE, viewport: vp });
    await startLevel1(page);
    const r = await page.evaluate(() => {
      const b = document.querySelector('#board').getBoundingClientRect();
      const hud = document.querySelector('.hud').getBoundingClientRect();
      const tray = document.querySelector('.tray').getBoundingClientRect();
      const small = [...document.querySelectorAll('#game *')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 9).map(e => e.className);
      return { sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight, board: [b.left, b.right, b.top, b.bottom], hudR: hud.right, trayB: tray.bottom, small };
    });
    assert.ok(r.sw <= r.w && r.sh <= r.h, 'no page scroll ' + JSON.stringify(r));
    assert.ok(r.board[0] >= 0 && r.board[1] <= r.w && r.board[3] <= r.h, 'board on screen ' + JSON.stringify(r));
    assert.ok(r.hudR <= r.w + 1, 'hud fits');
    assert.deepEqual(r.small, [], 'no text under 9px');
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent && !(b.getAttribute('aria-label') || b.textContent.trim())).map(b => b.id || b.className));
    assert.deepEqual(unnamed, [], 'every visible button has a name');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('reduce motion disables ripples, droplets and caustics', async () => {
  const { ctx, page, errors } = await open(PHONE, { ...BASE_SAVE, settings: { ...BASE_SAVE.settings, still: true, speed: 1 } });
  await startLevel1(page);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.caustic')).animationName), 'none');
  await page.evaluate(() => { new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && (n.classList.contains('ripple') || n.classList.contains('drop') || n.classList.contains('swirl') || n.classList.contains('thread'))) window.__moved = true; }))).observe(document.querySelector('#fx'), { childList: true }); });
  await swipe(page, ...(await plainMove(page))); await page.waitForTimeout(30); await settle(page);
  await page.evaluate(() => { G.placeSpecials([S_TNT]); render(); });
  const at = await page.evaluate(() => { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (G.board[r][c]?.s) return [r, c]; });
  await tap(page, at); await page.waitForTimeout(30); await settle(page);
  assert.equal(await page.evaluate(() => !!window.__moved), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});
