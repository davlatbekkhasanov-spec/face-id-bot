import { dayKey, periodKey, periodLabel, fmtDurationNorm, TZ } from "./period.mjs";
import {
  getStaffState,
  getMonthlyDebtors,
  getMonthlyLeaderboard,
  getTodayDailyStats,
} from "./db.mjs";
import { fmtClockMs } from "./attendance-core.mjs";
import { staffReplyLabel } from "./admin-ui.mjs";
import { hasShiftTracking, shiftMsFor } from "./shifts.mjs";
import { formatPingTable, pingHeader, pingRow, pingRule } from "./ping-table.mjs";

const MIN_DEBT_MS = 60_000;

const MONTHS_UZ = [
  "",
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];

function b(text) {
  return `<b>${text}</b>`;
}

function i(text) {
  return `<i>${text}</i>`;
}

function nowClock() {
  return new Date().toLocaleTimeString("uz-UZ", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtDayHuman(dk) {
  const [y, m, d] = dk.split("-");
  return `${Number(d)}-${MONTHS_UZ[Number(m)]} ${y}`;
}

function rankLabel(index) {
  if (index === 0) return "🥇";
  if (index === 1) return "🥈";
  if (index === 2) return "🥉";
  return `${index + 1}.`;
}

function fitName(name, max = 18) {
  const s = String(name || "").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function pingCard(icon, title, meta, rows) {
  return `${icon} ${b(title)}\n${meta}\n\n${formatPingTable(rows)}`;
}

function staffTotal(employees) {
  return Object.keys(employees.staff || {}).length;
}

function personRows(items, valueFn, subFn) {
  const rows = [];
  items.forEach((item, idx) => {
    rows.push(pingRow(`${rankLabel(idx)} ${fitName(item.name)}`, valueFn(item)));
    if (subFn) {
      for (const [label, value] of subFn(item)) {
        rows.push(pingRow(`   ${label}`, value));
      }
    }
  });
  return rows;
}

export function buildWhoIsWorkingReport(employees) {
  const dk = dayKey();
  const now = Date.now();
  const meta = `📅 ${fmtDayHuman(dk)} · 🕐 ${b(nowClock())}`;
  const items = [];

  for (const [key, s] of Object.entries(employees.staff || {})) {
    const st = getStaffState(key);
    if (st?.status !== "in" || st.day_key !== dk) continue;
    const startMs = st.session_start_ms || st.first_in_ms;
    items.push({
      name: staffReplyLabel(s),
      since: fmtClockMs(startMs) || "—",
      session: fmtDurationNorm(startMs ? Math.max(0, now - startMs) : 0),
    });
  }

  items.sort((a, b) => a.name.localeCompare(b.name, "uz"));
  const total = staffTotal(employees);

  if (!items.length) {
    const rows = [
      ...pingHeader(),
      pingRow("Natija", "Hech kim ishda emas"),
      pingRow("Jami xodim", String(total)),
    ];
    return pingCard("👷", "KIMLAR ISHDA", meta, rows);
  }

  const rows = [
    ...pingHeader(),
    pingRow("Ishda", `${items.length} kishi`),
    pingRow("Bo'sh", `${Math.max(0, total - items.length)} kishi`),
    pingRule(),
    ...personRows(
      items,
      (item) => item.since,
      (item) => [["Sessiya", item.session]]
    ),
  ];
  return pingCard("👷", "KIMLAR ISHDA", meta, rows);
}

export function buildMonthlyDebtorsReport() {
  const pk = periodKey();
  const debtors = getMonthlyDebtors(pk);
  const meta = `📆 ${periodLabel(pk)} · 🕐 ${b(nowClock())}`;

  if (!debtors.length) {
    const rows = [...pingHeader(), pingRow("Natija", "Qarzdor yo'q 🟢")];
    return pingCard("💰", "JAMI QARZDORLAR", meta, rows);
  }

  const total = debtors.reduce((sum, r) => sum + r.debt_ms, 0);
  const rows = [
    ...pingHeader(),
    pingRow("Qarzdorlar", `${debtors.length} kishi`),
    pingRow("Umumiy qarz", fmtDurationNorm(total)),
    pingRule(),
    ...personRows(
      debtors.map((r) => ({ name: r.staff_name, debt: r.debt_ms, days: r.work_days })),
      (item) => fmtDurationNorm(item.debt),
      (item) => (item.days ? [["Ish kunlari", String(item.days)]] : [])
    ),
  ];
  return pingCard("💰", "JAMI QARZDORLAR", meta, rows);
}

export function buildTodayStatusReport(employees) {
  const dk = dayKey();
  const seen = new Set();
  const active = [];
  const done = [];

  for (const [key, s] of Object.entries(employees.staff || {})) {
    const st = getStaffState(key);
    if (!st || st.day_key !== dk) continue;
    const worked = st.day_worked_ms || 0;
    if (worked <= 0 && st.status !== "in") continue;
    seen.add(key);
    const item = {
      name: staffReplyLabel(s),
      worked,
      normMs: hasShiftTracking(s) ? shiftMsFor(s) : 0,
      inOffice: st.status === "in",
    };
    if (item.inOffice) active.push(item);
    else done.push(item);
  }

  for (const r of getTodayDailyStats(dk)) {
    if (seen.has(r.staff_key)) continue;
    if ((r.worked_ms || 0) <= 0) continue;
    done.push({ name: r.staff_name, worked: r.worked_ms, normMs: 0, inOffice: false });
  }

  active.sort((a, b) => a.name.localeCompare(b.name, "uz"));
  done.sort((a, b) => a.name.localeCompare(b.name, "uz"));

  const meta = `📅 ${fmtDayHuman(dk)} · 🕐 ${b(nowClock())}`;
  const all = [...active, ...done];

  if (!all.length) {
    const rows = [...pingHeader(), pingRow("Natija", "Faoliyat yo'q")];
    return pingCard("📅", "BUGUNGI HOLAT", meta, rows);
  }

  const totalWorked = all.reduce((sum, r) => sum + r.worked, 0);
  const rows = [
    ...pingHeader(),
    pingRow("Ishda", `${active.length} kishi`),
    pingRow("Ketgan", `${done.length} kishi`),
    pingRow("Jami vaqt", fmtDurationNorm(totalWorked)),
  ];

  const appendGroup = (title, list) => {
    if (!list.length) return;
    rows.push(pingRule());
    rows.push(pingRow(title, `${list.length} kishi`));
    list.forEach((item, idx) => {
      rows.push(pingRow(`${rankLabel(idx)} ${fitName(item.name)}`, fmtDurationNorm(item.worked)));
      if (item.normMs > 0) {
        rows.push(pingRow("   Me'yor", fmtDurationNorm(item.normMs)));
      }
      rows.push(pingRow("   Holat", item.inOffice ? "Ishda" : "Ketgan"));
    });
  };

  appendGroup("ISHDA", active);
  appendGroup("KETGAN", done);

  return pingCard("📅", "BUGUNGI HOLAT", meta, rows);
}

export function buildTodayDebtReport() {
  const dk = dayKey();
  const items = getTodayDailyStats(dk)
    .filter((r) => (r.debt_ms || 0) > MIN_DEBT_MS)
    .sort((a, b) => b.debt_ms - a.debt_ms);
  const meta = `📅 ${fmtDayHuman(dk)} · 🕐 ${b(nowClock())}`;

  if (!items.length) {
    const rows = [...pingHeader(), pingRow("Natija", "Qarz yo'q 🟢")];
    return pingCard("⚠️", "BUGUNGI QARZ", meta, rows);
  }

  const total = items.reduce((sum, r) => sum + r.debt_ms, 0);
  const rows = [
    ...pingHeader(),
    pingRow("Qarzdorlar", `${items.length} kishi`),
    pingRow("Jami qarz", fmtDurationNorm(total)),
    pingRule(),
    ...personRows(
      items.map((r) => ({
        name: r.staff_name,
        debt: r.debt_ms,
        worked: r.worked_ms,
      })),
      (item) => fmtDurationNorm(item.debt),
      (item) => [["Ishlagan", fmtDurationNorm(item.worked)]]
    ),
  ];
  return pingCard("⚠️", "BUGUNGI QARZ", meta, rows);
}

export function buildMonthlyLeadersReport() {
  const pk = periodKey();
  const leaders = getMonthlyLeaderboard(pk).slice(0, 15);
  const meta = `📆 ${periodLabel(pk)} · 🕐 ${b(nowClock())}`;

  if (!leaders.length) {
    const rows = [...pingHeader(), pingRow("Natija", "Ma'lumot yo'q")];
    return pingCard("🏆", "OY REYTINGI", meta, rows);
  }

  const totalWorked = leaders.reduce((sum, r) => sum + r.worked_ms, 0);
  const rows = [
    ...pingHeader(),
    pingRow("Top xodim", `${leaders.length} kishi`),
    pingRow("Jami vaqt", fmtDurationNorm(totalWorked)),
    pingRow("Lider", fitName(leaders[0].staff_name, 22)),
    pingRule(),
    ...personRows(
      leaders.map((r) => ({
        name: r.staff_name,
        worked: r.worked_ms,
        days: r.work_days,
      })),
      (item) => fmtDurationNorm(item.worked),
      (item) => {
        const sub = [];
        if (item.days) sub.push(["Ish kunlari", String(item.days)]);
        if (item.days > 0) {
          sub.push(["Kuniga", fmtDurationNorm(Math.round(item.worked / item.days))]);
        }
        return sub;
      }
    ),
  ];
  return pingCard("🏆", "OY REYTINGI", meta, rows);
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

export function reportsMenuIntro() {
  return (
    `📊 ${b("HISOBOTLAR")}\n` +
    `📅 ${fmtDayHuman(dayKey())} · 🕐 ${b(nowClock())}\n\n` +
    `${i("Ping kartochka uslubida — pastdan tanlang.")}`
  );
}
