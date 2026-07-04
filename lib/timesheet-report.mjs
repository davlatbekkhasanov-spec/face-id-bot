import { backfillKeldiKetdiFromHub } from "./hub-backfill.mjs";
import { prepareTimesheetForBalance } from "./timesheet-balance.mjs";
import { auditTimesheetData, auditCaption } from "./timesheet-audit.mjs";
import { buildTimesheetRange } from "./timesheet-data.mjs";
import { buildTimesheetExcel, excelCaption } from "./timesheet-excel.mjs";
import { fmtRangeLabel } from "./period.mjs";

export async function buildTimesheetForRange(employees, fromKey, toKey) {
  let hubBackfill = { imported: 0, skipped: 0 };
  try {
    hubBackfill = await backfillKeldiKetdiFromHub(employees, fromKey, toKey);
    if (hubBackfill.imported > 0) {
      console.log(`tabel hub backfill: ${hubBackfill.imported} kun`);
    } else if (hubBackfill.reason) {
      console.warn("tabel hub backfill:", hubBackfill.reason);
    }
    prepareTimesheetForBalance(employees, fromKey, toKey);
  } catch (e) {
    console.warn("tabel restore:", e.message);
  }
  const data = buildTimesheetRange(employees, fromKey, toKey);
  const audit = auditTimesheetData(data);
  if (!audit.ok) {
    console.warn("tabel audit:", audit.issues.slice(0, 8).join("; "));
  }
  if (!data.staff.length) {
    return {
      data,
      audit,
      hubBackfill,
      excel: null,
      caption: null,
      emptyMessage:
        `📋 <b>TABEL</b>\n📅 ${fmtRangeLabel(fromKey, toKey)}\n\n` +
        `Tanlangan oralig'da ma'lumot yo'q.`,
    };
  }
  const excel = await buildTimesheetExcel(data);
  let caption = `${excelCaption(data)}\n\n${auditCaption(audit)}`;
  if (hubBackfill.imported > 0) {
    caption += `\n\n🔄 Hub dan tiklandi: <b>${hubBackfill.imported}</b> kun`;
  }
  return { data, audit, hubBackfill, excel, caption };
}
