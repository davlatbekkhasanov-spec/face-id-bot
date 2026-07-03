import { collectAdminReportData } from "./admin-report-data.mjs";
import { renderAdminReportPng, reportPhotoCaption } from "./admin-report-png.mjs";

export const REPORT_BUTTONS = {
  "👷 Kimlar ishda": "working",
  "💰 Jami qarzdorlar": "debtors",
  "📅 Bugungi holat": "today",
  "⚠️ Bugungi qarz": "today_debt",
  "🏆 Oy reytingi": "leaders",
  "📋 Tabel": "timesheet",
};

export async function buildAdminReportPhoto(kind, employees) {
  const data = collectAdminReportData(kind, employees);
  if (!data) return null;
  const png = await renderAdminReportPng(data);
  const caption = reportPhotoCaption(data);
  return { png, caption, data };
}

export function reportsMenuIntro() {
  return (
    "📊 <b>HISOBOTLAR</b>\n\n" +
    "PNG kartochkalar va ma'lumot boshqaruvi.\n" +
    "Pastdan tanlang."
  );
}

/** Matn fallback (PNG xato bo'lsa) */
export function buildAdminReportText(kind, employees) {
  const data = collectAdminReportData(kind, employees);
  if (!data) return null;
  if (data.empty) return `${data.title}\n\n${data.emptyMessage}`;
  let text = `<b>${data.title}</b>\n${data.subtitle}\n\n`;
  for (const k of data.kpis) text += `${k.label}: <b>${k.value}</b>\n`;
  text += "\n";
  for (const r of data.rows.slice(0, 12)) {
    text += `${r.rank}. ${r.name} — <b>${r.value}</b>`;
    if (r.sub) text += ` (${r.sub})`;
    text += "\n";
  }
  return text.trim();
}
