// Iteration 20 unit test for settleStatus:
// * whole-number corner/card lines must settle as won/lost (not void).
// * team totals accept under lines (home_under_1.5).
// Run: node /app/frontend/src/lib/__tests__/picks.iter20.test.mjs

import { settleStatus } from "../picks.js";

const tests = [];
const t = (name, got, expected) =>
  tests.push({ name, got, expected, ok: got === expected });

// corners whole-number: 8 corners played
t("corners_over_8 with 8 corners -> lost (not void)",
  settleStatus("corners_over_8", { home: 1, away: 0, detail: { totals: { corners: 8 } } }),
  "lost");
t("corners_under_8 with 8 corners -> lost",
  settleStatus("corners_under_8", { home: 1, away: 0, detail: { totals: { corners: 8 } } }),
  "lost");
t("corners_over_8 with 9 corners -> won",
  settleStatus("corners_over_8", { home: 1, away: 0, detail: { totals: { corners: 9 } } }),
  "won");
t("corners_under_8 with 7 corners -> won",
  settleStatus("corners_under_8", { home: 1, away: 0, detail: { totals: { corners: 7 } } }),
  "won");
// cards whole-number: 4 cards played
t("cards_over_4 with 4 cards -> lost",
  settleStatus("cards_over_4", { home: 1, away: 0, detail: { totals: { cards: 4 } } }),
  "lost");
t("cards_under_4 with 3 cards -> won",
  settleStatus("cards_under_4", { home: 1, away: 0, detail: { totals: { cards: 3 } } }),
  "won");
// corners .5 line still works
t("corners_over_9.5 with 10 corners -> won",
  settleStatus("corners_over_9.5", { home: 1, away: 0, detail: { totals: { corners: 10 } } }),
  "won");

// team totals under lines (new)
t("home_under_1.5 with home=1 -> won",
  settleStatus("home_under_1.5", { home: 1, away: 2 }),
  "won");
t("home_under_1.5 with home=2 -> lost",
  settleStatus("home_under_1.5", { home: 2, away: 0 }),
  "lost");
t("away_under_0.5 with away=0 -> won",
  settleStatus("away_under_0.5", { home: 1, away: 0 }),
  "won");
t("away_over_1.5 with away=2 -> won",
  settleStatus("away_over_1.5", { home: 0, away: 2 }),
  "won");

// Over/Under total still works both ways
t("over_2.5 with 3 goals -> won",
  settleStatus("over_2.5", { home: 2, away: 1 }),
  "won");
t("under_2.5 with 3 goals -> lost",
  settleStatus("under_2.5", { home: 2, away: 1 }),
  "lost");

let failed = 0;
for (const r of tests) {
  const tag = r.ok ? "PASS" : "FAIL";
  if (!r.ok) failed++;
  console.log(`${tag}  ${r.name}  (got=${JSON.stringify(r.got)}, expected=${JSON.stringify(r.expected)})`);
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
