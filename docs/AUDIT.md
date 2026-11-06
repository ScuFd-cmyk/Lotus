# Lotus Kingdom: audit report (0.1.0 → 0.2.0)

Date: 2026-11-06. Scope: `src/engine.js`, `src/ui_top.html`, `src/ui_bottom.html`, `data/`, `tools/`.
Line numbers in the findings table point to **0.1.0** (commit `d5a097e`, the initial import), so each finding can be reproduced against the original code.

## Summary

Lotus Kingdom's engine was in good shape: matching, gravity around driftwood, silt and level generation all held up under a 2,000-game fuzz test and a check of all 10,000 level definitions. The serious problems were in the **game flow**:

- **Critical:** after **Try again** or **Next level**, the board ignored all input. `startLevel()` never reset the `busy` flag left over from the end-of-level screen, so every tester would hit this within their first few levels.
- **High:** opening the menu during a cascade, or in the 450 ms before the win / out-of-moves screen, let the player restart or leave mid-move. That could crash (`outOfMoves()` on a null game) or **pay the win reward and refund the boosters at the same time**. This breaks the "no coins without winning" promise.
- **Fairness bugs that cost the player:** undo threw away tools bought with coins mid-level, a later undo took back the free +5 moves, and tools spent in a level were lost if the tab was closed.
- **Engine combo bugs:** Lotus + power-up didn't fire the partner, Dragonfly + Koi/Whirlpool lost the carried power-up when it landed on driftwood, and Whirlpool+Whirlpool made *every* whirlpool in the chain 7×7.

All critical, high and medium findings are fixed and covered by tests. `npm test` runs a build check, 27 Node tests (engine, levels, fuzz, colours) and 10 headless-browser tests.

No design decisions were changed. There are still no lives, no real-money sales, no flashes or shake, the same 5 stones and the same power-up rules, and the save format and key are unchanged. One optional field, `attempt`, was added to the save. Older saves load as before (see "Save compatibility").

## Findings

Severity: C = critical, H = high, M = medium, L = low. Status: **Fixed** (with test) unless noted.

| # | Sev | Area | Finding (0.1.0 location) | Reproduce | Fix | Status |
|---|---|---|---|---|---|---|
| 1 | C | Flow | Board frozen after **Try again** and after **Next level** from the win screen: `busy` set by `afterMove()` is never cleared by `startLevel()` (`ui_bottom.html:22`, `:357`) | Run out of moves → Try again → swipe: nothing happens | `resetFlow()` in `startLevel`/`goHome` | Fixed · ui test "out of moves", "win modal" |
| 2 | H | Flow / fairness | Pause has no `busy` check (`ui_bottom.html:432`). Restart/exit mid-cascade: the old async cascade keeps running on the new board or on `G = null` (TypeError). Restart in the 450 ms before `win()`: win pays out *after* boosters were refunded, and the win modal appears over the new level. Exit before `outOfMoves()`: crash | Make the winning move, tap pause immediately, Restart | Move flows carry an `epoch` and abort if it changes. Pause during a move opens when the basin settles. Pause is ignored while an end screen is pending. End timers are cancelled on start/home | Fixed · ui test "concurrency" |
| 3 | M | Fairness | Undo restores the whole inventory snapshot (`ui_bottom.html:160`), so a tool bought with coins after the snapshot disappears (coins lost) | Use your last Tap, buy one (−60 coins), Undo → you have 1 Tap instead of 2 | Undo gives back only the tools used since that point | Fixed · ui test "garden tools" |
| 4 | M | Fairness | Undo after taking the free +5 removes the +5 (`ui_bottom.html:424`): the snapshot predates the gift | Run out → +5 → Undo → 1 move left instead of 6 | +5 is also added to every undo point | Fixed · ui test |
| 5 | M | Fairness | Tools spent in a level are lost if the tab or app is closed mid-level (only in-app quit refunds) | Use Stir, close the tab, reopen → Stir gone | Spent tools are saved in `SAVE.attempt` and refunded on load | Fixed · ui test (reload) |
| 6 | M | Engine | Lotus + Koi/Whirlpool/Dragonfly never fires the swapped partner unless a converted stone's blast reaches it (`engine.js:394`) | Lotus next to a Koi with the target colour far away → the Koi stays on the board | Partner cell is always cleared (power-ups fire) | Fixed · engine test |
| 7 | M | Engine | Dragonfly + Koi/Whirlpool: the carried power-up is dropped when the dragonfly targets driftwood, which is its first choice on driftwood levels (`engine.js:202`) | Driftwood level, Dragonfly+Koi → only the dragonfly effect | Carried power-up goes off at the landing cell | Fixed · engine test |
| 8 | M | Engine | Whirlpool+Whirlpool sets `opts.bigTnt` for the whole wave, so every other whirlpool hit in the chain is also 7×7 (`engine.js:422`) | Two whirlpools combined with a third nearby | 7×7 only for the combined whirlpool | Fixed · engine test |
| 9 | M | Engine | A lotus set off in a chain re-uses the same colour (`opts.lightColor`) or the most common colour counted *including* stones already being cleared. The goal-colour bonus applies even when none of that colour is left (`engine.js:194`, `:234`) | Lotus+stone that also hits a second lotus → second lotus clears nothing | Chained lotus picks the most common colour not already queued. The goal bonus applies only if that colour is on the board | Fixed · engine test |
| 10 | M | Engine | `shuffle()` could return with no move (only `false`), leaving a stuck board (`engine.js:480`) | Nearly empty board (e.g. walled by driftwood) | Documented last resort: recolour without matches, then turn one stone into a Koi if still no move (DESIGN.md "Board repair") | Fixed · engine test |
| 11 | M | Compatibility | `structuredClone` (`ui_top.html:352-353`) is missing on older Android WebViews / Safari < 15.4. The fallback branch is outside `try`, so the game never boots | Open in an old WebView | JSON clone, plus save-field validation | Fixed |
| 12 | M | Mobile | Audio unlocks only via the board's `pointerdown`, which is not a user activation for touch on iOS/Android. Swipe-only players may never hear sound (`ui_top.html:359`) | iPhone: swipe only, no taps | Unlock on the first `pointerup`/`touchend`/`click`/`keydown` anywhere | Fixed (logic). Needs a real-device check |
| 13 | M | A11y | Secondary text `--ink2 #7d8a85` at 2.9–3.4:1, Hard label 2.8:1, low-moves amber 2.3:1 (WCAG AA needs 4.5 / 3 for large) (`ui_top.html:18`) | Contrast checker | `--ink2 #56625d` (5.1–6.0:1), `--hardText`, `--amberText`. Hues unchanged | Fixed · colour test |
| 14 | M | Tools | `merge-moves.js` replaced `data/moves.json` with only the parts passed (`merge-moves.js:3`), so merging one recalibrated range deleted the other levels | `node tools/merge-moves.js part.json` → table has 300 levels | Merges onto the existing table (`--fresh` to start empty), validates 12–50 | Fixed |
| 15 | L | Fairness | Daily used `levelDef(n)` of a Hard level ~1/7 of days (6 colours, tight moves) without the Hard label (`engine.js:620`) | e.g. 2026-01-08 | Daily skips Hard layouts | Fixed · engine test |
| 16 | L | Engine | `generate()` cleared the board after its 300th failed try, leaving empty cells (`engine.js:66`) | Theoretical | Keep the last board, then `shuffle()` | Fixed |
| 17 | L | Engine | `playMove(g, a, a)` on a plain stone cleared it for a move | Bot/tests only | Rejected unless it's a power-up | Fixed |
| 18 | L | Engine | `MOVES_TABLE` probed `require` before `MOVES_DATA`. A host that defines `module` (some editors / WebViews) would throw | — | Prefer inlined `MOVES_DATA` | Fixed |
| 19 | L | Flow | Win screen offers "Level 10001" after the last level | Clear level 10,000 | Button hidden past 10,000 | Fixed |
| 20 | L | Flow | Daily pre-level screen showed "Attempts so far" of the unrelated level the Daily borrows | Fail level N, open a Daily based on N | Hidden for Daily | Fixed |
| 21 | L | Flow | Tray buttons / undo could be triggered from the keyboard while a modal was open | Tab to a tray button behind the pause card, Enter | Ignored while a modal is open | Fixed · ui test |
| 22 | L | Mobile | iOS ignores `user-scalable=no`, so double-tap could zoom buttons. No landscape side safe areas | iPhone landscape | `touch-action: manipulation`, `overscroll-behavior: none`, left/right safe-area padding | Fixed |
| 23 | L | A11y | Unnamed / ambiguous controls: `×` close, `« ‹ › ◎`, garden nav "1–4", shop price buttons, tool buttons ("3 Tap") | Screen reader | `aria-label`s, `aria-pressed` on the active tool, dialog role + label, Escape closes, "last chapter" button | Fixed · ui test |
| 24 | L | A11y | Reduce Motion left spinning power-ups, hint bob and the breathing moves counter running. Not tied to the OS setting | Settings → Reduce motion | Stilled. New saves default to On if the OS asks for reduced motion | Fixed · ui test |
| 25 | L | Code | Dead code: `starPts`, `mult`, `noSplash` | — | Removed. Naming map comment added in `engine.js` and DESIGN.md | Fixed |
| 26 | L | A11y | Colour-blind palette under tritanopia: terracotta vs rose quartz ΔE 7.2 (others ≥ 8.3). Default palette under deuteranopia: jade vs rose quartz ΔE 0.9 | `tests/colours.test.js` report | Not changed. Every stone has a unique silhouette, so colour is never the only cue. The best single-colour tweak only reaches ΔE 8.3 and needs a dark brick red that breaks the pastel palette. Proposal below | Open (design) |
| 27 | L | A11y | "Flow/Serene/Harmony" praise text is white on pale water (≈1.4:1 without its shadow) | — | Decorative, transient, 42 px with a soft shadow. Left as is | Open |
| 28 | L | Tools | `sim.js`/`calibrate.js` use `Math.random`, so results drift ±12 points at 16 trials | Run twice | Documented. Seed the bot (next steps) | Open |

## Fairness promises (the in-game "Our promise" screen)

| Promise | Verdict | Evidence |
|---|---|---|
| No lives, no energy, no timers | True | No such code exists. Out of moves offers +5 / undo / retry / leave |
| Nothing sold for real money | True | No payment code, no network calls besides the Google Fonts stylesheet. The shop trades earned coins only |
| Every level beatable without boosters | True for the bot's sampled boards | Bot win rates below. Every level 1–10,000 has 12–50 moves (engine test) |
| Hard levels labelled, worth 2 lotus, followed by a Breather | True | Engine test: `hard ⇔ n % 7 === 0, n ≥ 7`, `n+1` is a Breather. Win gives 2 stars on a first Hard clear. The Daily no longer borrows Hard layouts (#15) |
| Failing costs nothing: power-ups come back, a loss drops the streak one step | True **after fixes #2–#5** | ui tests: refunds on retry / restart / quit / skip / tab close; undo + quit gives no duplicate; buying mid-level is safe; retry drops the streak by exactly 1 (3→2→1→0, never below 0) |
| Free +5 moves once per attempt | True (and now survives undo, #4) | ui test |
| Undo, three per attempt | True | ui test: the 4th undo is refused (Zen allows 99, by design) |
| Skip after 3 tries | True | Offered only on the 3rd recorded failure of your current level, never in Daily/Zen. ui test |
| Fair, seeded basins | True | Boards come from `hashStr('lk-board-' + n)`. Undo restores the RNG, so the same move after an undo gives the same result (engine test). Retry replays the same seed. No `Math.random` in game logic (only in visuals, Zen's seed and the bots) |
| No coins or lotus without winning | True **after fix #2** | Coins/stars are only added in `win()` and in the garden reward for finishing an area (paid once). ui test checks coins are unchanged after a refunded attempt + reload |
| Daily & Zen | True | Daily is stable per date (engine test) |
| No ads, no notifications, works offline | True | ui tests run with all http(s) requests blocked, from `file://`, with no console errors |
| Gentle and accessible | True with notes | Contrast fixed (#13). Reduce Motion verified (#24). No animation repeats faster than every 0.6 s, so nothing flashes above 3 Hz. CVD notes (#26) |

**Behaviour you may want to decide on:**

- **Zen mode never refunds tools.** In Zen you can't win, so tools used there are always spent. The promise only says power-ups come back "if you don't win", which arguably includes Zen. I left this unchanged because it's a design call.
- **Restart/leave from the Pause menu doesn't count as a failure.** It doesn't drop the streak or count toward Skip. This matches "Leaving costs nothing", but it means the streak penalty only applies when you actually run out of moves.

## Bot win rates

`node tools/sim.js 1 300 16` and `node tools/sim.js 9700 10000 16` (greedy one-move-lookahead bot, no boosters, 16 boards per level; "random" is a random-move bot for reference).

| Range | Difficulty | Levels | Greedy win rate, 0.1.0 | Greedy win rate, 0.2.0 | Lowest level (0.2.0) | Random bot |
|---|---|---|---|---|---|---|
| 1–300 | Normal | 31 | 95.1% | 95.1% | 75% | 24% |
| 1–300 | Tricky | 185 | 92.4% | 93.7% | 69% | 20% |
| 1–300 | Hard | 42 | 67.6% | 70.2% | 31%* | 10% |
| 1–300 | Breather | 42 | 97.7% | 98.9% | 88% | 48% |
| 9700–10000 | Tricky | 215 | 93.6% | 93.3% | 56% | 21% |
| 9700–10000 | Hard | 43 | 72.5% | 71.8% | 44% | 11% |
| 9700–10000 | Breather | 43 | 98.0% | 98.5% | 88% | 47% |

Thresholds: flag normal levels < 50% and Hard levels < 35%.
\* L231 (Hard, silt) dipped to 31% in the 16-trial run after the fixes (50% before). Re-measured with 200 trials: **49%**, so it was noise and no recalibration was needed. No other level was flagged in either range, so `data/moves.json` is unchanged.

These match the design spec (Normal ≈ 95%, Tricky ≈ 92%, Hard ≈ 74%, Breather ≈ 99%). The combo fixes made power-ups slightly stronger, which shows up as +1–3 points on Tricky/Hard/Breather in 1–300.

## Other checks

- **Performance:** with 4× CPU throttling (a mid-range phone stand-in), repeated Lotus+Whirlpool combos ran at p50 16.7 ms / p95 16.8 ms per frame with no long tasks. `render()` takes ~4.6 ms throttled (~1 ms normally) and does one forced layout per render, not one per piece. The Levels screen pages through all 100 chapters at well under 150 ms per page.
- **Memory:** 200 Zen moves leave `#fx` empty, exactly one `#pieceLayer` element per tile, and a flat DOM (~870 nodes).
- **Layout:** 320×568, 390×844 and 844×390 landscape show no page scroll, the board fully on screen, no text under 9 px, and every visible button named.
- **Offline / `file://`:** all UI tests run from `file://` with every network request blocked (so the fonts fall back to system fonts) and no console errors or unhandled rejections.

## Save compatibility

The key `lotus-kingdom-save` and all existing fields are unchanged. 0.2.0 adds the optional field `attempt: { pre: [...], used: {...} }`, which is written while a level is in progress and removed when it ends. `loadSave()` refunds and deletes it if present, so 0.1.0 saves (which never have it) load exactly as before. No migration is needed. Loading now also repairs missing or invalid sub-objects and negative or non-numeric inventory counts instead of crashing.

## Known limitations

- Audio unlock and safe areas are fixed in code but haven't been checked on a real iPhone or Android device. Headless Chromium can't emulate iOS Safari's audio policy.
- Frame timing comes from headless Chromium with CPU throttling, not a real GPU. A real mid-range phone (backdrop-filter blur, SVG drop-shadows) should be profiled during playtesting.
- The bot only tries 16 boards per level and uses unseeded randomness, so individual levels can swing ±12 points between runs.
- Accessibility was checked by script (contrast, names, motion). There was no screen-reader pass, and the board itself (8×8 swipe grid) has no keyboard or screen-reader way to play.
- Colour-blind separation relies on shapes for the closest pairs (#26).
- The UI tests reach into page globals (`G`, `busy`, `doSwap`) for setup, such as putting a power-up on the board or setting moves to 1. Every move a player makes is still done with real pointer input.

## What I'd do next

1. Playtest on a real iPhone (Safari) and a mid-range Android: sound on first swipe, safe areas in landscape, frame rate during big combos.
2. Seed the bots (`makeRng` instead of `Math.random`) and raise trials to 64 for Hard levels, so the win-rate table is reproducible and less noisy.
3. Decide the two open behaviours above (Zen refunds, pause-restart and the streak).
4. If shapes are not enough for tritanopes in playtests, consider giving rose quartz (Hard-only) a darker rim or inner pattern in the colour-blind palette rather than changing its body colour.
5. Add a keyboard / screen-reader way to play (arrow keys to move a cursor, Space to pick and swap).
6. Run the CI workflow (Phase 2) so `npm test` and the build check run on every push.
