import { dayKey, periodKey } from "./period.mjs";
import { shiftMsFor, shiftStartFor } from "./shifts.mjs";
import {
  getStaffState,
  saveStaffState,
  finalizeDayDebt,
  syncMonthlyForStaff,
  getMonthlyForStaff,
} from "./db.mjs";
import { formatShortCaption } from "./attendance-card.mjs";
import { displayName } from "./attendance-core.mjs";

function freshRec() {
  return { status: "out", sessionStartMs: null, lastScanMs: 0, dayKey: "", workedMs: 0, hadLeave: false };
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

function fmtClockNow() {
  return new Date().toLocaleTimeString("uz-UZ", {
    timeZone: "Asia/Tashkent",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function finishCard(staffKey, staff, who, rec, kind, dayDebtMs, pk, dk) {
  const shiftMs = shiftMsFor(staff);
  const card = {
    staffKey,
    staffName: who,
    telegramId: staff.telegramId || null,
    kind,
    clock: fmtClockNow(),
    dayKey: dk,
    periodKey: pk,
    dayWorkedMs: rec.workedMs,
    dayDebtMs,
    status: rec.status,
    shiftMs,
    shiftStart: shiftStartFor(staff, staffKey),
    ...monthSnapshot(pk, staffKey),
  };
  card.caption = formatShortCaption(card);
  return card;
}

/** Admin: keldi / ketdi */
export function buildManualCard(staffKey, employees, intent) {
  const staff = employees.staff?.[staffKey];
  if (!staff) return { error: "Hodim topilmadi" };

  const who = displayName(staffKey, {}, employees);
  const wall = Date.now();
  const pk = periodKey(wall);
  const dk = dayKey(wall);
  const shiftMs = shiftMsFor(staff);

  const rec = rowToRec(getStaffState(staffKey));
  ensureDay(rec, wall);
  rec.lastScanMs = wall;

  let kind;
  let dayDebtMs = Math.max(0, shiftMs - rec.workedMs);

  if (intent === "in") {
    if (rec.status === "in") return { error: `${who} allaqachon ishda` };
    const back = rec.hadLeave || rec.workedMs > 0;
    rec.status = "in";
    rec.sessionStartMs = wall;
    kind = back ? "returned" : "arrived";
    saveStaffState(recToRow(staffKey, who, rec));
  } else if (intent === "out") {
    if (rec.status !== "in") return { error: `${who} ishda emas` };
    const sessionMs = Math.max(0, wall - (rec.sessionStartMs || wall));
    rec.workedMs += sessionMs;
    rec.status = "out";
    rec.sessionStartMs = null;
    rec.hadLeave = true;
    kind = "left";
    dayDebtMs = finalizeDayDebt(staffKey, who, dk, pk, rec.workedMs, shiftMs);
    syncMonthlyForStaff(pk, staffKey, who);
    saveStaffState(recToRow(staffKey, who, rec));
  } else {
    return { error: "Noto'g'ri amal" };
  }

  return { card: finishCard(staffKey, staff, who, rec, kind, dayDebtMs, pk, dk) };
}
