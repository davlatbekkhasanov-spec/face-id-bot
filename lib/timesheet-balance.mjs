import { buildTimesheetRange } from "./timesheet-data.mjs";
import { periodDayKeys } from "./period.mjs";

/** Tabel bilan bir xil: plus − minus, faqat to'liq kunlar */
export function computeStaffBalanceMs(employees, staffKey, fromKey, toKey) {
  const data = buildTimesheetRange(employees, fromKey, toKey);
  const st = data.staff.find((s) => s.staffKey === staffKey);
  return st?.totalBalanceMs ?? 0;
}

/** Ish haqi davri boshidan bugungacha (KETDI «Oy davomidagi qarzingiz») */
export function computePeriodBalanceMs(employees, staffKey, periodKey) {
  const keys = periodDayKeys(periodKey);
  if (!keys.length) return 0;
  return computeStaffBalanceMs(employees, staffKey, keys[0], keys[keys.length - 1]);
}
