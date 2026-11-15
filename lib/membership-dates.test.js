const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateRenewalDate,
  isValidDate,
  membershipDurationMonths,
} = require("./membership-dates");

test("calculates plan durations and clamps dates to the last day of the month", () => {
  assert.equal(membershipDurationMonths("Strength Training · 3 Months"), 3);
  assert.equal(membershipDurationMonths("Strength & Cardio · 1 Year"), 12);
  assert.equal(calculateRenewalDate("2026-01-31", "Strength Training · 1 Month"), "2026-02-28");
  assert.equal(calculateRenewalDate("2024-02-29", "Strength Training · 1 Year"), "2025-02-28");
});

test("does not infer a renewal for plans without a stated term or invalid dates", () => {
  assert.equal(membershipDurationMonths("Personal Training"), null);
  assert.equal(calculateRenewalDate("2026-05-10", "Custom"), null);
  assert.equal(calculateRenewalDate("2026-02-30", "Strength Training · 3 Months"), null);
  assert.equal(isValidDate("2026-02-30"), false);
});
