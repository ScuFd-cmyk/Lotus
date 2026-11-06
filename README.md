# Lotus Kingdom

A calm, fair match-3 game set in a still-water zen garden. It takes the level structure and power-ups that make Royal Match and Royal Kingdom fun, and drops the parts players hate about Candy Crush and its rivals: lives, timers, pay-walls and hidden difficulty spikes.

**Play it:** open `index.html` in any browser (phone or desktop). It's one self-contained file. No install and no server needed.

## What's in the game

- **10,000 levels.** Goals are to clear driftwood, clear silt, or collect stones, with a move limit.
- **Five river stones** with distinct shapes: jade disc, lavender pebble, terracotta tile, moon quartz and river drop. A sixth, rose quartz, appears only on Hard levels.
- **Power-ups:**
  - Koi Current: match 4 in a line; clears a row or column.
  - Dragonfly: match a 2×2 square; flies to a goal tile.
  - Whirlpool: match an L or T shape; clears a 5×5 area.
  - Lotus Bloom: match 5 in a row; clears every stone of one color.
  - Swipe two power-ups together for combos.
- **Garden tools:** Tap, Gentle Breeze, Rainfall and Stir. All are earned through play.
- **Garden restoration:** spend lotus to restore four areas, which then cycle through the seasons.
- **Extra modes:** Zen mode (no goals, no limit) and Daily stillness (the same board for everyone each day).

## The fairness promise

- No lives, no energy, no timers.
- Nothing is sold for real money. Coins are earned only by playing.
- Every level was auto-playtested by a bot that never uses boosters. Move counts come from those results.
- Hard levels (every 7th) are labelled up front and are always followed by a Breather.
- A free +5 moves once per attempt, 3 undos per attempt, and a skip after 3 tries.
- Power-ups used in a lost attempt are refunded. A loss drops your win streak one step, not to zero.
- No ads, no notifications, and it works offline. Progress is saved in the browser on your device.

## Project layout

```
index.html            built game (what players open; GitHub Pages serves this)
src/engine.js         pure game logic: board, matching, gravity, power-ups, level generator
src/ui_top.html       markup, styles, art, sound, garden meta
src/ui_bottom.html    game flow, input, effects, screens
data/moves.json       bot-calibrated move counts for levels 1–10,000
tools/build.js        bundles src + data into index.html
tools/sim.js          bot win-rate report:   node tools/sim.js 1 100 16
tools/calibrate.js    recalibrate a range:    node tools/calibrate.js 1 500 12 data/moves.part.json
tools/merge-moves.js  merge calibration parts into data/moves.json (keeps all other levels)
tests/                node:test suites (engine, colours) + Playwright UI tests
docs/DESIGN.md        design spec summary
```

Build after any change in `src/` or `data/`:

```
node tools/build.js
```

Check that `index.html` is up to date (CI runs this): `node tools/build.js --check`

## Tests

```
npm install                       # dev only: Playwright for the UI tests
npx playwright install chromium   # once
npm test                          # build check + engine/colour tests + headless UI tests
npm run test:engine               # engine only, no dependencies
```

Recalibrate a range of levels, then merge it into the table:

```
node tools/calibrate.js 9700 10000 16 data/moves.part1.json
node tools/merge-moves.js data/moves.part1.json
node tools/build.js
```

## Playtesting

Please open an issue using the **Playtest feedback** template. Include the level number, your device and browser, and what felt unfair, confusing or great.
