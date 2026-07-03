import DigestFetch from "digest-fetch";
import { staffKey, displayName, isFaceEvent } from "./attendance-core.mjs";
import { finalizeDayDebt, getDb, syncMonthlyForStaff } from "./db.mjs";
import { logAttendanceCard } from "./attendance-log.mjs";
import { dayKey, dayKeysInRange, periodKey } from "./period.mjs";
import { shiftMsFor, hasShiftTracking } from "./shifts.mjs";

const TZ_OFFSET = process.env.FACE_TIMEZONE || "+05:00";

function shiftMsForStaff(employees, staffKey) {
  const staff = employees.staff?.[staffKey];
  if (!staff || staff.noShift) return 0;
  return shiftMsFor(staff);
}

function normalizeAcsItem(item) {
  return {
    name: item.name || item.employeeName || "",
    employeeNoString: item.employeeNoString || item.employeeNo || "",
    time: item.time || item.dateTime || item.timeLocal || "",
    minor: Number(item.minor ?? item.subEventType ?? 0),
    serialNo: Number(item.serialNo || 0),
  };
}

/** Hikvision terminal — kun bo'yicha barcha Face ID hodisalari */
export async function fetchAcsEventsForDay(client, ip, dayKey, { maxPages = 20 } = {}) {
  const start = `${dayKey}T00:00:00${TZ_OFFSET}`;
  const end = `${dayKey}T23:59:59${TZ_OFFSET}`;
  const all = [];
  let pos = 0;
  const pageSize = 500;

  for (let page = 0; page < maxPages; page += 1) {
    const res = await client.fetch(`http://${ip}/ISAPI/AccessControl/AcsEvent?format=json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        AcsEventCond: {
          searchID: String(Date.now()),
          searchResultPosition: pos,
          maxResults: pageSize,
          major: 0,
          minor: 0,
          startTime: start,
          endTime: end,
          timeReverseOrder: false,
        },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`AcsEvent HTTP ${res.status}: ${err.slice(0, 200)}`);
    }
    const j = JSON.parse(await res.text());
    const list = j?.AcsEvent?.InfoList;
    const batch = list ? (Array.isArray(list) ? list : [list]) : [];
    if (!batch.length) break;
    for (const item of batch) {
      const ev = normalizeAcsItem(item);
      if (isFaceEvent(ev)) all.push(ev);
    }
    if (batch.length < pageSize) break;
    pos += pageSize;
  }

  all.sort((a, b) => new Date(a.time) - new Date(b.time));
  return all;
}

function msFromEvent(ev) {
  const d = new Date(ev.time);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** Bir kun + bir hodim — keldi/ketdi va ishlagan vaqt */
export function summarizeStaffDay(events, staffKey, employees) {
  const sorted = [...events].sort((a, b) => msFromEvent(a) - msFromEvent(b));
  let status = "out";
  let firstInMs = null;
  let lastOutMs = null;
  let workedMs = 0;
  let sessionStart = null;
  let lastMs = 0;
  const cooldown = Math.max(10_000, Number(process.env.SCAN_COOLDOWN_SEC || 25) * 1000);

  for (const ev of sorted) {
    const ms = msFromEvent(ev);
    if (!ms) continue;
    if (lastMs && ms - lastMs < cooldown) continue;
    lastMs = ms;

    if (status === "out") {
      status = "in";
      sessionStart = ms;
      if (!firstInMs) firstInMs = ms;
    } else {
      workedMs += Math.max(0, ms - (sessionStart || ms));
      lastOutMs = ms;
      status = "out";
      sessionStart = null;
    }
  }

  if (!firstInMs && !lastOutMs && workedMs <= 0) return null;

  const staff = employees.staff?.[staffKey];
  const who = displayName(staffKey, sorted[0] || {}, employees);
  const dk = dayKey(msFromEvent(sorted[0]) || Date.now());
  const pk = periodKey(msFromEvent(sorted[0]) || Date.now());

  return { staffKey, staffName: who, dayKey: dk, periodKey: pk, firstInMs, lastOutMs, workedMs, staff };
}

function groupEventsByStaff(events, employees) {
  const map = new Map();
  for (const ev of events) {
    const key = staffKey(ev, employees);
    if (!employees.staff?.[key]) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(ev);
  }
  return map;
}

export function applyDaySummary(summary, employees, { dryRun = false } = {}) {
  if (!summary) return false;
  const shiftMs = shiftMsForStaff(employees, summary.staffKey);
  if (dryRun) return true;
  finalizeDayDebt(
    summary.staffKey,
    summary.staffName,
    summary.dayKey,
    summary.periodKey,
    summary.workedMs,
    shiftMs,
    { firstInMs: summary.firstInMs, lastOutMs: summary.lastOutMs }
  );
  if (shiftMs > 0) syncMonthlyForStaff(summary.periodKey, summary.staffKey, summary.staffName);
  logAttendanceCard({
    staffKey: summary.staffKey,
    staffName: summary.staffName,
    dayKey: summary.dayKey,
    periodKey: summary.periodKey,
    kind: "left",
    clock: summary.lastOutMs ? new Date(summary.lastOutMs).toISOString() : "",
    dayWorkedMs: summary.workedMs,
    firstInMs: summary.firstInMs,
    lastOutMs: summary.lastOutMs,
    noShift: !hasShiftTracking(summary.staff),
    telegramId: summary.staff?.telegramId,
  });
  return true;
}

/** JSON (botga yuborish) — device-backfill format */
export function importDeviceBackfillJson(payload, employees) {
  const rows = payload?.days || payload?.rows || [];
  let imported = 0;
  for (const row of rows) {
    const staff = employees.staff?.[row.staff_key || row.staffKey];
    if (!staff) continue;
    const ok = applyDaySummary(
      {
        staffKey: row.staff_key || row.staffKey,
        staffName: row.staff_name || row.staffName,
        dayKey: row.day_key || row.dayKey,
        periodKey: row.period_key || row.periodKey || periodKey(new Date(`${row.day_key}T12:00:00+05:00`)),
        firstInMs: row.first_in_ms ?? row.firstInMs,
        lastOutMs: row.last_out_ms ?? row.lastOutMs,
        workedMs: row.worked_ms ?? row.workedMs ?? 0,
        staff,
      },
      employees
    );
    if (ok) imported += 1;
  }
  return { imported, total: rows.length };
}

/** Terminaldan kunlar oralig'ini o'qib daily_stats ga yozish */
export async function backfillFromDevice({
  ip,
  user,
  pass,
  fromKey,
  toKey,
  employees,
  staffFilter = null,
  dryRun = false,
}) {
  const client = new DigestFetch(user, pass);
  const infoRes = await client.fetch(`http://${ip}/ISAPI/System/deviceInfo`);
  if (!infoRes.ok) {
    throw new Error(`Terminal ulanmadi: HTTP ${infoRes.status} (${ip})`);
  }

  const days = dayKeysInRange(fromKey, toKey);
  const results = [];
  let daysOk = 0;

  for (const dk of days) {
    let events;
    try {
      events = await fetchAcsEventsForDay(client, ip, dk);
    } catch (e) {
      console.warn(`${dk}:`, e.message);
      continue;
    }
    const byStaff = groupEventsByStaff(events, employees);
    let dayCount = 0;
    for (const [key, evs] of byStaff) {
      if (staffFilter && key !== staffFilter) continue;
      const summary = summarizeStaffDay(evs, key, employees);
      if (!summary) continue;
      summary.dayKey = dk;
      summary.periodKey = periodKey(new Date(`${dk}T12:00:00+05:00`));
      if (applyDaySummary(summary, employees, { dryRun })) {
        dayCount += 1;
        results.push({
          staff_key: summary.staffKey,
          staff_name: summary.staffName,
          day_key: summary.dayKey,
          period_key: summary.periodKey,
          first_in_ms: summary.firstInMs,
          last_out_ms: summary.lastOutMs,
          worked_ms: summary.workedMs,
        });
      }
    }
    if (dayCount) daysOk += 1;
    console.log(`${dk}: ${events.length} hodisa → ${dayCount} yozuv`);
  }

  return { days: days.length, daysOk, rows: results, imported: results.length };
}

export function exportDeviceBackfillPayload(result) {
  return JSON.stringify({ source: "face-id-terminal", days: result.rows }, null, 2);
}
