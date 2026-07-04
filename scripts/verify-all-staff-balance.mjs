/** Barcha xodimlar uchun KETDI oylik balans = tabel balans ekanini tekshirish */
import path from "path";
import { fileURLToPath } from "url";
import { loadEmployees } from "../lib/attendance-core.mjs";
import { periodKey, periodDayKeys } from "../lib/period.mjs";
import { hasShiftTracking } from "../lib/shifts.mjs";
import { staffMonthlySalary } from "../lib/timesheet-salary.mjs";
import {
  prepareTimesheetForBalance,
  computeStaffBalanceMs,
  computePeriodBalanceMs,
} from "../lib/timesheet-balance.mjs";
import { buildTimesheetRange } from "../lib/timesheet-data.mjs";
import { calcBalansSum } from "../lib/timesheet-salary.mjs";
import { initDb } from "../lib/db.mjs";
import { initAttendanceLogSchema } from "../lib/attendance-log.mjs";
import { initPointsSchema } from "../lib/points-db.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = process.env.DATABASE_DIR || path.join(root, "data");

function initSchemas() {
  initDb(dataDir);
  initAttendanceLogSchema();
  initPointsSchema();
}

function main() {
  initSchemas();
  const employees = loadEmployees(dataDir);
  const pk = periodKey();
  const keys = periodDayKeys(pk);
  if (!keys.length) {
    console.log("Davr kunlari topilmadi");
    process.exit(1);
  }
  const fromKey = keys[0];
  const toKey = keys[keys.length - 1];

  console.log(`Davr: ${pk} (${fromKey} — ${toKey})\n`);

  const staffList = Object.entries(employees.staff || {});
  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const [key, s] of staffList) {
    const name = `${s.firstName || ""} ${s.lastName || ""}`.trim() || key;
    if (!hasShiftTracking(s)) {
      console.log(`⏭  ${name}: smenasiz — pul/balans yo'q`);
      skip += 1;
      continue;
    }
    const salary = staffMonthlySalary(s);
    if (!salary) {
      console.log(`⚠  ${name}: monthlySalary yo'q — KETDI pul ko'rsatmaydi`);
      skip += 1;
      continue;
    }

    const viaPeriod = computePeriodBalanceMs(employees, key, pk);
    prepareTimesheetForBalance(employees, fromKey, toKey);
    const data = buildTimesheetRange(employees, fromKey, toKey);
    const row = data.staff.find((x) => x.staffKey === key);
    const viaTabel = row?.totalBalanceMs ?? 0;

    if (viaPeriod !== viaTabel) {
      console.log(`❌ ${name}: KETDI ${viaPeriod} ms ≠ tabel ${viaTabel} ms`);
      fail += 1;
      continue;
    }

    const som = calcBalansSum(salary, viaPeriod);
    console.log(
      `✅ ${name} | smena ${s.shiftStart || "?"} | balans ${formatMs(viaPeriod)} | ${formatSom(som)} so'm`
    );
    ok += 1;
  }

  console.log(`\nNatija: ${ok} OK, ${skip} o'tkazildi, ${fail} xato`);
  process.exit(fail > 0 ? 1 : 0);
}

function formatMs(ms) {
  const sign = ms < 0 ? "-" : "+";
  const t = Math.abs(ms);
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  return `${sign}${h}:${String(m).padStart(2, "0")}`;
}

function formatSom(n) {
  const sign = n < 0 ? "−" : "+";
  return `${sign}${Math.abs(n).toLocaleString("ru-RU")}`;
}

main();
