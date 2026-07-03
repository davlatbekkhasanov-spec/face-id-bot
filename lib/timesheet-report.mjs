import { buildTimesheet, timesheetCaption } from "./timesheet-data.mjs";
import { renderTimesheetPngs } from "./timesheet-png.mjs";

export async function buildTimesheetReports(employees) {
  const data = buildTimesheet(employees);
  if (!data.staff.length) {
    return {
      data,
      images: [],
      emptyMessage: `📋 <b>TABEL</b> · ${data.periodLabel}\n\nBu oy uchun ma'lumot hali yo'q.`,
    };
  }
  const images = await renderTimesheetPngs(data);
  return { data, images, caption: timesheetCaption(data) };
}
