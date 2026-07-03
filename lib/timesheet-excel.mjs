import ExcelJS from "exceljs";
import { fmtClockMs } from "./attendance-core.mjs";
import { dayKey, dayNumberFromKey } from "./period.mjs";

const HDR_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
const HDR_FONT = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
const SHORT_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4D6" } };
const OT_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
const OFF_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } };
const BORDER_THIN = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

const NORM_H = 12;
const OT_H = 12.5;

/** Jami vaqt: 60:30 (soat:daqiqa) */
export function fmtHoursClock(ms) {
  if (!ms || ms <= 0) return "0:00";
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function fmtBalance(ms) {
  const n = Number(ms) || 0;
  if (n === 0) return "0:00";
  const sign = n > 0 ? "+" : "-";
  return `${sign}${fmtHoursClock(Math.abs(n))}`;
}

function hasAttendance(day) {
  return Boolean(day?.workedMs > 0 || day?.firstIn);
}

/** Smenasiz — bo'sh; smenali + Face ID yo'q — В */
export function dayAbsentMark(day, dk, staff) {
  if (hasAttendance(day)) return null;
  if (dk >= dayKey()) return null;
  if (staff?.noShift) return null;
  return "В";
}

function dayWorkedH(day) {
  return (day?.workedMs || 0) / 3_600_000;
}

function dayCellStyle(day) {
  const h = dayWorkedH(day);
  if (h <= 0) return {};
  if (h >= OT_H) return { ot: true };
  if (h < NORM_H) return { short: true };
  return {};
}

function isWeekend(dk) {
  const w = new Date(`${dk}T12:00:00+05:00`).getDay();
  return w === 0 || w === 6;
}

/** Yuqori: keldi · Past: ketdi (faqat HH:MM) */
function dayCellContent(day, dk, staff) {
  const absent = dayAbsentMark(day, dk, staff);
  if (absent) return absent;
  if (!hasAttendance(day)) return "";

  const lines = [];
  if (day?.firstIn) lines.push(fmtClockMs(day.firstIn));
  if (day?.lastOut) lines.push(fmtClockMs(day.lastOut));
  return lines.join("\n");
}

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.fill = HDR_FILL;
    cell.font = HDR_FONT;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = BORDER_THIN;
  });
  row.height = 22;
}

function styleDataCell(cell, { short = false, ot = false, off = false, center = true } = {}) {
  cell.border = BORDER_THIN;
  cell.alignment = { horizontal: center ? "center" : "left", vertical: "middle", wrapText: true };
  if (ot) cell.fill = OT_FILL;
  else if (short) cell.fill = SHORT_FILL;
  else if (off) cell.fill = OFF_FILL;
}

function buildMainSheet(wb, data) {
  const ws = wb.addWorksheet("T-13 Tabel", {
    views: [{ state: "frozen", ySplit: 5, xSplit: 2 }],
  });
  const days = data.days;
  const sumCols = 5;
  const lastCol = 2 + days.length + sumCols;

  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = "TABEL hisobi (forma T-13)";
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.getCell(1, 1).alignment = { horizontal: "center" };

  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell(2, 1).value = `KANSTIK · Face ID · ${data.rangeLabel}`;
  ws.getCell(2, 1).alignment = { horizontal: "center" };

  ws.mergeCells(3, 1, 3, lastCol);
  ws.getCell(3, 1).value =
    "Kunlar: yuqori keldi · past ketdi · Balans = plus − minus · <12s qizil · >12.5s yashil";
  ws.getCell(3, 1).font = { size: 9, color: { argb: "FF444444" } };
  ws.getCell(3, 1).alignment = { horizontal: "center", wrapText: true };

  const h1 = ws.getRow(5);
  h1.getCell(1).value = "№";
  h1.getCell(2).value = "F.I.O.";
  days.forEach((dk, i) => {
    const cell = h1.getCell(3 + i);
    cell.value = dayNumberFromKey(dk);
    if (isWeekend(dk)) cell.fill = OFF_FILL;
  });
  const sumStart = 3 + days.length;
  h1.getCell(sumStart).value = "Ish kun";
  h1.getCell(sumStart + 1).value = "Ish";
  h1.getCell(sumStart + 2).value = "Minus";
  h1.getCell(sumStart + 3).value = "Plus";
  h1.getCell(sumStart + 4).value = "Balans";
  styleHeaderRow(h1);

  const h2 = ws.getRow(6);
  h2.getCell(sumStart + 1).value = "soat:daq";
  h2.getCell(sumStart + 2).value = "soat:daq";
  h2.getCell(sumStart + 3).value = "soat:daq";
  h2.getCell(sumStart + 4).value = "+ / −";
  [sumStart + 1, sumStart + 2, sumStart + 3, sumStart + 4].forEach((c) => {
    const cell = h2.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E2F3" } };
    cell.font = { size: 8, italic: true };
    cell.alignment = { horizontal: "center" };
    cell.border = BORDER_THIN;
  });

  let rowNum = 7;
  data.staff.forEach((st, idx) => {
    const row = ws.getRow(rowNum);
    row.height = 30;
    row.getCell(1).value = idx + 1;
    row.getCell(2).value = st.name;
    let workDays = 0;
    days.forEach((dk, i) => {
      const day = st.days.get(dk);
      const absent = dayAbsentMark(day, dk, st);
      const cell = row.getCell(3 + i);
      cell.value = dayCellContent(day, dk, st);
      if (hasAttendance(day)) workDays += 1;
      const style = absent ? { off: true } : dayCellStyle(day);
      styleDataCell(cell, style);
    });
    row.getCell(sumStart).value = workDays;
    row.getCell(sumStart + 1).value = fmtHoursClock(st.totalWorkedMs);
    row.getCell(sumStart + 2).value = fmtHoursClock(st.totalLateMs);
    row.getCell(sumStart + 3).value = fmtHoursClock(st.totalOvertimeMs);
    const balanceMs = st.totalOvertimeMs - st.totalLateMs;
    row.getCell(sumStart + 4).value = fmtBalance(balanceMs);
    const balCell = row.getCell(sumStart + 4);
    [1, 2, sumStart, sumStart + 1, sumStart + 2, sumStart + 3, sumStart + 4].forEach((c) =>
      styleDataCell(row.getCell(c), { center: c !== 2 })
    );
    if (balanceMs > 0) styleDataCell(balCell, { ot: true });
    else if (balanceMs < 0) styleDataCell(balCell, { short: true });
    row.getCell(2).font = { bold: true };
    rowNum += 1;
  });

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 26;
  for (let c = 3; c < sumStart; c++) ws.getColumn(c).width = 8;
  ws.getColumn(sumStart).width = 7;
  ws.getColumn(sumStart + 1).width = 9;
  ws.getColumn(sumStart + 2).width = 9;
  ws.getColumn(sumStart + 3).width = 9;
  ws.getColumn(sumStart + 4).width = 9;

  const foot = rowNum + 2;
  ws.mergeCells(foot, 1, foot, Math.floor(lastCol / 2));
  ws.getCell(foot, 1).value = "Rahbar: __________________ /____________/";
  ws.mergeCells(foot, Math.floor(lastCol / 2) + 1, foot, lastCol);
  ws.getCell(foot, Math.floor(lastCol / 2) + 1).value =
    "Kadrlar bo'limi: __________________ /____________/";
}

function buildDetailSheet(wb, data) {
  const ws = wb.addWorksheet("Tafsilot", {
    views: [{ state: "frozen", ySplit: 1, xSplit: 1 }],
  });
  const headers = [
    "Xodim",
    "Kun",
    "Keldi",
    "Ketdi",
    "Ish",
    "Minus",
    "Plus",
    "Balans",
  ];
  const hr = ws.getRow(1);
  headers.forEach((h, i) => {
    hr.getCell(i + 1).value = h;
  });
  styleHeaderRow(hr);

  let r = 2;
  for (const st of data.staff) {
    for (const dk of data.days) {
      const day = st.days.get(dk);
      const absent = dayAbsentMark(day, dk, st);
      if (!hasAttendance(day) && !absent) continue;
      const line = ws.getRow(r);
      line.getCell(1).value = st.name;
      line.getCell(2).value = dayNumberFromKey(dk);
      let bal = 0;
      if (absent) {
        line.getCell(3).value = "В";
      } else {
        line.getCell(3).value = day?.firstIn ? fmtClockMs(day.firstIn) : "";
        line.getCell(4).value = day?.lastOut ? fmtClockMs(day.lastOut) : "";
        line.getCell(5).value = fmtHoursClock(day?.workedMs);
        line.getCell(6).value = fmtHoursClock(day?.lateMs);
        line.getCell(7).value = fmtHoursClock(day?.overtimeMs);
        const bal = (day?.overtimeMs || 0) - (day?.lateMs || 0);
        line.getCell(8).value = fmtBalance(bal);
      }
      const style = absent ? { off: true } : dayCellStyle(day);
      for (let c = 1; c <= 8; c++) {
        const extra =
          c === 8 && !absent
            ? bal > 0
              ? { ot: true }
              : bal < 0
                ? { short: true }
                : {}
            : {};
        styleDataCell(line.getCell(c), { center: c > 1, ...style, ...extra });
      }
      r += 1;
    }
  }
  ws.getColumn(1).width = 24;
  ws.getColumn(2).width = 6;
  ws.getColumn(3).width = 8;
  ws.getColumn(4).width = 8;
  for (let c = 5; c <= 8; c++) ws.getColumn(c).width = 10;
}

/** @returns {Promise<{ buffer: Buffer, filename: string }>} */
export async function buildTimesheetExcel(data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "KANSTIK Face ID";
  wb.created = new Date();
  buildMainSheet(wb, data);
  buildDetailSheet(wb, data);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const safe = data.rangeLabel.replace(/[^\w\d-]+/g, "_").slice(0, 40);
  const filename = `Tabel_${safe}.xlsx`;
  return { buffer, filename };
}

export function excelCaption(data) {
  return (
    `📋 <b>TABEL (Excel)</b>\n` +
    `📅 ${data.rangeLabel}\n` +
    `👥 ${data.staff.length} xodim · keldi/ketdi · jami soat:daq`
  );
}
