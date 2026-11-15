const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function membershipDurationMonths(plan) {
  const match = String(plan || "").match(/(?:^|[\s·])(\d+)\s+(month|months|year|years)\b/i);
  if (!match) return null;
  const count = Number(match[1]);
  if (!Number.isInteger(count) || count < 1) return null;
  return count * (/^year/i.test(match[2]) ? 12 : 1);
}

function calculateRenewalDate(registrationDate, plan) {
  const months = membershipDurationMonths(plan);
  if (!months || !isValidDate(registrationDate)) return null;

  const [year, month, day] = registrationDate.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = targetMonth % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);

  return `${String(targetYear).padStart(4, "0")}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

function currentDateInTimeZone(timeZone = "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

module.exports = { calculateRenewalDate, currentDateInTimeZone, isValidDate, membershipDurationMonths };
