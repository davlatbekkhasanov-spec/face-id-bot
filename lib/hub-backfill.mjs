import { getDb } from "./db.mjs";
import { staffReplyLabel } from "./admin-ui.mjs";
import { periodKey } from "./period.mjs";
import { computeDayShiftMetrics, applyDayShiftMetrics } from "./timesheet-metrics.mjs";
import { hubConfigured } from "./yordamchi-push.mjs";

const DEFAULT_HUB = "https://davlat-yordamchi-bot-production.up.railway.app";

function msOnDay(dayKey, clockHHMM) {
  const m = String(clockHHMM || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = String(Number(m[1])).padStart(2, "0");
  const mm = m[2];
  return new Date(`${dayKey}T${hh}:${mm}:00+05:00`).getTime();
}

/** @returns {{ keldi: string|null, ketdi: string|null, ishDaq: number|null }} */
export function parseFaceidHubSummary(summary) {
  const sl = String(summary || "").toLowerCase();
  const keldiM = sl.match(/keldi\s*[=:]?\s*([\d:]+)/);
  const ketdiM = sl.match(/ketdi\s*[=:]?\s*([\d:]+)/);
  const ishM = sl.match(/ish_daq\s*[=:]?\s*(\d+)/);
  const keldi = keldiM?.[1] || null;
  const ketdi = ketdiM?.[1] && !["—", "-"].includes(ketdiM[1]) ? ketdiM[1] : null;
  return {
    keldi,
    ketdi,
    ishDaq: ishM ? Number(ishM[1]) : null,
  };
}

function staffKeyByTelegramId(tgId, employees) {
  const id = Number(tgId);
  if (!id) return null;
  for (const [key, s] of Object.entries(employees.staff || {})) {
    if (Number(s.telegramId) === id) return key;
  }
  return null;
}

function hubAuthHeaders(secret) {
  return {
    "X-Hub-Secret": secret,
    Authorization: `Bearer ${secret}`,
  };
}

function importHubDay(employees, staffKey, staff, staffName, dayKey, keldi, ketdi, workedMsHint) {
  const firstInMs = msOnDay(dayKey, keldi);
  const lastOutMs = msOnDay(dayKey, ketdi);
  if (!firstInMs || !lastOutMs) return false;

  let workedMs = Math.max(0, lastOutMs - firstInMs);
  if (workedMsHint != null && workedMsHint > 0) {
    workedMs = workedMsHint;
  }

  const metrics = computeDayShiftMetrics(staff, staffKey, {
    firstInMs,
    lastOutMs,
    workedMs,
  });

  const pk = periodKey(new Date(`${dayKey}T12:00:00+05:00`));
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

  return true;
}

/** Yordamchi hub → attendance_log + daily_stats (haqiqiy keldi/ketdi) */
export async function backfillKeldiKetdiFromHub(employees, fromKey, toKey) {
  if (!hubConfigured()) return { imported: 0, skipped: 0, reason: "hub yo'q" };

  const url = (process.env.YORDAMCHI_HUB_URL || process.env.HUB_URL || DEFAULT_HUB)
    .trim()
    .replace(/\/$/, "");
  const secret = (process.env.YORDAMCHI_HUB_SECRET || process.env.HUB_SECRET || "").trim();

  let data;
  try {
    const res = await fetch(
      `${url}/hub/faceid-events?from=${encodeURIComponent(fromKey)}&to=${encodeURIComponent(toKey)}`,
      { headers: hubAuthHeaders(secret), signal: AbortSignal.timeout(45_000) }
    );
    data = await res.json();
    if (!res.ok || !data.ok) {
      return { imported: 0, skipped: 0, reason: data.message || res.statusText };
    }
  } catch (e) {
    return { imported: 0, skipped: 0, reason: e.message };
  }

  let imported = 0;
  let skipped = 0;
  for (const ev of data.events || []) {
    const staffKey = staffKeyByTelegramId(ev.tg_id, employees);
    if (!staffKey) {
      skipped += 1;
      continue;
    }
    const staff = employees.staff[staffKey];
    const parsed = parseFaceidHubSummary(ev.summary);
    if (!parsed.keldi || !parsed.ketdi) {
      skipped += 1;
      continue;
    }
    const workedHint = parsed.ishDaq != null ? parsed.ishDaq * 60_000 : null;
    if (
      importHubDay(
        employees,
        staffKey,
        staff,
        staffReplyLabel(staff),
        ev.day,
        parsed.keldi,
        parsed.ketdi,
        workedHint
      )
    ) {
      imported += 1;
    } else {
      skipped += 1;
    }
  }

  return { imported, skipped, total: (data.events || []).length };
}
