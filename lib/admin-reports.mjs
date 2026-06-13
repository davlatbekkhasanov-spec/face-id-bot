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

const MIN_DEBT_MS = 60_000;
const DIV = "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬";

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

function rankBadge(index) {
  if (index === 0) return "🥇";
  if (index === 1) return "🥈";
  if (index === 2) return "🥉";
  return `${String(index + 1).padStart(2, " ")}.`;
}

function truncate(text, max) {
  const s = String(text || "");
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function progressBar(ratio, width = 8) {
  const p = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(p * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

function pct(ratio) {
  return `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
}

function boxTable(lines) {
  const width = Math.max(...lines.map((line) => line.length), 4);
  const top = `┏${"━".repeat(width + 2)}┓`;
  const mid = lines.map((line) => `┃ ${line.padEnd(width)} ┃`);
  const bottom = `┗${"━".repeat(width + 2)}┛`;
  return `<pre>${[top, ...mid, bottom].join("\n")}</pre>`;
}

function tableTwoCol(titleLeft, titleRight, rows) {
  const lw = Math.max(titleLeft.length, ...rows.map((r) => String(r[0]).length), 6);
  const rw = Math.max(titleRight.length, ...rows.map((r) => String(r[1]).length), 8);
  const rule = `${"─".repeat(lw)}─┼─${"─".repeat(rw)}`;
  const lines = [
    `${titleLeft.padEnd(lw)} │ ${titleRight}`,
    rule,
    ...rows.map(([left, right]) => `${String(left).padEnd(lw)} │ ${right}`),
  ];
  return boxTable(lines);
}

function reportShell({ icon, title, subtitle, kpiLines, body, footer }) {
  let text = `${icon} ${b(title)}\n${DIV}\n`;
  if (subtitle) text += `${subtitle}\n\n`;
  if (kpiLines?.length) {
    text += `${kpiLines.map((line) => `▸ ${line}`).join("\n")}\n\n`;
  }
  if (body) text += `${body}\n`;
  if (footer) text += `\n${i(footer)}`;
  return text.trim();
}

function emptyReport({ icon, title, subtitle, message, footer }) {
  return reportShell({
    icon,
    title,
    subtitle,
    body: `🟢 ${b(message)}`,
    footer,
  });
}

function reportFooter(extra = "") {
  const base = `Yangilangan: ${nowClock()} · Face ID hisobot`;
  return extra ? `${base} · ${extra}` : base;
}

function staffTotal(employees) {
  return Object.keys(employees.staff || {}).length;
}

export function buildWhoIsWorkingReport(employees) {
  const dk = dayKey();
  const rows = [];
  const now = Date.now();

  for (const [key, s] of Object.entries(employees.staff || {})) {
    const st = getStaffState(key);
    if (st?.status !== "in" || st.day_key !== dk) continue;
    const label = staffReplyLabel(s);
    const startMs = st.session_start_ms || st.first_in_ms;
    const since = fmtClockMs(startMs);
    const sessionMs = startMs ? Math.max(0, now - startMs) : 0;
    rows.push({
      label,
      since: since || "—",
      session: fmtDurationNorm(sessionMs),
    });
  }

  rows.sort((a, b) => a.label.localeCompare(b.label, "uz"));
  const total = staffTotal(employees);
  const subtitle = `📅 ${fmtDayHuman(dk)} · 🕐 ${nowClock()}`;

  if (!rows.length) {
    return emptyReport({
      icon: "👷",
      title: "KIMLAR ISHDA",
      subtitle,
      message: "Hozir hech kim ishda emas",
      footer: reportFooter(`${total} ta hodim ro'yxatda`),
    });
  }

  const tableRows = rows.map((r, idx) => [
    `${rankBadge(idx)} ${truncate(r.label, 16)}`,
    `${r.since} · ${r.session}`,
  ]);

  return reportShell({
    icon: "👷",
    title: "KIMLAR ISHDA",
    subtitle,
    kpiLines: [
      `${b("Ishda")}: ${rows.length} kishi`,
      `${b("Bo'sh")}: ${Math.max(0, total - rows.length)} kishi`,
      `${b("Jami xodim")}: ${total}`,
    ],
    body: tableTwoCol("Hodim", "Kelgan · sessiya", tableRows),
    footer: reportFooter("Real vaqt holati"),
  });
}

export function buildMonthlyDebtorsReport() {
  const pk = periodKey();
  const debtors = getMonthlyDebtors(pk);
  const label = periodLabel(pk);
  const subtitle = `📆 ${label} · hisobot davri`;

  if (!debtors.length) {
    return emptyReport({
      icon: "💰",
      title: "JAMI QARZDORLAR",
      subtitle,
      message: "Qarzdor yo'q — jamoa me'yorni bajarayapti",
      footer: reportFooter("Oy bo'yicha yig'indi"),
    });
  }

  const total = debtors.reduce((sum, r) => sum + r.debt_ms, 0);
  const maxDebt = debtors[0]?.debt_ms || 1;
  const tableRows = debtors.map((r, idx) => {
    const bar = progressBar(r.debt_ms / maxDebt, 6);
    const days = r.work_days ? `${r.work_days} kun` : "—";
    return [
      `${rankBadge(idx)} ${truncate(r.staff_name, 14)}`,
      `${fmtDurationNorm(r.debt_ms)} · ${days} ${bar}`,
    ];
  });

  return reportShell({
    icon: "💰",
    title: "JAMI QARZDORLAR",
    subtitle,
    kpiLines: [
      `${b("Qarzdorlar")}: ${debtors.length} kishi`,
      `${b("Umumiy qarz")}: ${fmtDurationNorm(total)}`,
      `${b("Eng katta")}: ${fmtDurationNorm(debtors[0].debt_ms)}`,
    ],
    body: tableTwoCol("Hodim", "Qarz · kunlar", tableRows),
    footer: reportFooter("3-sanadan yangi oy hisobi"),
  });
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
    const normMs = hasShiftTracking(s) ? shiftMsFor(s) : 0;
    const row = {
      label: staffReplyLabel(s),
      worked,
      normMs,
      inOffice: st.status === "in",
    };
    if (row.inOffice) active.push(row);
    else done.push(row);
  }

  for (const r of getTodayDailyStats(dk)) {
    if (seen.has(r.staff_key)) continue;
    if ((r.worked_ms || 0) <= 0) continue;
    done.push({
      label: r.staff_name,
      worked: r.worked_ms,
      normMs: 0,
      inOffice: false,
    });
  }

  active.sort((a, b) => a.label.localeCompare(b.label, "uz"));
  done.sort((a, b) => a.label.localeCompare(b.label, "uz"));

  const subtitle = `📅 ${fmtDayHuman(dk)} · 🕐 ${nowClock()}`;
  const all = [...active, ...done];

  if (!all.length) {
    return emptyReport({
      icon: "📅",
      title: "BUGUNGI HOLAT",
      subtitle,
      message: "Bugun hali faoliyat qayd etilmagan",
      footer: reportFooter(),
    });
  }

  const totalWorked = all.reduce((sum, r) => sum + r.worked, 0);
  const formatRow = (r) => {
    const worked = fmtDurationNorm(r.worked);
    if (r.normMs > 0) {
      const bar = progressBar(r.worked / r.normMs, 8);
      return [truncate(r.label, 16), `${worked} ${bar} ${pct(r.worked / r.normMs)}`];
    }
    return [truncate(r.label, 16), worked];
  };

  let body = "";
  if (active.length) {
    body += `${b("🟢 ISHDA")} (${active.length})\n`;
    body += tableTwoCol("Hodim", "Ishlangan · me'yor", active.map(formatRow));
    body += "\n\n";
  }
  if (done.length) {
    body += `${b("⚪ KETGAN")} (${done.length})\n`;
    body += tableTwoCol("Hodim", "Ishlangan · me'yor", done.map(formatRow));
  }

  return reportShell({
    icon: "📅",
    title: "BUGUNGI HOLAT",
    subtitle,
    kpiLines: [
      `${b("Ishda")}: ${active.length}`,
      `${b("Ketgan")}: ${done.length}`,
      `${b("Jami vaqt")}: ${fmtDurationNorm(totalWorked)}`,
    ],
    body: body.trim(),
    footer: reportFooter("Kunlik smena ko'rsatkichlari"),
  });
}

export function buildTodayDebtReport() {
  const dk = dayKey();
  const rows = getTodayDailyStats(dk).filter((r) => (r.debt_ms || 0) > MIN_DEBT_MS);
  const subtitle = `📅 ${fmtDayHuman(dk)} · kunlik qarz`;

  if (!rows.length) {
    return emptyReport({
      icon: "⚠️",
      title: "BUGUNGI QARZ",
      subtitle,
      message: "Bugun hech kimga qarz yo'q",
      footer: reportFooter("Ketishda hisoblangan"),
    });
  }

  rows.sort((a, b) => b.debt_ms - a.debt_ms);
  const total = rows.reduce((sum, r) => sum + r.debt_ms, 0);
  const maxDebt = rows[0]?.debt_ms || 1;

  const tableRows = rows.map((r, idx) => {
    const bar = progressBar(r.debt_ms / maxDebt, 6);
    const worked = fmtDurationNorm(r.worked_ms);
    const debt = fmtDurationNorm(r.debt_ms);
    return [
      `${rankBadge(idx)} ${truncate(r.staff_name, 14)}`,
      `${debt} · ish ${worked} ${bar}`,
    ];
  });

  return reportShell({
    icon: "⚠️",
    title: "BUGUNGI QARZ",
    subtitle,
    kpiLines: [
      `${b("Qarzdor")}: ${rows.length} kishi`,
      `${b("Jami qarz")}: ${fmtDurationNorm(total)}`,
      `${b("Eng katta")}: ${fmtDurationNorm(rows[0].debt_ms)}`,
    ],
    body: tableTwoCol("Hodim", "Qarz · ishlagan", tableRows),
    footer: reportFooter("Me'yor bajarilmagan kun"),
  });
}

export function buildMonthlyLeadersReport() {
  const pk = periodKey();
  const leaders = getMonthlyLeaderboard(pk);
  const label = periodLabel(pk);
  const subtitle = `📆 ${label} · eng faol xodimlar`;

  if (!leaders.length) {
    return emptyReport({
      icon: "🏆",
      title: "OY REYTINGI",
      subtitle,
      message: "Hozircha ma'lumot yo'q",
      footer: reportFooter(),
    });
  }

  const top = leaders.slice(0, 15);
  const maxWorked = top[0]?.worked_ms || 1;
  const totalWorked = top.reduce((sum, r) => sum + r.worked_ms, 0);

  const tableRows = top.map((r, idx) => {
    const bar = progressBar(r.worked_ms / maxWorked, 6);
    const days = r.work_days || 0;
    const avg = days > 0 ? fmtDurationNorm(Math.round(r.worked_ms / days)) : "—";
    return [
      `${rankBadge(idx)} ${truncate(r.staff_name, 14)}`,
      `${fmtDurationNorm(r.worked_ms)} · ${days}k ${bar} · ${avg}/kun`,
    ];
  });

  return reportShell({
    icon: "🏆",
    title: "OY REYTINGI",
    subtitle,
    kpiLines: [
      `${b("Top")}: ${top.length} xodim`,
      `${b("Jami vaqt")}: ${fmtDurationNorm(totalWorked)}`,
      `${b("Lider")}: ${leaders[0].staff_name}`,
    ],
    body: tableTwoCol("Hodim", "Ishlangan · statistika", tableRows),
    footer: reportFooter("Ishlangan vaqt bo'yicha"),
  });
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
    `📊 ${b("HISOBOTLAR MARKAZI")}\n` +
    `${DIV}\n` +
    `Professional kunlik va oylik tahlil.\n\n` +
    `▸ ${b("Kimlar ishda")} — real vaqt holati\n` +
    `▸ ${b("Jami qarzdorlar")} — oy bo'yicha qarz\n` +
    `▸ ${b("Bugungi holat")} — smena progressi\n` +
    `▸ ${b("Bugungi qarz")} — kunlik qarzdorlik\n` +
    `▸ ${b("Oy reytingi")} — eng faol xodimlar\n\n` +
    `${i("Kerakli hisobotni pastdan tanlang.")}`
  );
}
