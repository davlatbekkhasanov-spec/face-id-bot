import { COOLDOWN_MS, dayKey, periodKey } from "./period.mjs";
import { shiftMsFor, shiftStartFor, shiftEndFor, shiftHoursFor, formatShiftLabel, hasShiftTracking, calcLateMs, formatLateLabel, calcEarlyMs, formatEarlyLabel, calcOvertimeFromWorkedMs, formatOvertimeLabel, calcBreakMs, formatBreakLabel, isGhostNightScan, repairGhostSessionBeforeLeave } from "./shifts.mjs";
import {
  getDb,
  getStaffState,
  saveStaffState,
  finalizeDayDebt,
  syncMonthlyForStaff,
  getMonthlyForStaff,
  wasSerialProcessed,
  markSerial,
} from "./db.mjs";
import { formatShortCaption } from "./attendance-card.mjs";
import { applyPointsToCard } from "./points.mjs";
import { pushNoShiftAttendanceToHub } from "./yordamchi-push.mjs";
import { clearAbsenceIfArrived } from "./absence-db.mjs";
import {
  isFaceEvent,
  staffKey,
  displayName,
  eventTimeMs,
  fmtClock,
  parseClockToday,
  fmtClockMs,
} from "./attendance-core.mjs";

export { isFaceEvent, loadEmployees, staffKey, displayName, eventTimeMs, fmtClock, parseClockToday, fmtClockMs } from "./attendance-core.mjs";

function freshRec() {
  return {
    status: "out",
    sessionStartMs: null,
    lastScanMs: 0,
    dayKey: "",
    workedMs: 0,
    hadLeave: false,
    lastLeaveMs: null,
    firstInMs: null,
  };
}

function rowToRec(row) {
  if (!row) return freshRec();
  return {
    status: row.status,
    sessionStartMs: row.session_start_ms,
    lastScanMs: row.last_scan_ms,
    dayKey: row.day_key,
    workedMs: row.day_worked_ms,
    hadLeave: !!row.had_leave,
    lastLeaveMs: row.last_leave_ms || null,
    firstInMs: row.first_in_ms || null,
  };
}

function recToRow(key, name, rec) {
  return {
    staff_key: key,
    staff_name: name,
    status: rec.status,
    session_start_ms: rec.sessionStartMs,
    last_scan_ms: rec.lastScanMs,
    day_key: rec.dayKey,
    day_worked_ms: rec.workedMs,
    had_leave: rec.hadLeave ? 1 : 0,
    last_leave_ms: rec.lastLeaveMs,
    first_in_ms: rec.firstInMs,
  };
}

function ensureDay(rec, now) {
  const dk = dayKey(now);
  if (rec.dayKey !== dk) {
    rec.dayKey = dk;
    rec.workedMs = 0;
    rec.hadLeave = false;
    rec.status = "out";
    rec.sessionStartMs = null;
    rec.lastLeaveMs = null;
    rec.firstInMs = null;
  }
}

function attachShiftExtras(card, staff, key, kind, eventMs, rec) {
  if (!hasShiftTracking(staff)) return;
  card.shiftStart = shiftStartFor(staff, key);
  card.shiftEnd = shiftEndFor(staff, key);
  card.shiftHours = shiftHoursFor(staff);
  card.shiftLabel = formatShiftLabel(staff, key);
  if (kind === "arrived") {
    card.lateMs = calcLateMs(staff, key, eventMs);
    card.lateLabel = formatLateLabel(card.lateMs);
    card.earlyMs = calcEarlyMs(staff, key, eventMs);
    card.earlyLabel = formatEarlyLabel(card.earlyMs);
  }
  if (kind === "returned" && card.breakMs > 0) {
    card.breakLabel = formatBreakLabel(card.breakMs);
  }
  if (kind === "left") {
    card.overtimeMs = calcOvertimeFromWorkedMs(staff, rec.workedMs);
    card.overtimeLabel = formatOvertimeLabel(card.overtimeMs);
    if (rec.firstInMs) {
      card.firstInClock = fmtClockMs(rec.firstInMs);
      card.firstLateMs = calcLateMs(staff, key, rec.firstInMs);
      card.firstLateLabel = formatLateLabel(card.firstLateMs);
      card.firstEarlyMs = calcEarlyMs(staff, key, rec.firstInMs);
      card.firstEarlyLabel = formatEarlyLabel(card.firstEarlyMs);
    }
  }
}

function monthSnapshot(pk, key) {
  const m = getMonthlyForStaff(pk, key);
  return {
    monthWorkedMs: m?.worked_ms || 0,
    monthDebtMs: m?.debt_ms || 0,
    workDays: m?.work_days || 0,
  };
}

export function buildAttendanceCard(ev, employees) {
  if (!isFaceEvent(ev)) return null;

  const key = staffKey(ev, employees);
  const staff = employees.staff?.[key];
  if (!staff) return null;

  const card = getDb().transaction(() => {
    const serial = Number(ev.serialNo || 0);
    if (serial && wasSerialProcessed(serial)) return null;

    const who = displayName(key, ev, employees);
    const now = eventTimeMs(ev);
    const wall = Date.now();
    const pk = periodKey(now);
    const dk = dayKey(now);
    const trackShift = hasShiftTracking(staff);
    const shiftMs = trackShift ? shiftMsFor(staff) : 0;

    const rec = rowToRec(getStaffState(key));
    ensureDay(rec, now);

    if (rec.lastScanMs && wall - rec.lastScanMs < COOLDOWN_MS) return null;
    rec.lastScanMs = wall;

    if (rec.status !== "in" && trackShift && isGhostNightScan(now, staff, key)) {
      saveStaffState(recToRow(key, who, rec));
      return null;
    }

    const clock = fmtClock(ev);
    const telegramId = staff.telegramId || null;
    let kind;
    let dayDebtMs = Math.max(0, shiftMs - rec.workedMs);
    let sessionMs = 0;
    let breakMs = 0;

    if (rec.status !== "in") {
      if (trackShift && rec.hadLeave && rec.lastLeaveMs) {
        breakMs = calcBreakMs(rec.lastLeaveMs, now);
      }
      rec.status = "in";
      rec.sessionStartMs = now;
      kind = trackShift && (rec.hadLeave || rec.workedMs > 0) ? "returned" : "arrived";
      if (kind === "arrived") {
        if (!rec.firstInMs || isGhostNightScan(rec.firstInMs, staff, key)) rec.firstInMs = now;
      } else if (kind === "returned" && isGhostNightScan(rec.firstInMs, staff, key)) {
        rec.firstInMs = now;
      }
      clearAbsenceIfArrived(key, dk);
      saveStaffState(recToRow(key, who, rec));
    } else {
      if (trackShift) repairGhostSessionBeforeLeave(rec, staff, key, now);
      sessionMs = Math.max(0, now - (rec.sessionStartMs || now));
      rec.workedMs += sessionMs;
      rec.status = "out";
      rec.sessionStartMs = null;
      if (trackShift) {
        rec.hadLeave = true;
        rec.lastLeaveMs = now;
      }
      kind = "left";
      if (trackShift) {
        dayDebtMs = finalizeDayDebt(key, who, dk, pk, rec.workedMs, shiftMs, {
          firstInMs: rec.firstInMs,
          lastOutMs: now,
        });
        syncMonthlyForStaff(pk, key, who);
      } else {
        finalizeDayDebt(key, who, dk, pk, rec.workedMs, 0, {
          firstInMs: rec.firstInMs,
          lastOutMs: now,
        });
      }
      saveStaffState(recToRow(key, who, rec));
    }

    const month = monthSnapshot(pk, key);
    const built = {
      staffKey: key,
      staffName: who,
      telegramId,
      kind,
      clock,
      dayKey: dk,
      periodKey: pk,
      dayWorkedMs: rec.workedMs,
      dayDebtMs,
      status: rec.status,
      shiftMs,
      noShift: !trackShift,
      ...month,
    };
    attachShiftExtras(built, staff, key, kind, now, rec);
    if (!trackShift && rec.firstInMs) {
      built.firstInClock = fmtClockMs(rec.firstInMs);
    }
    if (kind === "returned") {
      built.breakMs = breakMs;
      built.breakLabel = formatBreakLabel(breakMs);
    }
    if (kind === "left") built.sessionMs = sessionMs;
    if (rec.firstInMs) built.firstInMs = rec.firstInMs;
    if (kind === "left") built.lastOutMs = now;
    if (serial) markSerial(serial);
    return built;
  })();
  if (!card) return null;
  applyPointsToCard(card, staff);
  if (card.noShift) pushNoShiftAttendanceToHub(card, staff);
  card.caption = formatShortCaption(card);
  return card;
}

export function buildMessage(ev, _state, employees) {
  const card = buildAttendanceCard(ev, employees);
  if (!card) return null;
  return card.caption;
}

function manualEvent(staffKey, staff, eventMs) {
  const name =
    staff.deviceName ||
    `${staff.firstName || ""} ${staff.lastName || ""}`.trim() ||
    staffKey;
  return {
    name,
    employeeNoString: staffKey,
    time: new Date(eventMs).toISOString(),
    minor: 75,
    serialNo: 0,
  };
}

/** Admin qo'lda: keldi/ketdi + ixtiyoriy vaqt (HH:MM) */
export function buildManualAttendanceCard(staffKey, employees, intent, clockHHMM = null) {
  const staff = employees.staff?.[staffKey];
  if (!staff) return { error: "Hodim topilmadi" };
  if (intent !== "in" && intent !== "out") return { error: "Noto'g'ri amal" };

  let eventMs = Date.now();
  if (clockHHMM) {
    const parsed = parseClockToday(clockHHMM);
    if (!parsed) return { error: "Vaqt noto'g'ri (masalan 14:30)" };
    eventMs = parsed;
  }

  const ev = manualEvent(staffKey, staff, eventMs);
  const who = displayName(staffKey, ev, employees);
  const pk = periodKey(eventMs);
  const dk = dayKey(eventMs);
  const trackShift = hasShiftTracking(staff);
  const shiftMs = trackShift ? shiftMsFor(staff) : 0;

  const tx = getDb().transaction(() => {
    const rec = rowToRec(getStaffState(staffKey));
    ensureDay(rec, eventMs);
    rec.lastScanMs = Date.now();

    let kind;
    let dayDebtMs = Math.max(0, shiftMs - rec.workedMs);
    let sessionMs = 0;
    let breakMs = 0;

    if (intent === "in") {
      if (rec.status === "in") return { error: `${who} allaqachon ishda` };
      if (trackShift && rec.hadLeave && rec.lastLeaveMs) {
        breakMs = calcBreakMs(rec.lastLeaveMs, eventMs);
      }
      rec.status = "in";
      rec.sessionStartMs = eventMs;
      kind = trackShift && (rec.hadLeave || rec.workedMs > 0) ? "returned" : "arrived";
      if (kind === "arrived" && !rec.firstInMs) rec.firstInMs = eventMs;
    } else {
      if (rec.status !== "in") return { error: `${who} ishda emas` };
      sessionMs = Math.max(0, eventMs - (rec.sessionStartMs || eventMs));
      rec.workedMs += sessionMs;
      rec.status = "out";
      rec.sessionStartMs = null;
      if (trackShift) {
        rec.hadLeave = true;
        rec.lastLeaveMs = eventMs;
      }
      kind = "left";
      if (trackShift) {
        dayDebtMs = finalizeDayDebt(staffKey, who, dk, pk, rec.workedMs, shiftMs, {
          firstInMs: rec.firstInMs,
          lastOutMs: eventMs,
        });
        syncMonthlyForStaff(pk, staffKey, who);
      } else {
        finalizeDayDebt(staffKey, who, dk, pk, rec.workedMs, 0, {
          firstInMs: rec.firstInMs,
          lastOutMs: eventMs,
        });
      }
    }

    saveStaffState(recToRow(staffKey, who, rec));

    const month = monthSnapshot(pk, staffKey);
    const card = {
      staffKey,
      staffName: who,
      telegramId: staff.telegramId || null,
      kind,
      clock: fmtClock(ev),
      dayKey: dk,
      periodKey: pk,
      dayWorkedMs: rec.workedMs,
      dayDebtMs,
      status: rec.status,
      shiftMs,
      noShift: !trackShift,
      manual: true,
      ...month,
    };

    attachShiftExtras(card, staff, staffKey, kind, eventMs, rec);
    if (!trackShift && rec.firstInMs) {
      card.firstInClock = fmtClockMs(rec.firstInMs);
    }
    if (kind === "returned") {
      card.breakMs = breakMs;
      card.breakLabel = formatBreakLabel(breakMs);
    }
    if (kind === "left") card.sessionMs = sessionMs;
    if (rec.firstInMs) card.firstInMs = rec.firstInMs;
    if (kind === "left") card.lastOutMs = eventMs;

    return { card };
  });

  const result = tx();
  if (result?.error) return result;
  applyPointsToCard(result.card, staff);
  if (result.card.noShift) pushNoShiftAttendanceToHub(result.card, staff);
  result.card.caption = formatShortCaption(result.card);
  return result;
}
