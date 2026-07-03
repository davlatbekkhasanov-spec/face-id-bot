import { finalizeDayDebt, getTimesheetRowsInRange } from "./db.mjs";
import { computeDayPoints } from "./points.mjs";
import { upsertDailyPoints } from "./points-db.mjs";
import { periodKey } from "./period.mjs";
import {
  calcLateMs,
  calcOvertimeMs,
  hasShiftTracking,
  shiftMsFor,
} from "./shifts.mjs";

/** Keldi/ketdi vaqtidan kech, qarz, ortiqcha */
export function computeDayShiftMetrics(staff, staffKey, { firstInMs, lastOutMs, workedMs } = {}) {
  if (!hasShiftTracking(staff)) {
    return { lateMs: 0, debtMs: 0, overtimeMs: 0, workedMs: workedMs || 0 };
  }
  const shiftMs = shiftMsFor(staff);
  let worked = Math.max(0, Number(workedMs) || 0);
  let lastOut = lastOutMs || null;
  if (!worked && firstInMs && lastOut) {
    worked = Math.max(0, lastOut - firstInMs);
  }
  if (!lastOut && firstInMs && worked > 0) {
    lastOut = firstInMs + worked;
  }
  const lateMs = firstInMs ? calcLateMs(staff, staffKey, firstInMs) : 0;
  let overtimeMs = lastOut ? calcOvertimeMs(staff, staffKey, lastOut) : 0;
  if (overtimeMs <= 0 && worked > shiftMs) {
    overtimeMs = worked - shiftMs;
  }
  const debtMs = Math.max(0, shiftMs - worked);
  return { lateMs, debtMs, overtimeMs, workedMs: worked, lastOutMs: lastOut };
}

export function applyDayShiftMetrics(staffKey, staffName, dayKey, metrics, employees) {
  const staff = employees.staff?.[staffKey];
  const pk = periodKey(new Date(`${dayKey}T12:00:00+05:00`));
  const shiftMs = hasShiftTracking(staff) ? shiftMsFor(staff) : 0;

  finalizeDayDebt(staffKey, staffName, dayKey, pk, metrics.workedMs, shiftMs, {
    firstInMs: metrics.firstInMs,
    lastOutMs: metrics.lastOutMs || metrics.lastOut,
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

/** Bazadagi kunlarni qayta hisoblash (forward/import dan keyin) */
export function recalculateShiftMetricsInRange(employees, fromKey, toKey) {
  const rows = getTimesheetRowsInRange(fromKey, toKey);
  let updated = 0;
  for (const r of rows) {
    if (!r.first_in_ms && !r.worked_ms) continue;
    const staff = employees.staff?.[r.staff_key];
    if (!staff) continue;
    let lastOut = r.last_out_ms;
    if (!lastOut && r.first_in_ms && r.worked_ms > 0) {
      lastOut = r.first_in_ms + r.worked_ms;
    }
    const metrics = computeDayShiftMetrics(staff, r.staff_key, {
      firstInMs: r.first_in_ms,
      lastOutMs: lastOut,
      workedMs: r.worked_ms,
    });
    applyDayShiftMetrics(r.staff_key, r.staff_name, r.day_key, {
      ...metrics,
      firstInMs: r.first_in_ms,
      lastOutMs: metrics.lastOutMs || lastOut,
    }, employees);
    updated += 1;
  }
  return updated;
}
