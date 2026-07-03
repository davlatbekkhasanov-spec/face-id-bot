import { fmtClockMs } from "./attendance-core.mjs";
import { staffReplyLabel } from "./admin-ui.mjs";
import { getPeriodTimesheetRows, getStaffState } from "./db.mjs";
import { getDailyPointsRow } from "./points-db.mjs";
import { hasShiftTracking } from "./shifts.mjs";
import {
  dayKey,
  dayNumberFromKey,
  fmtDurationNorm,
  fmtHoursShort,
  periodDayKeys,
  periodKey,
  periodLabel,
} from "./period.mjs";

function emptyDay(dk) {
  return {
    dayKey: dk,
    dayNum: dayNumberFromKey(dk),
    firstIn: null,
    lastOut: null,
    workedMs: 0,
    lateMs: 0,
    overtimeMs: 0,
    cumLateMs: 0,
    cumOvertimeMs: 0,
  };
}

function mergeTodayFromState(staffKey, staff, dk, day) {
  const st = getStaffState(staffKey);
  if (!st || st.day_key !== dk) return day;
  if (st.first_in_ms && !day.firstIn) day.firstIn = st.first_in_ms;
  if (st.status === "out" && st.last_leave_ms) day.lastOut = st.last_leave_ms;
  if (st.day_worked_ms > 0) day.workedMs = Math.max(day.workedMs, st.day_worked_ms);
  const pts = getDailyPointsRow(dk, staffKey);
  if (pts) {
    day.lateMs = pts.late_ms || 0;
    day.overtimeMs = pts.overtime_ms || 0;
  }
  return day;
}

/** @returns {{ periodKey: string, periodLabel: string, days: string[], staff: object[] }} */
export function buildTimesheet(employees, pk = periodKey()) {
  const dayKeys = periodDayKeys(pk);
  const rows = getPeriodTimesheetRows(pk);
  const byStaff = new Map();

  for (const [key, s] of Object.entries(employees.staff || {})) {
    byStaff.set(key, {
      staffKey: key,
      name: staffReplyLabel(s),
      noShift: !hasShiftTracking(s),
      days: new Map(dayKeys.map((dk) => [dk, emptyDay(dk)])),
      totalWorkedMs: 0,
      totalLateMs: 0,
      totalOvertimeMs: 0,
    });
  }

  for (const r of rows) {
    const st = byStaff.get(r.staff_key);
    if (!st) continue;
    const day = st.days.get(r.day_key) || emptyDay(r.day_key);
    day.firstIn = r.first_in_ms || null;
    day.lastOut = r.last_out_ms || null;
    day.workedMs = r.worked_ms || 0;
    day.lateMs = r.late_ms || 0;
    day.overtimeMs = r.overtime_ms || 0;
    st.days.set(r.day_key, day);
  }

  const today = dayKey();
  let cumLateAll = 0;
  let cumOtAll = 0;

  for (const st of byStaff.values()) {
    let cumLate = 0;
    let cumOt = 0;
    for (const dk of dayKeys) {
      let day = st.days.get(dk) || emptyDay(dk);
      if (dk === today) day = mergeTodayFromState(st.staffKey, employees.staff?.[st.staffKey], dk, day);
      cumLate += day.lateMs;
      cumOt += day.overtimeMs;
      day.cumLateMs = cumLate;
      day.cumOvertimeMs = cumOt;
      st.days.set(dk, day);
      if (day.workedMs > 0 || day.firstIn) {
        st.totalWorkedMs += day.workedMs;
        st.totalLateMs += day.lateMs;
        st.totalOvertimeMs += day.overtimeMs;
      }
    }
    cumLateAll += st.totalLateMs;
    cumOtAll += st.totalOvertimeMs;
  }

  const staff = [...byStaff.values()]
    .filter((s) => s.totalWorkedMs > 0 || [...s.days.values()].some((d) => d.firstIn))
    .sort((a, b) => a.name.localeCompare(b.name, "uz"));

  return {
    periodKey: pk,
    periodLabel: periodLabel(pk),
    days: dayKeys,
    staff,
    totals: { workedMs: staff.reduce((s, x) => s + x.totalWorkedMs, 0), lateMs: cumLateAll, overtimeMs: cumOtAll },
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
    `📋 <b>TABEL</b> · ${data.periodLabel}\n` +
    `👥 ${data.staff.length} xodim · ` +
    `Ish: <b>${fmtDurationNorm(data.totals.workedMs)}</b> · ` +
    `Kech: <b>${fmtHoursShort(data.totals.lateMs)}</b> · ` +
    `Ortiqcha: <b>${fmtHoursShort(data.totals.overtimeMs)}</b>`
  );
}
