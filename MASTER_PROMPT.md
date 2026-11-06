# Master prompt for Claude Code: Lotus Kingdom audit + GitHub release

Paste everything below the line into Claude Code, run from the root of the unzipped `lotus-kingdom` folder.

---

You are the lead engineer on **Lotus Kingdom**, a single-file HTML5 match-3 game. It is in this folder. Your job has two phases: (1) a full audit with fixes, then (2) publish it to a **new public GitHub repository** with a GitHub Pages playtest link. Read `README.md` and `docs/DESIGN.md` first. They describe the intended behaviour and the fairness promises the game makes to players.

## Ground rules
- `index.html` is a **build output**. Edit only `src/engine.js`, `src/ui_top.html`, `src/ui_bottom.html` and `data/`, then run `node tools/build.js`. Never hand-edit `index.html`.
- The game must stay **one self-contained HTML file** with no runtime dependencies. It must work offline and when opened straight from disk (`file://`), including in the Acode editor on Android. The only external request allowed is the Google Fonts stylesheet, and the game must still look right if it fails to load.
- **Do not change design decisions** without asking me first: no lives or energy, nothing sold for real money, the zen visual style (no flashes, no screen shake, pastel palette), the 5-stone set, the power-up rules, or the save format.
- **Do not break existing saves.** The localStorage key is `lotus-kingdom-save`. If you change the save shape, add a migration.
- Work in small, reviewable commits with clear messages. Before any commit, re-run the build and the checks below.

## Phase 1: full audit

Start with a plan in a TodoWrite list, then work through every area below. For each finding, record the severity (critical / high / medium / low), the file and line, how to reproduce it, and the fix. Fix everything critical, high and medium. List the low ones in the report and fix them if they're quick and safe.

### 1. Engine correctness (`src/engine.js`)
Write a Node test suite at `tests/engine.test.js` using `node:test`, with no dependencies. Cover:
- **Matching:**
  - Runs of 3, 4 and 5.
  - L and T shapes make a Whirlpool (`S_TNT`).
  - A 2×2 square makes a Dragonfly (`S_PROP`).
  - A square that overlaps a line merges correctly.
  - The power-up spawns on the swapped cell when it's part of the match.
- **Specials are colorless:** they never take part in colour matches. Moving any special always counts as a valid move.
- **Every combo in `fireSwap`:** Koi+Koi, Koi+Whirlpool, Whirlpool+Whirlpool, Lotus+gem, Lotus+each power-up, Lotus+Lotus, Dragonfly+Dragonfly, Dragonfly+Koi/Whirlpool (carry). Check none of them throw, leave matches unresolved, or double-count.
- **Gravity with driftwood (crates):**
  - No stone ever overlaps a crate.
  - The loop always terminates.
  - Cells enclosed by crates on every side may stay empty, but the board must still be playable.
  - Diagonal slides never move a crate.
- **Crate damage:** at most one layer per crate per clear wave, from adjacent matches or blasts. Silt (`grass`) loses one layer per cleared stone on top.
- **Board health:**
  - `generate()` never starts with a match and always has a move.
  - `shuffle()` always ends with no matches and at least one move, or the documented fallback runs.
  - After any move fully resolves there are no leftover matches, no duplicate tile ids, and no `undefined` cells.
- **Undo determinism:** `snapshot()`/`restore()` including RNG state. The same move after an undo gives the same result.
- **Level generator:** `levelDef(n)` for every n in 1..10,000:
  - No crate and silt on the same cell unless intended.
  - Goals are achievable: a collect goal's colour exists given `colors`.
  - `moves` is between 12 and 50.
  - Hard levels are exactly `n % 7 === 0` (n ≥ 7), and a Breather follows each one.
  - `dailyDef()` is stable for a given date.
- **Fuzz test:** 2,000 random games × 40 random valid moves each, asserting the invariants above after every move.

### 2. Fairness promises (players are told these, so they must be true)
Verify each line of the in-game **Our promise** screen (`showPromise` in `src/ui_bottom.html`) against the code. Each needs a test or a written explanation:
- **Boosters:** power-ups used are refunded on loss, retry, restart or quit, and never duplicated by any path (undo then quit, undo then retry, buying mid-level).
- **Free extras:** +5 moves once per attempt; undo limited to 3 per attempt.
- **Skip:** offered only after 3 failed attempts on your current level.
- **Streak:** a loss drops the streak by exactly 1.
- **No cheating the dice:** no code path lets the player reroll luck via undo, or gain coins or lotus without winning.
- **Bot difficulty:** run `node tools/sim.js 1 300 16` and `node tools/sim.js 9700 10000 16`. Report bot win rates by difficulty. Flag any level under 50% (normal) or 35% (Hard) and propose fixes. Recalibrate only those ranges with `tools/calibrate.js` + `tools/merge-moves.js`.

### 3. UI and game flow (`src/ui_*.html`)
Use Playwright with Chromium, at 390×844 with touch and at 1280×800. Install it as a dev dependency only; never ship it.
- **Full flow:** play levels 1–5 with real pointer swipes, including invalid swaps, tap-tap swaps, tapping power-ups, every garden tool, undo, pause/restart/quit, out-of-moves → +5 / undo / retry / skip, the win modal, the garden build flow, Zen, Daily, Shop, Settings and Levels (chapter paging across all 100 chapters).
- **Concurrency:** look for race conditions around the `busy` flag. Try double taps during cascades, opening pause mid-cascade, using a booster while a modal is open, resizing or rotating mid-move, and a modal + undo combination that leaves `busy` stuck.
- **Errors:** no console errors and no unhandled promise rejections.
- **Performance:** 60 fps target on a mid-range phone; check for layout thrash in `render()`. Check memory stays flat over 200 moves (no leaked DOM nodes in `#fx` or `#pieceLayer`). Check the Levels screen stays fast.
- **Mobile:**
  - iOS Safari safe areas (`viewport-fit=cover`).
  - Audio unlocks on the first touch (WebAudio resume).
  - No accidental page scroll or zoom while swiping.
  - Text stays legible at 320 px wide; landscape still works.
- **Accessibility:**
  - WCAG AA contrast for all text.
  - Buttons have accessible names.
  - Reduce Motion really disables ripples and caustics.
  - The colour-blind palette keeps all 6 stones distinguishable. Simulate protanopia, deuteranopia and tritanopia and report.
  - No flashing above 3 Hz.

### 4. Code health
- Remove dead code and unused variables. Make names consistent (code still says `crate`, `grass`, `rocket`, `tnt`, `light`, `prop` for driftwood, silt, koi, whirlpool, lotus, dragonfly). Add a short comment mapping them; do not rename the save keys.
- Make sure `tools/build.js`, `tools/sim.js` and `tools/calibrate.js` all run from the repo root as documented.
- Add an `npm test` script that runs the Node tests plus a headless smoke test.

### 5. Report
Write `docs/AUDIT.md` with:
- a summary;
- a findings table (severity, area, finding, status);
- the bot win-rate table;
- known limitations;
- what you'd do next.

Then show me a short summary and **wait for my OK before Phase 2.**

## Phase 2: publish for playtesting (after I approve)
1. Check `git` and the GitHub CLI (`gh auth status`). If `gh` isn't logged in, stop and tell me exactly what to run.
2. `git init` if needed. Make sure `.gitignore` excludes `node_modules/`, screenshots, logs and calibration part files. Commit with a clear history: initial import, then the audit fixes.
3. Create a **new public repository** named `lotus-kingdom` under my account: `gh repo create lotus-kingdom --public --source=. --remote=origin --push`. If the name is taken, ask me for another. Never overwrite an existing repo.
4. Enable **GitHub Pages** from the `main` branch root, e.g. `gh api -X POST repos/{owner}/lotus-kingdom/pages -f "source[branch]=main" -f "source[path]=/"`. Wait until the site is live and check that `https://<owner>.github.io/lotus-kingdom/` loads the game without console errors.
5. Add a GitHub Actions workflow `.github/workflows/ci.yml` that runs `npm test` and checks that `index.html` matches a fresh build. It should fail if someone edited `index.html` by hand.
6. Update `README.md` with:
   - the live **Play** link at the top;
   - a "How to give feedback" section pointing to the Playtest feedback issue template (already in `.github/ISSUE_TEMPLATE/`);
   - a short changelog.
7. Create labels `playtest`, `bug`, `balance` and `ux`. Open a pinned issue: "Playtest round 1 — what to try", with a checklist of features for testers.
8. Ask me which license I want before adding one. Default suggestion: all rights reserved during playtesting.
9. Finish by giving me:
   - the repo URL;
   - the Pages play link;
   - a ready-to-paste message I can send to playtesters.

Do not add analytics, tracking, ads or any network calls while doing any of this.
