import { restoreAllAttendanceData } from "./attendance-log.mjs";
import { auditTimesheetData } from "./timesheet-audit.mjs";
import { buildTimesheetRange } from "./timesheet-data.mjs";
import { buildTimesheetExcel, excelCaption } from "./timesheet-excel.mjs";
import { fmtRangeLabel } from "./period.mjs";

export async function buildTimesheetForRange(employees, fromKey, toKey) {
  try {
    restoreAllAttendanceData(employees);
  } catch (e) {
    console.warn("tabel restore:", e.message);
  }
  const data = buildTimesheetRange(employees, fromKey, toKey);
  const audit = auditTimesheetData(data);
  if (!audit.ok) {
    console.warn("tabel audit:", audit.issues.slice(0, 5).join("; "));
  }
  if (!data.staff.length) {
    return {
      data,
      excel: null,
      caption: null,
      emptyMessage:
        `📋 <b>TABEL</b>\n📅 ${fmtRangeLabel(fromKey, toKey)}\n\n` +
        `Tanlangan oralig'da ma'lumot yo'q.`,
    };
  }
  const excel = await buildTimesheetExcel(data);
  return { data, excel, caption: excelCaption(data) };
}
