/** Har bir hodimning smena vaqti */
import { fmtDurationNorm } from "./period.mjs";

export const DEFAULT_SHIFT_HOURS = 12;

/** Admin / smenasiz — faqat keldi-ketdi */
export function hasShiftTracking(staff) {
  return !staff?.noShift;
}

export function shiftStartFor(staff, staffKey) {
  if (!hasShiftTracking(staff)) return null;
  if (staff?.shiftStart) return staff.shiftStart;
  return "09:00";
}

export function shiftHoursFor(staff) {
  if (!hasShiftTracking(staff)) return 0;
  return Number(staff?.shiftHours ?? DEFAULT_SHIFT_HOURS);
}

export function shiftMsFor(staff) {
  return shiftHoursFor(staff) * 60 * 60 * 1000;
}

/** Smena tugashi: 09:00 + 12 soat → 21:00 */
export function shiftEndFor(staff, staffKey) {
  const [hh, mm] = shiftStartFor(staff, staffKey).split(":").map(Number);
  const totalMin = hh * 60 + mm + shiftHoursFor(staff) * 60;
  const eh = Math.floor(totalMin / 60) % 24;
  const em = totalMin % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

/** Telegram caption uchun: «07:30 — 19:30 (12 soat)» */
export function formatShiftLabel(staff, staffKey) {
  if (!hasShiftTracking(staff)) return null;
  const start = shiftStartFor(staff, staffKey);
  const end = shiftEndFor(staff, staffKey);
  const h = shiftHoursFor(staff);
  return `${start} — ${end} (${h} soat)`;
}

export function shiftStartMsToday(staff, staffKey, ms = Date.now()) {
  return shiftTimeMsToday(staff, staffKey, shiftStartFor(staff, staffKey), ms);
}

export function shiftEndMsToday(staff, staffKey, ms = Date.now()) {
  return shiftTimeMsToday(staff, staffKey, shiftEndFor(staff, staffKey), ms);
}

function shiftTimeMsToday(staff, staffKey, hhmm, ms) {
  const [hh, mm] = hhmm.split(":").map(Number);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const y = get("year");
  const mo = get("month");
  const d = get("day");
  return new Date(
    `${y}-${mo}-${d}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:00`
  ).getTime();
}

export function reminderMsBefore(staff, staffKey, ms = Date.now()) {
  return shiftStartMsToday(staff, staffKey, ms) - 10 * 60 * 1000;
}

function graceMs() {
  return Math.max(0, Number(process.env.LATE_GRACE_MIN || 0)) * 60_000;
}

/** Terminal vaqtini daqiqaga qisqartirish (14:26:45 → 14:26) */
export function clockMinuteMs(ms) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return new Date(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:00+05:00`
  ).getTime();
}

function shiftDeltaMs(staff, staffKey, eventMs, refMs) {
  const eventMin = clockMinuteMs(eventMs);
  return Math.max(0, eventMin - refMs - graceMs());
}

function shiftDeltaBeforeMs(staff, staffKey, eventMs, refMs) {
  const eventMin = clockMinuteMs(eventMs);
  return Math.max(0, refMs - eventMin - graceMs());
}

/** Birinchi kelishda kechikish (ms). Smena boshlanishidan keyin. */
export function calcLateMs(staff, staffKey, eventMs) {
  if (!hasShiftTracking(staff)) return 0;
  return shiftDeltaMs(staff, staffKey, eventMs, shiftStartMsToday(staff, staffKey, eventMs));
}

/** Birinchi kelishda erta kelish (ms). Smena boshlanishidan oldin. */
export function calcEarlyMs(staff, staffKey, eventMs) {
  if (!hasShiftTracking(staff)) return 0;
  return shiftDeltaBeforeMs(staff, staffKey, eventMs, shiftStartMsToday(staff, staffKey, eventMs));
}

/** Ketishda smena tugashidan keyin qo'shimcha ish (ms). */
export function calcOvertimeMs(staff, staffKey, eventMs) {
  if (!hasShiftTracking(staff)) return 0;
  return shiftDeltaMs(staff, staffKey, eventMs, shiftEndMsToday(staff, staffKey, eventMs));
}

/** Ketishda smena tugashidan oldin (ms). */
export function calcEarlyLeaveMs(staff, staffKey, eventMs) {
  if (!hasShiftTracking(staff)) return 0;
  return shiftDeltaBeforeMs(staff, staffKey, eventMs, shiftEndMsToday(staff, staffKey, eventMs));
}

/** Qaytishda tanaffus (ms). */
export function calcBreakMs(lastLeaveEventMs, eventMs) {
  if (!lastLeaveEventMs || lastLeaveEventMs >= eventMs) return 0;
  return Math.max(0, clockMinuteMs(eventMs) - clockMinuteMs(lastLeaveEventMs));
}

export function formatLateLabel(lateMs) {
  if (!lateMs || lateMs <= 0) return null;
  return fmtDurationNorm(lateMs);
}

export function formatEarlyLabel(earlyMs) {
  if (!earlyMs || earlyMs <= 0) return null;
  return fmtDurationNorm(earlyMs);
}

export function formatOvertimeLabel(overtimeMs) {
  if (!overtimeMs || overtimeMs <= 0) return null;
  return fmtDurationNorm(overtimeMs);
}

export function formatEarlyLeaveLabel(earlyLeaveMs) {
  if (!earlyLeaveMs || earlyLeaveMs <= 0) return null;
  return fmtDurationNorm(earlyLeaveMs);
}

export function formatBreakLabel(breakMs) {
  if (!breakMs || breakMs <= 0) return null;
  return fmtDurationNorm(breakMs);
}

export function listAllShifts(employees) {
  const rows = [];
  for (const [key, s] of Object.entries(employees.staff || {})) {
    if (!hasShiftTracking(s)) continue;
    rows.push({
      key,
      name: `${s.firstName || ""} ${s.lastName || ""}`.trim(),
      shift: formatShiftLabel(s, key),
      start: shiftStartFor(s, key),
      end: shiftEndFor(s, key),
      hours: shiftHoursFor(s),
    });
  }
  return rows.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
}
