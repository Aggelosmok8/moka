// Settlement regression for iteration 21: per-team fouls/saves/corners/shots/sot
// plus the match-total "saves_over_X" line that Superbet introduces.
import { settleStatus, needsDetail } from "../picks.js";

const cases = [
  // pick, result, expected
  ["home_corners_over_4.5",
    { home: 1, away: 1, detail: { totals: { corners_home: 5, corners_away: 3 } } }, "won"],
  ["home_corners_over_4.5",
    { home: 0, away: 0, detail: { totals: { corners_home: 4, corners_away: 3 } } }, "lost"],
  ["away_fouls_under_11.5",
    { home: 0, away: 0, detail: { totals: { fouls_home: 10, fouls_away: 11 } } }, "won"],
  ["away_fouls_under_11.5",
    { home: 0, away: 0, detail: { totals: { fouls_home: 10, fouls_away: 12 } } }, "lost"],
  ["home_shots_over_12.5",
    { home: 1, away: 0, detail: { totals: { shots_home: 13, shots_away: 7 } } }, "won"],
  ["home_shots_over_12.5",
    { home: 1, away: 0, detail: { totals: { shots_home: 12, shots_away: 7 } } }, "lost"],
  ["away_sot_under_4.5",
    { home: 1, away: 1, detail: { totals: { sot_home: 5, sot_away: 4 } } }, "won"],
  ["away_sot_under_4.5",
    { home: 1, away: 1, detail: { totals: { sot_home: 5, sot_away: 5 } } }, "lost"],
  ["saves_over_6.5",
    { home: 1, away: 1, detail: { totals: { saves: 7 } } }, "won"],
  ["saves_over_6.5",
    { home: 1, away: 1, detail: { totals: { saves: 6 } } }, "lost"],
  // No detail yet -> null (not falsely settled from score)
  ["home_corners_over_4.5", { home: 2, away: 1 }, null],
  ["saves_over_6.5", { home: 2, away: 1 }, null],
];

let pass = 0, fail = 0;
for (const [pick, r, expected] of cases) {
  const got = settleStatus(pick, r);
  if (got === expected) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL ${pick}: got=${got} expected=${expected}`);
  }
}

// needsDetail: must be true for all the new per-team / saves picks
const needsDetailCases = [
  "home_corners_over_4.5",
  "away_fouls_under_11.5",
  "home_shots_over_12.5",
  "away_sot_under_4.5",
  "saves_over_6.5",
  "home_saves_over_3.5",
];
for (const p of needsDetailCases) {
  if (needsDetail(p)) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL needsDetail(${p}) returned false`);
  }
}

console.log(`picks.iter21: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
