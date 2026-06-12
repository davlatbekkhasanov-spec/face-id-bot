import { COOLDOWN_MS } from "./period.mjs";
import {
  saveStaffState,
  finalizeDayDebt,
  syncMonthlyForStaff,
  getMonthlyForStaff,
} from "./db.mjs";
import { formatShortCaption, formatPingBreakdown } from "./attendance-card.mjs";
import { fmtClock } from "./attendance-core.mjs";
import { shiftStartFor } from "./shifts.mjs";

/** Kun oxiri: bugun Face ID → СМЕНА ТУГАДИ, 12 soat, 0 qarz */
export const DAY_END_OVERRIDE_DATE = "2026-06-12";

export function isDayEndOverride(dk) {
  return dk === DAY_END_OVERRIDE_DATE;
}

function monthSnapshot(pk, key) {
  const m = getMonthlyForStaff(pk, key);
  return {
    monthWorkedMs: m?.worked_ms || 0,
    monthDebtMs: m?.debt_ms || 0,
    workDays: m?.work_days || 0,
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

/** Bugun: vaqtida kelgan deb hisoblanadi, skaner → smena tugadi + to'liq 12 soat */
export function buildDayEndOverrideCard(ctx) {
  const { key, who, staff, ev, pk, dk, shiftMs, rec, wall } = ctx;

  if (rec.lastScanMs && wall - rec.lastScanMs < COOLDOWN_MS) return null;

  rec.lastScanMs = wall;
  rec.dayKey = dk;
  rec.workedMs = shiftMs;
  rec.status = "out";
  rec.sessionStartMs = null;
  rec.hadLeave = true;

  finalizeDayDebt(key, who, dk, pk, shiftMs, shiftMs);
  syncMonthlyForStaff(pk, key, who);
  saveStaffState(recToRow(key, who, rec));

  const card = {
    staffKey: key,
    staffName: who,
    telegramId: staff.telegramId || null,
    kind: "left",
    clock: fmtClock(ev),
    dayKey: dk,
    periodKey: pk,
    dayWorkedMs: shiftMs,
    dayDebtMs: 0,
    status: "out",
    shiftMs,
    shiftStart: shiftStartFor(staff, key),
    ...monthSnapshot(pk, key),
  };
  card.caption = formatShortCaption(card);
  card.pingText = formatPingBreakdown(card);
  return card;
}
