import ExcelJS from "exceljs";
import { fmtClockMs } from "./attendance-core.mjs";
import { dayNumberFromKey } from "./period.mjs";
import { staffDetailRows } from "./timesheet-data.mjs";

const HDR_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
const HDR_FONT = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
const SUB_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E2F3" } };
const LATE_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4D6" } };
const BORDER_THIN = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

function hoursNum(ms) {
  if (!ms || ms <= 0) return null;
  return Math.round((ms / 3_600_000) * 10) / 10;
}

function minsNum(ms) {
  if (!ms || ms <= 0) return null;
  return Math.round(ms / 60_000);
}

function dayCode(day) {
  if (!day?.workedMs && !day?.firstIn) return "";
  if (day.lateMs > 0) return "ОП";
  return "Я";
}

function isWeekend(dk) {
  const w = new Date(`${dk}T12:00:00+05:00`).getDay();
  return w === 0 || w === 6;
}

function hourCellValue(day) {
  if (day?.firstIn && day?.lastOut) {
    return `${fmtClockMs(day.firstIn)}-${fmtClockMs(day.lastOut)}`;
  }
  const h = hoursNum(day?.workedMs);
  return h ?? "";
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

function styleDataCell(cell, { late = false, center = true } = {}) {
  cell.border = BORDER_THIN;
  cell.alignment = { horizontal: center ? "center" : "left", vertical: "middle", wrapText: true };
  if (late) cell.fill = LATE_FILL;
}

function buildMainSheet(wb, data) {
  const ws = wb.addWorksheet("T-13 Tabel", {
    views: [{ state: "frozen", ySplit: 6, xSplit: 2 }],
  });
  const days = data.days;
  const sumCols = 4;
  const lastCol = 2 + days.length + sumCols;

  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = "TABEL hisobi (forma T-13)";
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.getCell(1, 1).alignment = { horizontal: "center" };

  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell(2, 1).value = `KANSTIK · Face ID · ${data.rangeLabel}`;
  ws.getCell(2, 1).alignment = { horizontal: "center" };

  ws.mergeCells(3, 1, 3, lastCol);
  ws.getCell(3, 1).value = "Yagona forma T-13 · barcha xodimlar bitta faylda";
  ws.getCell(3, 1).font = { size: 9, color: { argb: "FF666666" } };
  ws.getCell(3, 1).alignment = { horizontal: "center" };

  ws.getCell(5, 1).value = "Kodlar: Я — ish kuni · ОП — kechikish · V — dam";
  ws.getCell(4, 1).font = { italic: true, size: 9 };

  const h1 = ws.getRow(6);
  h1.getCell(1).value = "№";
  h1.getCell(2).value = "F.I.O.";
  const WEEKEND_HDR = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } };
  days.forEach((dk, i) => {
    const cell = h1.getCell(3 + i);
    cell.value = dayNumberFromKey(dk);
    if (isWeekend(dk)) cell.fill = WEEKEND_HDR;
  });
  const sumStart = 3 + days.length;
  h1.getCell(sumStart).value = "Kun";
  h1.getCell(sumStart + 1).value = "Soat";
  h1.getCell(sumStart + 2).value = "Kech (daq)";
  h1.getCell(sumStart + 3).value = "Ortiqcha (soat)";
  styleHeaderRow(h1);

  const h2 = ws.getRow(7);
  h2.getCell(1).value = "";
  h2.getCell(2).value = "kod / soat";
  days.forEach((dk, i) => {
    h2.getCell(3 + i).value = "↓";
  });
  h2.eachCell((cell, col) => {
    if (col <= 2) return;
    cell.fill = SUB_FILL;
    cell.font = { bold: true, size: 8 };
    cell.alignment = { horizontal: "center" };
    cell.border = BORDER_THIN;
  });

  let rowNum = 8;
  data.staff.forEach((st, idx) => {
    const codeRow = ws.getRow(rowNum);
    codeRow.getCell(1).value = idx + 1;
    codeRow.getCell(2).value = st.name;
    let workDays = 0;
    days.forEach((dk, i) => {
      const day = st.days.get(dk);
      const code = dayCode(day);
      const cell = codeRow.getCell(3 + i);
      cell.value = code;
      styleDataCell(cell, { late: day?.lateMs > 0 });
      if (code) workDays += 1;
    });
    codeRow.getCell(sumStart).value = workDays;
    codeRow.getCell(sumStart + 1).value = hoursNum(st.totalWorkedMs);
    codeRow.getCell(sumStart + 2).value = minsNum(st.totalLateMs);
    codeRow.getCell(sumStart + 3).value = hoursNum(st.totalOvertimeMs);
    [1, 2, sumStart, sumStart + 1, sumStart + 2, sumStart + 3].forEach((c) =>
      styleDataCell(codeRow.getCell(c), { center: c !== 2 })
    );
    codeRow.getCell(2).font = { bold: true };

    const hourRow = ws.getRow(rowNum + 1);
    hourRow.getCell(2).value = "keldi-ketdi";
    days.forEach((dk, i) => {
      const day = st.days.get(dk);
      const cell = hourRow.getCell(3 + i);
      const val = hourCellValue(day);
      cell.value = val;
      if (typeof val === "number") cell.numFmt = "0.0";
      styleDataCell(cell, { center: true, late: false });
      if (isWeekend(dk) && !val) cell.fill = WEEKEND_HDR;
    });
    hourRow.getCell(2).font = { italic: true, size: 9 };
    styleDataCell(hourRow.getCell(2), { center: false });

    ws.mergeCells(rowNum, 1, rowNum + 1, 1);
    ws.mergeCells(rowNum, 2, rowNum + 1, 2);
    ws.mergeCells(rowNum, sumStart, rowNum + 1, sumStart);
    ws.mergeCells(rowNum, sumStart + 1, rowNum + 1, sumStart + 1);
    ws.mergeCells(rowNum, sumStart + 2, rowNum + 1, sumStart + 2);
    ws.mergeCells(rowNum, sumStart + 3, rowNum + 1, sumStart + 3);

    rowNum += 2;
  });

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 26;
  for (let c = 3; c < sumStart; c++) ws.getColumn(c).width = 9;
  ws.getColumn(sumStart).width = 6;
  ws.getColumn(sumStart + 1).width = 7;
  ws.getColumn(sumStart + 2).width = 10;
  ws.getColumn(sumStart + 3).width = 12;

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
    "Ish (soat)",
    "Kech (daq)",
    "Ortiqcha (soat)",
    "Jami kech (daq)",
    "Jami ortiqcha (soat)",
  ];
  const hr = ws.getRow(1);
  headers.forEach((h, i) => {
    hr.getCell(i + 1).value = h;
  });
  styleHeaderRow(hr);

  let r = 2;
  for (const st of data.staff) {
    for (const row of staffDetailRows(st)) {
      const day = st.days.get(row.dayKey);
      const line = ws.getRow(r);
      line.getCell(1).value = st.name;
      line.getCell(2).value = row.dayNum;
      line.getCell(3).value = day?.firstIn ? fmtClockMs(day.firstIn) : "";
      line.getCell(4).value = day?.lastOut ? fmtClockMs(day.lastOut) : "";
      line.getCell(5).value = hoursNum(day?.workedMs);
      line.getCell(6).value = minsNum(day?.lateMs);
      line.getCell(7).value = hoursNum(day?.overtimeMs);
      line.getCell(8).value = minsNum(day?.cumLateMs);
      line.getCell(9).value = hoursNum(day?.cumOvertimeMs);
      for (let c = 1; c <= 9; c++) {
        styleDataCell(line.getCell(c), { center: c > 1, late: row.lateFlag && c === 6 });
      }
      r += 1;
    }
  }
  ws.getColumn(1).width = 24;
  ws.getColumn(2).width = 6;
  ws.getColumn(3).width = 8;
  ws.getColumn(4).width = 8;
  for (let c = 5; c <= 9; c++) ws.getColumn(c).width = 14;
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
    `👥 ${data.staff.length} xodim · 2 varaq (T-13 + tafsilot)`
  );
}
