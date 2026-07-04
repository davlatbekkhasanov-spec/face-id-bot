import { finalizeDayDebt, getTimesheetRowsInRange } from "./db.mjs";
import { computeDayPoints } from "./points.mjs";
import { upsertDailyPoints } from "./points-db.mjs";
import { periodKey } from "./period.mjs";
import {
  calcLateMs,
  calcOvertimeFromWorkedMs,
  hasShiftTracking,
  shiftMsFor,
} from "./shifts.mjs";

/** FAQAT haqiqiy keldi/ketdi vaqtidan — taxmin yo'q */
export function computeDayShiftMetrics(staff, staffKey, { firstInMs, lastOutMs, workedMs } = {}) {
  if (!hasShiftTracking(staff)) {
    return { lateMs: 0, debtMs: 0, overtimeMs: 0, workedMs: workedMs || 0 };
  }
  if (!firstInMs || !lastOutMs) {
    return {
      lateMs: 0,
      debtMs: 0,
      overtimeMs: 0,
      workedMs: Math.max(0, Number(workedMs) || 0),
    };
  }

  const shiftMs = shiftMsFor(staff);
  let worked = Math.max(0, Number(workedMs) || 0);
  if (!worked) worked = Math.max(0, lastOutMs - firstInMs);

  const lateMs = calcLateMs(staff, staffKey, firstInMs);
  const debtMs = Math.max(0, shiftMs - worked);
  const overtimeMs = calcOvertimeFromWorkedMs(staff, worked);

  return { lateMs, debtMs, overtimeMs, workedMs: worked };
}

export function applyDayShiftMetrics(staffKey, staffName, dayKey, metrics, employees) {
  const staff = employees.staff?.[staffKey];
  const pk = periodKey(new Date(`${dayKey}T12:00:00+05:00`));
  const shiftMs = hasShiftTracking(staff) ? shiftMsFor(staff) : 0;

  finalizeDayDebt(staffKey, staffName, dayKey, pk, metrics.workedMs, shiftMs, {
    firstInMs: metrics.firstInMs,
    lastOutMs: metrics.lastOutMs,
  });

  if (!hasShiftTracking(staff)) return;

  const computed = computeDayPoints({
    late_ms: metrics.lateMs,
    debt_ms: metrics.debtMs,
    overtime_ms: metrics.overtimeMs,
  });
  upsertDailyPoints({
    day_key: dayKey,
    period_key: pk,
    staff_key: staffKey,
    staff_name: staffName,
    late_ms: metrics.lateMs,
    debt_ms: metrics.debtMs,
    overtime_ms: metrics.overtimeMs,
    ...computed,
  });
}

/** Faqat bazada haqiqiy first_in + last_out bor kunlar */
export function recalculateShiftMetricsInRange(employees, fromKey, toKey) {
  const rows = getTimesheetRowsInRange(fromKey, toKey);
  let updated = 0;
  for (const r of rows) {
    if (!r.first_in_ms || !r.last_out_ms) continue;
    const staff = employees.staff?.[r.staff_key];
    if (!staff) continue;
    const metrics = computeDayShiftMetrics(staff, r.staff_key, {
      firstInMs: r.first_in_ms,
      lastOutMs: r.last_out_ms,
      workedMs: r.worked_ms,
    });
    applyDayShiftMetrics(
      r.staff_key,
      r.staff_name,
      r.day_key,
      { ...metrics, firstInMs: r.first_in_ms, lastOutMs: r.last_out_ms },
      employees
    );
    updated += 1;
  }
  return updated;
}
