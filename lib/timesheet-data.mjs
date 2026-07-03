import { fmtClockMs } from "./attendance-core.mjs";
import { staffReplyLabel } from "./admin-ui.mjs";
import { getTimesheetRowsInRange, getStaffState } from "./db.mjs";
import { getDailyPointsRow } from "./points-db.mjs";
import { hasShiftTracking, shiftHoursFor, shiftStartFor } from "./shifts.mjs";
import {
  dayKey,
  dayKeysInRange,
  dayNumberFromKey,
  fmtDurationNorm,
  fmtHoursShort,
  fmtRangeLabel,
} from "./period.mjs";

function emptyDay(dk) {
  return {
    dayKey: dk,
    dayNum: dayNumberFromKey(dk),
    firstIn: null,
    lastOut: null,
    workedMs: 0,
    lateMs: 0,
    debtMs: 0,
    overtimeMs: 0,
    cumLateMs: 0,
    cumOvertimeMs: 0,
  };
}

function mergeTodayFromState(staffKey, dk, day) {
  const st = getStaffState(staffKey);
  if (!st || st.day_key !== dk) return day;
  if (st.first_in_ms && !day.firstIn) day.firstIn = st.first_in_ms;
  if (st.status === "out" && st.last_leave_ms) day.lastOut = st.last_leave_ms;
  if (st.day_worked_ms > 0) day.workedMs = Math.max(day.workedMs, st.day_worked_ms);
  const pts = getDailyPointsRow(dk, staffKey);
  if (pts) {
    day.lateMs = pts.late_ms || 0;
    day.debtMs = pts.debt_ms || 0;
    day.overtimeMs = pts.overtime_ms || 0;
  }
  return day;
}

/** Eski yozuvlarda first_in yo'q — smena + ish vaqtidan keldi/ketdi tiklash */
function enrichDayTimes(day, staffEntry, employees) {
  if (!day.workedMs && !day.firstIn) return day;
  if (day.firstIn && day.lastOut) return day;

  const emp = employees.staff?.[staffEntry.staffKey];
  const dk = day.dayKey;
  let firstIn = day.firstIn;
  let inferred = false;
  if (!firstIn) {
    const start = shiftStartFor(emp, staffEntry.staffKey) || "09:00";
    const [hh, mm] = start.split(":").map(Number);
    firstIn = new Date(
      `${dk}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:00`
    ).getTime();
    firstIn += day.lateMs || 0;
    inferred = true;
  }

  let lastOut = day.lastOut;
  if (!lastOut && firstIn && day.workedMs > 0) {
    lastOut = firstIn + day.workedMs;
    inferred = true;
  }

  day.firstIn = firstIn;
  day.lastOut = lastOut;
  if (inferred) day.timesInferred = true;
  return day;
}

/** @returns {{ fromKey: string, toKey: string, rangeLabel: string, days: string[], staff: object[] }} */
export function buildTimesheetRange(employees, fromKey, toKey) {
  const dayKeys = dayKeysInRange(fromKey, toKey);
  const rows = getTimesheetRowsInRange(fromKey, toKey);
  const byStaff = new Map();

  for (const [key, s] of Object.entries(employees.staff || {})) {
    byStaff.set(key, {
      staffKey: key,
      name: staffReplyLabel(s),
      noShift: !hasShiftTracking(s),
      shiftHours: shiftHoursFor(s) || 12,
      days: new Map(dayKeys.map((dk) => [dk, emptyDay(dk)])),
      totalWorkedMs: 0,
      totalLateMs: 0,
      totalDebtMs: 0,
      totalMinusMs: 0,
      totalOvertimeMs: 0,
      totalNetMs: 0,
    });
  }

  for (const r of rows) {
    const st = byStaff.get(r.staff_key);
    if (!st) continue;
    const day = st.days.get(r.day_key) || emptyDay(r.day_key);
    day.firstIn = r.first_in_ms || null;
    day.lastOut = r.last_out_ms || null;
    day.workedMs = r.worked_ms || 0;
    day.debtMs = r.debt_ms || 0;
    day.lateMs = r.late_ms || 0;
    day.overtimeMs = r.overtime_ms || 0;
    if (r.first_in_ms) day.hasRealIn = true;
    if (r.last_out_ms) day.hasRealOut = true;
    st.days.set(r.day_key, day);
  }

  const today = dayKey();
  for (const st of byStaff.values()) {
    let cumLate = 0;
    let cumOt = 0;
    st.totalWorkedMs = 0;
    st.totalLateMs = 0;
    st.totalDebtMs = 0;
    st.totalMinusMs = 0;
    st.totalOvertimeMs = 0;
    st.totalNetMs = 0;
    for (const dk of dayKeys) {
      let day = st.days.get(dk) || emptyDay(dk);
      if (dk === today) day = mergeTodayFromState(st.staffKey, dk, day);
      day = enrichDayTimes(day, st, employees);
      const minusMs = (day.lateMs || 0) + (day.debtMs || 0);
      cumLate += minusMs;
      cumOt += day.overtimeMs;
      day.minusMs = minusMs;
      day.cumLateMs = cumLate;
      day.cumOvertimeMs = cumOt;
      day.netMs = Math.max(0, day.workedMs - minusMs + day.overtimeMs);
      st.days.set(dk, day);
      if (day.workedMs > 0 || day.firstIn) {
        st.totalWorkedMs += day.workedMs;
        st.totalLateMs += day.lateMs;
        st.totalDebtMs += day.debtMs;
        st.totalMinusMs += minusMs;
        st.totalOvertimeMs += day.overtimeMs;
        st.totalNetMs += day.netMs;
      }
    }
  }

  const staff = [...byStaff.values()].sort((a, b) => a.name.localeCompare(b.name, "uz"));

  return {
    fromKey,
    toKey,
    rangeLabel: fmtRangeLabel(fromKey, toKey),
    days: dayKeys,
    staff,
    totals: {
      workedMs: staff.reduce((s, x) => s + x.totalWorkedMs, 0),
      lateMs: staff.reduce((s, x) => s + x.totalLateMs, 0),
      overtimeMs: staff.reduce((s, x) => s + x.totalOvertimeMs, 0),
    },
  };
}

export function staffDetailRows(staffEntry) {
  const rows = [];
  for (const day of staffEntry.days.values()) {
    if (!day.workedMs && !day.firstIn) continue;
    rows.push({
      dayNum: day.dayNum,
      dayKey: day.dayKey,
      keldi: day.firstIn ? fmtClockMs(day.firstIn) : "—",
      ketdi: day.lastOut ? fmtClockMs(day.lastOut) : "—",
      worked: fmtHoursShort(day.workedMs),
      late: day.lateMs > 0 ? fmtHoursShort(day.lateMs) : "—",
      overtime: day.overtimeMs > 0 ? fmtHoursShort(day.overtimeMs) : "—",
      cumLate: day.cumLateMs > 0 ? fmtHoursShort(day.cumLateMs) : "—",
      cumOvertime: day.cumOvertimeMs > 0 ? fmtHoursShort(day.cumOvertimeMs) : "—",
      lateFlag: day.lateMs > 0,
    });
  }
  return rows;
}

export function timesheetCaption(data) {
  return (
    `📋 <b>TABEL</b>\n` +
    `📅 ${data.rangeLabel}\n` +
    `👥 ${data.staff.length} xodim · ` +
    `Ish: <b>${fmtDurationNorm(data.totals.workedMs)}</b> · ` +
    `Kech: <b>${fmtHoursShort(data.totals.lateMs)}</b> · ` +
    `Ortiqcha: <b>${fmtHoursShort(data.totals.overtimeMs)}</b>`
  );
}
