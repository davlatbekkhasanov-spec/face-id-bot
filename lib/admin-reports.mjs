import { dayKey, periodKey, periodLabel, fmtDurationNorm } from "./period.mjs";
import {
  getStaffState,
  getMonthlyDebtors,
  getMonthlyLeaderboard,
  getTodayDailyStats,
} from "./db.mjs";
import { fmtClockMs } from "./attendance-core.mjs";
import { staffReplyLabel } from "./admin-ui.mjs";

const MIN_DEBT_MS = 60_000;

export function buildWhoIsWorkingReport(employees) {
  const dk = dayKey();
  const rows = [];

  for (const [key, s] of Object.entries(employees.staff || {})) {
    const st = getStaffState(key);
    if (st?.status !== "in" || st.day_key !== dk) continue;
    const label = staffReplyLabel(s);
    const since = fmtClockMs(st.session_start_ms || st.first_in_ms);
    rows.push({ label, since });
  }

  rows.sort((a, b) => a.label.localeCompare(b.label, "uz"));

  if (!rows.length) {
    return `👷 <b>Kimlar ishda</b>\n📅 ${dk}\n\nHozir hech kim ishda emas.`;
  }

  let text = `👷 <b>Kimlar ishda</b>\n📅 ${dk}\n\n`;
  rows.forEach((r, i) => {
    text += `${i + 1}. <b>${r.label}</b>`;
    if (r.since) text += ` · ${r.since} dan`;
    text += `\n`;
  });
  text += `\n<b>Jami:</b> ${rows.length} kishi`;
  return text.trim();
}

export function buildMonthlyDebtorsReport() {
  const pk = periodKey();
  const debtors = getMonthlyDebtors(pk);
  const label = periodLabel(pk);

  if (!debtors.length) {
    return `💰 <b>Jami qarzdorlar</b>\n📆 ${label}\n\nQarzdor yo'q — hammasi yaxshi! 🟢`;
  }

  let text = `💰 <b>Jami qarzdorlar</b>\n📆 ${label}\n\n`;
  debtors.forEach((r, i) => {
    text += `${i + 1}. ${r.staff_name} — <b>${fmtDurationNorm(r.debt_ms)}</b>`;
    if (r.work_days) text += ` · ${r.work_days} kun`;
    text += `\n`;
  });
  const total = debtors.reduce((sum, r) => sum + r.debt_ms, 0);
  text += `\n<b>Umumiy qarz:</b> ${fmtDurationNorm(total)}`;
  return text.trim();
}

export function buildTodayStatusReport(employees) {
  const dk = dayKey();
  const seen = new Set();
  const rows = [];

  for (const [key, s] of Object.entries(employees.staff || {})) {
    const st = getStaffState(key);
    if (!st || st.day_key !== dk) continue;
    const worked = st.day_worked_ms || 0;
    if (worked <= 0 && st.status !== "in") continue;
    seen.add(key);
    rows.push({
      label: staffReplyLabel(s),
      worked,
      status: st.status === "in" ? "🟢 ishda" : "⚪ ketgan",
    });
  }

  for (const r of getTodayDailyStats(dk)) {
    if (seen.has(r.staff_key)) continue;
    if ((r.worked_ms || 0) <= 0) continue;
    rows.push({
      label: r.staff_name,
      worked: r.worked_ms,
      status: "⚪ ketgan",
    });
  }

  rows.sort((a, b) => a.label.localeCompare(b.label, "uz"));

  if (!rows.length) {
    return `📅 <b>Bugungi holat</b>\n📅 ${dk}\n\nBugun hali faoliyat yo'q.`;
  }

  let text = `📅 <b>Bugungi holat</b>\n📅 ${dk}\n\n`;
  rows.forEach((r, i) => {
    text += `${i + 1}. ${r.label} — ${r.status}\n   Ishlagan: <b>${fmtDurationNorm(r.worked)}</b>\n`;
  });
  return text.trim();
}

export function buildTodayDebtReport() {
  const dk = dayKey();
  const rows = getTodayDailyStats(dk).filter((r) => (r.debt_ms || 0) > MIN_DEBT_MS);

  if (!rows.length) {
    return `⚠️ <b>Bugungi qarz</b>\n📅 ${dk}\n\nBugun hech kimga qarz yo'q. 🟢`;
  }

  rows.sort((a, b) => b.debt_ms - a.debt_ms);

  let text = `⚠️ <b>Bugungi qarz</b>\n📅 ${dk}\n\n`;
  rows.forEach((r, i) => {
    text += `${i + 1}. ${r.staff_name} — <b>${fmtDurationNorm(r.debt_ms)}</b>`;
    text += ` (ishlagan ${fmtDurationNorm(r.worked_ms)})\n`;
  });
  const total = rows.reduce((sum, r) => sum + r.debt_ms, 0);
  text += `\n<b>Jami:</b> ${fmtDurationNorm(total)}`;
  return text.trim();
}

export function buildMonthlyLeadersReport() {
  const pk = periodKey();
  const leaders = getMonthlyLeaderboard(pk);
  const label = periodLabel(pk);

  if (!leaders.length) {
    return `🏆 <b>Oy reytingi</b>\n📆 ${label}\n\nHozircha ma'lumot yo'q.`;
  }

  let text = `🏆 <b>Oy reytingi</b>\n📆 ${label}\n\n`;
  leaders.slice(0, 15).forEach((r, i) => {
    text += `${i + 1}. ${r.staff_name} — <b>${fmtDurationNorm(r.worked_ms)}</b>`;
    if (r.work_days) text += ` · ${r.work_days} kun`;
    text += `\n`;
  });
  return text.trim();
}

export const REPORT_BUTTONS = {
  "👷 Kimlar ishda": "working",
  "💰 Jami qarzdorlar": "debtors",
  "📅 Bugungi holat": "today",
  "⚠️ Bugungi qarz": "today_debt",
  "🏆 Oy reytingi": "leaders",
};

export function buildAdminReport(kind, employees) {
  switch (kind) {
    case "working":
      return buildWhoIsWorkingReport(employees);
    case "debtors":
      return buildMonthlyDebtorsReport();
    case "today":
      return buildTodayStatusReport(employees);
    case "today_debt":
      return buildTodayDebtReport();
    case "leaders":
      return buildMonthlyLeadersReport();
    default:
      return null;
  }
}
