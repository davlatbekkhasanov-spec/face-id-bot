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

export function nowClock() {
  return new Date().toLocaleTimeString("uz-UZ", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function fmtDayHuman(dk) {
  const [y, m, d] = dk.split("-");
  return `${Number(d)}-${MONTHS_UZ[Number(m)]} ${y}`;
}

function rankLabel(index) {
  if (index === 0) return "1";
  if (index === 1) return "2";
  if (index === 2) return "3";
  return String(index + 1);
}

function staffTotal(employees) {
  return Object.keys(employees.staff || {}).length;
}

/** @typedef {{ label: string, value: string }} Kpi */
/** @typedef {{ rank: string, name: string, value: string, sub?: string, tier?: string }} Row */

/**
 * @returns {{
 *   kind: string, theme: string, title: string, subtitle: string,
 *   dateLabel: string, timeLabel: string, kpis: Kpi[], rows: Row[],
 *   empty?: boolean, emptyMessage?: string
 * }}
 */
export function collectWorkingReport(employees) {
  const dk = dayKey();
  const now = Date.now();
  const rows = [];

  for (const [key, s] of Object.entries(employees.staff || {})) {
    const st = getStaffState(key);
    if (st?.status !== "in" || st.day_key !== dk) continue;
    const startMs = st.session_start_ms || st.first_in_ms;
    rows.push({
      rank: "",
      name: staffReplyLabel(s),
      value: fmtClockMs(startMs) || "—",
      sub: `Sessiya · ${fmtDurationNorm(startMs ? Math.max(0, now - startMs) : 0)}`,
      tier: "live",
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, "uz"));
  rows.forEach((r, i) => {
    r.rank = rankLabel(i);
  });

  const total = staffTotal(employees);
  return {
    kind: "working",
    theme: "teal",
    title: "KIMLAR ISHDA",
    subtitle: "Real vaqt · smena holati",
    dateLabel: fmtDayHuman(dk),
    timeLabel: nowClock(),
    kpis: [
      { label: "Ishda", value: `${rows.length} kishi` },
      { label: "Bo'sh", value: `${Math.max(0, total - rows.length)} kishi` },
      { label: "Jami", value: `${total} xodim` },
    ],
    rows,
    empty: rows.length === 0,
    emptyMessage: "Hozir hech kim ishda emas",
  };
}

export function collectDebtorsReport() {
  const pk = periodKey();
  const debtors = getMonthlyDebtors(pk);
  const rows = debtors.map((r, i) => ({
    rank: rankLabel(i),
    name: r.staff_name,
    value: fmtDurationNorm(r.debt_ms),
    sub: r.work_days ? `${r.work_days} ish kuni` : "Oy bo'yicha",
    tier: i < 3 ? `warn-${i + 1}` : "default",
  }));
  const total = debtors.reduce((sum, r) => sum + r.debt_ms, 0);

  return {
    kind: "debtors",
    theme: "crimson",
    title: "JAMI QARZDORLAR",
    subtitle: periodLabel(pk),
    dateLabel: fmtDayHuman(dayKey()),
    timeLabel: nowClock(),
    kpis: [
      { label: "Qarzdor", value: `${rows.length} kishi` },
      { label: "Umumiy qarz", value: fmtDurationNorm(total) },
      { label: "Eng katta", value: rows[0] ? rows[0].value : "—" },
    ],
    rows,
    empty: rows.length === 0,
    emptyMessage: "Qarzdor yo'q — hammasi yaxshi",
  };
}

export function collectTodayReport(employees) {
  const dk = dayKey();
  const seen = new Set();
  const rows = [];

  for (const [key, s] of Object.entries(employees.staff || {})) {
    const st = getStaffState(key);
    if (!st || st.day_key !== dk) continue;
    const worked = st.day_worked_ms || 0;
    if (worked <= 0 && st.status !== "in") continue;
    seen.add(key);
    const normMs = hasShiftTracking(s) ? shiftMsFor(s) : 0;
    rows.push({
      rank: "",
      name: staffReplyLabel(s),
      value: fmtDurationNorm(worked),
      sub:
        st.status === "in"
          ? normMs > 0
            ? `Ishda · me'yor ${fmtDurationNorm(normMs)}`
            : "Ishda"
          : normMs > 0
            ? `Ketgan · me'yor ${fmtDurationNorm(normMs)}`
            : "Ketgan",
      tier: st.status === "in" ? "live" : "default",
    });
  }

  for (const r of getTodayDailyStats(dk)) {
    if (seen.has(r.staff_key)) continue;
    if ((r.worked_ms || 0) <= 0) continue;
    rows.push({
      rank: "",
      name: r.staff_name,
      value: fmtDurationNorm(r.worked_ms),
      sub: "Ketgan",
      tier: "default",
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, "uz"));
  rows.forEach((r, i) => {
    r.rank = rankLabel(i);
  });

  const inCount = rows.filter((r) => r.tier === "live").length;
  const totalWorked = rows.reduce((sum, r) => {
    const m = r.value.match(/(\d+) soat/);
    return sum + (m ? Number(m[1]) : 0);
  }, 0);

  return {
    kind: "today",
    theme: "blue",
    title: "BUGUNGI HOLAT",
    subtitle: "Kunlik smena natijasi",
    dateLabel: fmtDayHuman(dk),
    timeLabel: nowClock(),
    kpis: [
      { label: "Ishda", value: `${inCount} kishi` },
      { label: "Faol", value: `${rows.length} kishi` },
      { label: "Ro'yxat", value: `${rows.length} ta` },
    ],
    rows,
    empty: rows.length === 0,
    emptyMessage: "Bugun faoliyat yo'q",
  };
}

export function collectTodayDebtReport() {
  const dk = dayKey();
  const items = getTodayDailyStats(dk)
    .filter((r) => (r.debt_ms || 0) > MIN_DEBT_MS)
    .sort((a, b) => b.debt_ms - a.debt_ms);

  const rows = items.map((r, i) => ({
    rank: rankLabel(i),
    name: r.staff_name,
    value: fmtDurationNorm(r.debt_ms),
    sub: `Ishlagan · ${fmtDurationNorm(r.worked_ms)}`,
    tier: i < 3 ? `warn-${i + 1}` : "default",
  }));
  const total = items.reduce((sum, r) => sum + r.debt_ms, 0);

  return {
    kind: "today_debt",
    theme: "amber",
    title: "BUGUNGI QARZ",
    subtitle: "Kunlik me'yor qarzi",
    dateLabel: fmtDayHuman(dk),
    timeLabel: nowClock(),
    kpis: [
      { label: "Qarzdor", value: `${rows.length} kishi` },
      { label: "Jami qarz", value: fmtDurationNorm(total) },
      { label: "Eng katta", value: rows[0] ? rows[0].value : "—" },
    ],
    rows,
    empty: rows.length === 0,
    emptyMessage: "Bugun qarz yo'q",
  };
}

export function collectLeadersReport() {
  const pk = periodKey();
  const leaders = getMonthlyLeaderboard(pk).slice(0, 12);
  const rows = leaders.map((r, i) => ({
    rank: rankLabel(i),
    name: r.staff_name,
    value: fmtDurationNorm(r.worked_ms),
    sub: r.work_days
      ? `${r.work_days} kun · kuniga ${fmtDurationNorm(Math.round(r.worked_ms / r.work_days))}`
      : "Oy bo'yicha",
    tier: i < 3 ? `gold-${i + 1}` : "default",
  }));
  const totalWorked = leaders.reduce((sum, r) => sum + r.worked_ms, 0);

  return {
    kind: "leaders",
    theme: "violet",
    title: "OY REYTINGI",
    subtitle: periodLabel(pk),
    dateLabel: fmtDayHuman(dayKey()),
    timeLabel: nowClock(),
    kpis: [
      { label: "Top", value: `${rows.length} xodim` },
      { label: "Jami vaqt", value: fmtDurationNorm(totalWorked) },
      { label: "Lider", value: rows[0]?.name?.split(" ").slice(-1)[0] || "—" },
    ],
    rows,
    empty: rows.length === 0,
    emptyMessage: "Ma'lumot yo'q",
  };
}

export function collectAdminReportData(kind, employees) {
  switch (kind) {
    case "working":
      return collectWorkingReport(employees);
    case "debtors":
      return collectDebtorsReport();
    case "today":
      return collectTodayReport(employees);
    case "today_debt":
      return collectTodayDebtReport();
    case "leaders":
      return collectLeadersReport();
    default:
      return null;
  }
}
