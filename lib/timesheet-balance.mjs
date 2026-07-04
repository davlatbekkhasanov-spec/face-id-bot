import { restoreAllAttendanceData } from "./attendance-log.mjs";
import { recalculateShiftMetricsInRange } from "./timesheet-metrics.mjs";
import { buildTimesheetRange } from "./timesheet-data.mjs";
import { periodDayKeys } from "./period.mjs";

/** Tabel bilan bir xil tayyorgarlik */
export function prepareTimesheetForBalance(employees, fromKey, toKey) {
  restoreAllAttendanceData(employees);
  recalculateShiftMetricsInRange(employees, fromKey, toKey);
}

/** Tabel bilan bir xil: plus − minus, faqat to'liq kunlar */
export function computeStaffBalanceMs(employees, staffKey, fromKey, toKey) {
  const data = buildTimesheetRange(employees, fromKey, toKey);
  const st = data.staff.find((s) => s.staffKey === staffKey);
  return st?.totalBalanceMs ?? 0;
}

/** Ish haqi davri boshidan bugungacha (KETDI oylik balans) */
export function computePeriodBalanceMs(employees, staffKey, periodKey) {
  const keys = periodDayKeys(periodKey);
  if (!keys.length) return 0;
  const fromKey = keys[0];
  const toKey = keys[keys.length - 1];
  prepareTimesheetForBalance(employees, fromKey, toKey);
  return computeStaffBalanceMs(employees, staffKey, fromKey, toKey);
}
