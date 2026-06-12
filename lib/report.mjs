import { fmtDuration, periodLabel } from "./period.mjs";
import { getMonthlyLeaderboard, getMonthlyDebtors } from "./db.mjs";

export function buildMonthlyReport(periodKey, titleSuffix = "") {
  const leaders = getMonthlyLeaderboard(periodKey);
  const debtors = getMonthlyDebtors(periodKey);
  const label = periodLabel(periodKey);

  let text = `📊 <b>OY JADVALI — ${label}</b>${titleSuffix ? `\n<i>${titleSuffix}</i>` : ""}\n`;

  if (!leaders.length && !debtors.length) {
    return text + "\nHozircha ma'lumot yo'q.";
  }

  if (leaders.length) {
    text += `\n🏆 <b>Ko'p ishlaganlar</b>\n`;
    leaders.slice(0, 15).forEach((r, i) => {
      text += `${i + 1}. ${r.staff_name} — <b>${fmtDuration(r.worked_ms)}</b> (${r.work_days} kun)\n`;
    });
  }

  if (debtors.length) {
    text += `\n⚠️ <b>Qarzdorlar</b>\n`;
    debtors.slice(0, 15).forEach((r, i) => {
      text += `${i + 1}. ${r.staff_name} — <b>${fmtDuration(r.debt_ms)}</b>\n`;
    });
  }

  text += `\n<i>Hisob: 3-sanadan yangi oy. Yopilish: har oy 2-sanasi.</i>`;
  return text.trim();
}
