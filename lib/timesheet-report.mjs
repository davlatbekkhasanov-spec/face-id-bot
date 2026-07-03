import { buildTimesheetRange, timesheetCaption } from "./timesheet-data.mjs";
import { renderTimesheetSinglePng } from "./timesheet-png.mjs";
import { fmtRangeLabel } from "./period.mjs";

export async function buildTimesheetForRange(employees, fromKey, toKey) {
  const data = buildTimesheetRange(employees, fromKey, toKey);
  if (!data.staff.length) {
    return {
      data,
      png: null,
      caption: null,
      emptyMessage:
        `📋 <b>TABEL</b>\n📅 ${fmtRangeLabel(fromKey, toKey)}\n\n` +
        `Tanlangan oralig'da ma'lumot yo'q.`,
    };
  }
  const png = await renderTimesheetSinglePng(data);
  return { data, png, caption: timesheetCaption(data) };
}
