import { finalizeDayDebt, getDb, syncMonthlyForStaff } from "./db.mjs";
import { parseClockToday } from "./attendance-core.mjs";
import { periodKey } from "./period.mjs";
import { shiftMsFor } from "./shifts.mjs";
import { staffReplyLabel } from "./admin-ui.mjs";
import { computeDayShiftMetrics, applyDayShiftMetrics } from "./timesheet-metrics.mjs";

export function initAttendanceLogSchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS attendance_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_key TEXT NOT NULL,
      period_key TEXT NOT NULL,
      staff_key TEXT NOT NULL,
      staff_name TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL,
      event_ms INTEGER NOT NULL,
      worked_ms INTEGER NOT NULL DEFAULT 0,
      first_in_ms INTEGER,
      last_out_ms INTEGER,
      logged_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_att_log_staff_day ON attendance_log(staff_key, day_key);
  `);
}

function msOnDay(dayKey, clockHHMM) {
  const m = String(clockHHMM || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = String(Number(m[1])).padStart(2, "0");
  const mm = m[2];
  return new Date(`${dayKey}T${hh}:${mm}:00+05:00`).getTime();
}

function eventMsFromCard(card) {
  if (card.kind === "left" && card.lastOutMs) return card.lastOutMs;
  if ((card.kind === "arrived" || card.kind === "returned") && card.firstInMs) {
    return card.firstInMs;
  }
  if (card.clock && card.dayKey) {
    const ref = new Date(`${card.dayKey}T12:00:00+05:00`).getTime();
    const parsed = parseClockToday(card.clock, ref);
    if (parsed) return parsed;
  }
  return Date.now();
}

/** Har bir guruh xabari — keyin tiklash uchun */
export function logAttendanceCard(card) {
  if (!card?.staffKey || !card?.dayKey || !card?.kind) return false;
  const eventMs = eventMsFromCard(card);
  const firstIn =
    card.firstInMs ||
    (card.firstInClock && card.dayKey ? msOnDay(card.dayKey, card.firstInClock) : null);
  const lastOut =
    card.kind === "left"
      ? card.lastOutMs || eventMs
      : card.lastOutMs || null;

  getDb()
    .prepare(
      `INSERT INTO attendance_log
       (day_key, period_key, staff_key, staff_name, kind, event_ms, worked_ms, first_in_ms, last_out_ms, logged_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      card.dayKey,
      card.periodKey || periodKey(new Date(`${card.dayKey}T12:00:00+05:00`)),
      card.staffKey,
      card.staffName || "",
      card.kind,
      eventMs,
      Math.max(0, card.dayWorkedMs || 0),
      firstIn,
      lastOut,
      Date.now()
    );
  return true;
}

function shiftMsForStaff(employees, staffKey) {
  const staff = employees.staff?.[staffKey];
  if (!staff || staff.noShift) return 0;
  return shiftMsFor(staff);
}

function upsertDayFromEvents(staffKey, staffName, dayKey, periodKey, events, employees) {
  let firstIn = null;
  let lastOut = null;
  let workedMs = 0;

  for (const ev of events) {
    if ((ev.kind === "arrived" || ev.kind === "returned") && ev.first_in_ms) {
      firstIn = firstIn ?? ev.first_in_ms;
    } else if (ev.kind === "arrived" || ev.kind === "returned") {
      firstIn = firstIn ?? ev.event_ms;
    }
    if (ev.kind === "left") {
      lastOut = ev.last_out_ms || ev.event_ms;
      if (ev.worked_ms > 0) workedMs = ev.worked_ms;
    }
  }

  if (!firstIn && !lastOut && workedMs <= 0) return false;

  const shiftMs = shiftMsForStaff(employees, staffKey);
  finalizeDayDebt(staffKey, staffName, dayKey, periodKey, workedMs, shiftMs, {
    firstInMs: firstIn,
    lastOutMs: lastOut,
  });
  if (shiftMs > 0) syncMonthlyForStaff(periodKey, staffKey, staffName);
  return true;
}

/** attendance_log → daily_stats */
export function rebuildDailyStatsFromLog(employees) {
  const groups = getDb()
    .prepare(
      `SELECT staff_key, day_key, period_key, MAX(staff_name) AS staff_name
       FROM attendance_log
       GROUP BY staff_key, day_key`
    )
    .all();

  let updated = 0;
  for (const g of groups) {
    const events = getDb()
      .prepare(
        `SELECT kind, event_ms, worked_ms, first_in_ms, last_out_ms
         FROM attendance_log
         WHERE staff_key=? AND day_key=?
         ORDER BY event_ms ASC, id ASC`
      )
      .all(g.staff_key, g.day_key);
    if (
      upsertDayFromEvents(
        g.staff_key,
        g.staff_name,
        g.day_key,
        g.period_key,
        events,
        employees
      )
    ) {
      updated += 1;
    }
  }
  return updated;
}

/** staff_state dagi bugungi (va boshqa) kunlarni daily_stats ga */
export function syncStaffStateToDailyStats(employees) {
  const rows = getDb()
    .prepare(
      `SELECT staff_key, staff_name, day_key, day_worked_ms, first_in_ms, last_leave_ms, status
       FROM staff_state
       WHERE day_key != '' AND (day_worked_ms > 0 OR first_in_ms IS NOT NULL)`
    )
    .all();

  let synced = 0;
  for (const row of rows) {
    const pk = periodKey(new Date(`${row.day_key}T12:00:00+05:00`));
    const shiftMs = shiftMsForStaff(employees, row.staff_key);
    const lastOut =
      row.status === "out" && row.last_leave_ms ? row.last_leave_ms : null;
    finalizeDayDebt(
      row.staff_key,
      row.staff_name,
      row.day_key,
      pk,
      row.day_worked_ms || 0,
      shiftMs,
      { firstInMs: row.first_in_ms, lastOutMs: lastOut }
    );
    if (shiftMs > 0) syncMonthlyForStaff(pk, row.staff_key, row.staff_name);
    synced += 1;
  }
  return synced;
}

function staffKeyByCaptionName(name, employees) {
  const n = String(name || "")
    .replace(/<[^>]+>/g, "")
    .trim();
  if (!n) return null;
  for (const [key, s] of Object.entries(employees.staff || {})) {
    if (staffReplyLabel(s) === n) return key;
    const full = `${s.firstName || ""} ${s.lastName || ""}`.trim();
    if (full === n) return key;
  }
  return null;
}

function stripHtml(text) {
  return String(text || "").replace(/<[^>]+>/g, "");
}

function flattenTelegramText(text) {
  if (typeof text === "string") return text;
  if (!Array.isArray(text)) return "";
  return text
    .map((p) => (typeof p === "string" ? p : p?.text || ""))
    .join("");
}

/** Bitta KETDI xabari (forward yoki export) */
export function importKeldiKetdiCaption(caption, dayKey, employees) {
  if (!caption || !/KETDI|ИШДАН КЕТДИ/i.test(caption)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null;

  const plain = stripHtml(flattenTelegramText(caption));
  const nameMatch = plain.match(/👤\s*(.+)/);
  if (!nameMatch) return null;

  const staffKey = staffKeyByCaptionName(nameMatch[1], employees);
  if (!staffKey) return null;

  const keldiM = plain.match(/Kelgan[:\s]+(\d{1,2}:\d{2})/i);
  const ketdiM = plain.match(/Ketgan[:\s]+(\d{1,2}:\d{2})/i);
  if (!keldiM || !ketdiM) return null;

  const staff = employees.staff[staffKey];
  const staffName = staffReplyLabel(staff);
  const firstInMs = msOnDay(dayKey, keldiM[1]);
  const lastOutMs = msOnDay(dayKey, ketdiM[1]);
  let workedMs = Math.max(0, lastOutMs - firstInMs);

  const ishM = plain.match(/Ishlagan[:\s]+(\d+)\s*soat\s*(\d+)\s*daqiqa/i);
  if (ishM) {
    workedMs = (Number(ishM[1]) * 60 + Number(ishM[2])) * 60_000;
  }

  const pk = periodKey(new Date(`${dayKey}T12:00:00+05:00`));
  const metrics = computeDayShiftMetrics(staff, staffKey, {
    firstInMs,
    lastOutMs,
    workedMs,
  });

  getDb()
    .prepare(
      `INSERT INTO attendance_log
       (day_key, period_key, staff_key, staff_name, kind, event_ms, worked_ms, first_in_ms, last_out_ms, logged_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      dayKey,
      pk,
      staffKey,
      staffName,
      "left",
      lastOutMs,
      metrics.workedMs,
      firstInMs,
      lastOutMs,
      Date.now()
    );

  applyDayShiftMetrics(staffKey, staffName, dayKey, {
    ...metrics,
    firstInMs,
    lastOutMs,
  }, employees);

  return {
    staffKey,
    staffName,
    dayKey,
    keldi: keldiM[1],
    ketdi: ketdiM[1],
    workedMs: metrics.workedMs,
  };
}

export function getAttendanceLogSummariesInRange(fromKey, toKey) {
  return getDb()
    .prepare(
      `SELECT staff_key, day_key,
              MAX(first_in_ms) AS first_in_ms,
              MAX(last_out_ms) AS last_out_ms,
              MAX(worked_ms) AS worked_ms
       FROM attendance_log
       WHERE day_key >= ? AND day_key <= ?
       GROUP BY staff_key, day_key`
    )
    .all(fromKey, toKey);
}

/** Telegram Desktop export (result.json) dan kunlik yozuvlar */
export function backfillFromTelegramExport(exportJson, employees) {
  const messages = exportJson?.messages || exportJson?.chats?.list?.[0]?.messages || [];
  let imported = 0;
  let skipped = 0;

  for (const msg of messages) {
    const caption = flattenTelegramText(msg.text);
    if (!caption || !/KETDI|ИШДАН КЕТДИ/i.test(caption)) continue;

    const dateRaw = String(msg.date || "");
    const dayKey = dateRaw.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
      skipped += 1;
      continue;
    }

    if (importKeldiKetdiCaption(caption, dayKey, employees)) imported += 1;
    else skipped += 1;
  }

  return { imported, skipped, messages: messages.length };
}

export function restoreAllAttendanceData(employees) {
  const fromLog = rebuildDailyStatsFromLog(employees);
  const fromState = syncStaffStateToDailyStats(employees);
  return { fromLog, fromState };
}
