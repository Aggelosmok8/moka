// A player who never took the field must not stay pending for ever: books void
// player props when the player does not feature. settleStatus returns "void"
// once the fixture's player stats are in, and stays pending (null) while they
// are still missing.  Run: node tests/picks_player.mjs
import { settleStatus } from "../src/lib/picks.js";

const played = {
  home: 2, away: 0,
  detail: {
    players: { "10008": { goals: 1, assists: 0, shots: 8, sot: 3, cards: 0 } },
    totals: { corners: 16, cards: 3 },
  },
};
const statsNotInYet = { home: 2, away: 0, detail: { totals: { corners: 16 } } };

const cases = [
  ["p10008_score", played, "won"],
  ["p10008_assist", played, "lost"],
  ["p999999_score", played, "void"],
  ["p999999_shots_over_0.5", played, "void"],
  ["p999999_score", statsNotInYet, null],
  ["corners_over_9.5", played, "won"],
];

let failed = 0;
for (const [pick, result, want] of cases) {
  const got = settleStatus(pick, result);
  if (got !== want) {
    failed++;
    console.error(`FAIL ${pick} -> ${got}, expected ${want}`);
  }
}
console.log(failed ? `${failed} failed` : `all ${cases.length} player settlement cases pass`);
process.exit(failed ? 1 : 0);
