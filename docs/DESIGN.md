# Lotus Kingdom: design spec (summary)

The full spec is a shared doc. This file is the in-repo summary the code follows.

## Vision
A goal-based match-3 game in a still-water zen garden. It uses Royal Match's level structure and power-up set and Royal Kingdom's restore-the-realm meta, without lives or pay-walls.

## Screen
- **Header:** a frosted-glass strip with pause, level name, difficulty and a quiet score line on the left; goals in the centre; a round safe-moves counter on the right. At 5 or fewer moves the counter turns amber and breathes. It never turns red and never flashes.
- **Basin:** an 8×8 grid in a slate rim over sand, with clear water and a slow caustic shimmer. It takes about 65% of a portrait screen.
- **Tray:** round pebble buttons for Tap, Breeze, Rainfall and Stir, plus Undo, each with a small-caps label.
- **UI colors:** saturation ≤ 45%, lightness ≥ 55%. Buttons are pebble shapes with no hard corners or glossy bevels. Pop-ups slide up like a floating leaf.

## Stones
| Stone | Shape | Body | Rim |
|---|---|---|---|
| Jade Disc | circle | #8ECDB3 | #4E9C83 |
| Lavender Pebble | soft triangle | #B5A3DC | #7C68AE |
| Terracotta Tile | cushion square | #D98A6C | #A2543B |
| Moon Quartz | rounded hexagon | #F2E6CC | #B79E72 |
| River Drop | teardrop | #8DB4D9 | #4F7DA8 |
| Rose Quartz (Hard only) | heart | #EBA9B8 | #B76A7D |

Every stone has a unique silhouette and a different lightness, so players can read them in greyscale. The color-blind palette swaps hues to the Okabe-Ito set and keeps the shapes.

## Power-ups (all colorless, fire on tap or swipe)
| Power-up | Made by | Clears |
|---|---|---|
| Koi Current | 4 in a line | its row or column |
| Dragonfly | 2×2 square | 4 neighbours, then flies to the most useful goal tile |
| Whirlpool | L or T shape | 5×5 area |
| Lotus Bloom | 5 in a row | every stone of one color |

Code names differ from player-facing names (kept for save compatibility): `crate` = Driftwood, `grass` = Silt, `rocket`/`S_RH`/`S_RV` = Koi, `tnt`/`S_TNT` = Whirlpool, `light`/`S_LIGHT` = Lotus, `prop`/`S_PROP` = Dragonfly; tools `hammer`/`arrow`/`cannon`/`shuffle` = Tap/Breeze/Rainfall/Stir.

**Combos:** Koi+Koi clears a cross. Koi+Whirlpool clears 3 rows and 3 columns. Whirlpool+Whirlpool clears 7×7. Lotus+power-up converts a color into that power-up and fires them all. Lotus+Lotus clears the board. Dragonfly carries Koi or Whirlpool to its target.

## Board repair
- After every move, if no move is left, the basin stirs itself for free (`shuffle()`): first it reorders the stones, then if needed it recolours them. Either way it ends with no matches and at least one move.
- Last resort: on a nearly empty board where no colour layout gives a move, one stone becomes a free Koi so the player can always move. This should almost never happen (driftwood never covers more than 12 of the 64 cells).

## Obstacles
- **Driftwood:** 1–3 layers. It stays fixed and stones slide around it diagonally. It is damaged by adjacent matches or blasts.
- **Silt:** 1–2 layers under stones, cleared by clearing the stone on top.

## Feedback ("juice") rules
| Event | Visual | Sound |
|---|---|---|
| Swap | stones glide past each other (160 ms) | filtered-noise swish |
| Invalid swap | stones nudge and drift back | soft wooden tok, 220 Hz |
| Match | stones sink and fade, droplets, one ripple ring | pentatonic pebble clink; pitch rises each cascade step |
| Power-up | koi swims across, whirlpool swirls, lotus threads, dragonfly glides | water rush, 110 Hz whoosh, 528 Hz singing bowl, wing flutter |
| Chain of 3+ | "Flow", "Serene" or "Harmony" floats up | soft bell |
| Win | lotus flowers bloom across the basin | wind-chime arpeggio |

**Comfort rules:** no screen shake, no more than 3 flashes per second, and a Reduce Motion setting.

## Difficulty
- Moves for levels 1–10,000 come from a bot (one-move-lookahead greedy, no boosters). Each level gets the 85th percentile of moves the bot needed × 1.15. Hard levels get the 60th percentile × 1.1. Breathers get the 95th percentile × 1.35.
- Last measured bot win rates: Normal ≈ 95%, Tricky ≈ 92%, Hard ≈ 74%, Breather ≈ 99%.

## Open decision
Monetization if this ships: a one-time cosmetic Supporter Pack, or a single upfront price with no purchases at all.
