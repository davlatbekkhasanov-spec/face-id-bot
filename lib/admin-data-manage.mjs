import { listDataDays, deleteDayData } from "./db.mjs";
import { dayKey, fmtDurationNorm } from "./period.mjs";
import { fmtDayHuman, nowClock } from "./admin-report-data.mjs";
import { renderAdminReportPng, reportPhotoCaption } from "./admin-report-png.mjs";

export function dayPickLabel(day) {
  const human = fmtDayHuman(day.day_key);
  return `📅 ${human} · ${day.cnt} ta`;
}

export function buildDaysListText() {
  const days = listDataDays(30);
  if (!days.length) {
    return "📆 <b>Ma'lumot kunlari</b>\n\nHozircha saqlangan kun yo'q.";
  }
  let text = `📆 <b>Ma'lumot kunlari</b>\n<i>Oxirgi ${days.length} kun</i>\n\n`;
  days.forEach((d, i) => {
    text += `${i + 1}. <b>${fmtDayHuman(d.day_key)}</b> — ${d.cnt} hodim`;
    if (d.worked_ms > 0) text += ` · ${fmtDurationNorm(d.worked_ms)}`;
    text += `\n`;
  });
  return text.trim();
}

export async function buildDaysListPhoto() {
  const days = listDataDays(12);
  const data = {
    kind: "days",
    theme: "slate",
    title: "MA'LUMOT KUNLARI",
    subtitle: "Bazada saqlangan kunlar",
    dateLabel: fmtDayHuman(dayKey()),
    timeLabel: nowClock(),
    kpis: [
      { label: "Jami kun", value: `${listDataDays(100).length} ta` },
      { label: "Ko'rsatilmoqda", value: `${days.length} ta` },
      { label: "Oxirgi", value: days[0] ? fmtDayHuman(days[0].day_key).split(" ")[0] : "—" },
    ],
    rows: days.map((d, i) => ({
      rank: String(i + 1),
      name: fmtDayHuman(d.day_key),
      value: `${d.cnt} hodim`,
      sub: d.worked_ms > 0 ? fmtDurationNorm(d.worked_ms) : "—",
      tier: i < 3 ? `gold-${i + 1}` : "default",
    })),
    empty: days.length === 0,
    emptyMessage: "Saqlangan kun yo'q",
  };
  const png = await renderAdminReportPng(data);
  return { png, caption: reportPhotoCaption(data), data };
}

export function buildDeleteDayKeyboard(days) {
  const rows = [];
  for (let i = 0; i < days.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, days.length); j++) {
      row.push({ text: dayPickLabel(days[j]) });
    }
    rows.push(row);
  }
  rows.push([{ text: "◀️ Hisobotlar" }]);
  return { keyboard: rows, resize_keyboard: true };
}

export function deleteConfirmKeyboard() {
  return {
    keyboard: [[{ text: "✅ Ha, o'chirish" }], [{ text: "❌ Bekor" }]],
    resize_keyboard: true,
  };
}

export function performDayDelete(dayKey, employees) {
  return deleteDayData(dayKey, employees);
}

export { listDataDays };
