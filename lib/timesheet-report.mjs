import { buildTimesheetRange } from "./timesheet-data.mjs";
import { buildTimesheetExcel, excelCaption } from "./timesheet-excel.mjs";
import { fmtRangeLabel } from "./period.mjs";

export async function buildTimesheetForRange(employees, fromKey, toKey) {
  const data = buildTimesheetRange(employees, fromKey, toKey);
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
