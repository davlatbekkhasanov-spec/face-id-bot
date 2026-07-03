import { svgFontDefs, REPORT_FONT } from "./report-fonts.mjs";
import { nowClock } from "./admin-report-data.mjs";
import { fmtHoursShort } from "./period.mjs";
import { staffDetailRows } from "./timesheet-data.mjs";

const FF = REPORT_FONT;
const W = 920;
const PAD = 24;
const ROW_H = 26;
const COLS = ["Kun", "Keldi", "Ketdi", "Ish", "Kech", "Ortiqcha", "∑ Kech", "∑ Ortiqcha"];
const WIDTHS = [40, 58, 58, 52, 52, 62, 62, 72];

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function trunc(s, max = 28) {
  const t = String(s || "");
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function colXs() {
  let x = PAD;
  return WIDTHS.map((w) => {
    const cx = x;
    x += w;
    return cx;
  });
}

function buildCombinedSvg(data) {
  const colX = colXs();
  const tableW = WIDTHS.reduce((a, b) => a + b, 0);
  let y = PAD + 56;
  let body = "";

  const drawTableHeader = (yy) => {
    let h = "";
    COLS.forEach((c, i) => {
      h += `<text x="${colX[i] + WIDTHS[i] / 2}" y="${yy}" text-anchor="middle" fill="#7cb8ff" font-size="11" font-weight="700" font-family="${FF}">${esc(c)}</text>`;
    });
    return h + `<line x1="${PAD}" y1="${yy + 6}" x2="${PAD + tableW}" y2="${yy + 6}" stroke="rgba(255,255,255,0.15)"/>`;
  };

  for (const st of data.staff || []) {
    const rows = staffDetailRows(st);
    if (!rows.length) continue;

    body += `<text x="${PAD}" y="${y + 18}" fill="#41dfc0" font-size="16" font-weight="700" font-family="${FF}">${esc(st.name)}</text>`;
    body += `<text x="${W - PAD}" y="${y + 18}" text-anchor="end" fill="#94a3b8" font-size="11" font-family="${FF}">` +
      `ish ${esc(fmtHoursShort(st.totalWorkedMs))} · kech ${esc(fmtHoursShort(st.totalLateMs))} · +${esc(fmtHoursShort(st.totalOvertimeMs))}</text>`;
    y += 28;
    body += drawTableHeader(y);
    y += 16;

    rows.forEach((r, ri) => {
      const yy = y + ri * ROW_H;
      if (ri % 2 === 0) {
        body += `<rect x="${PAD}" y="${yy - 14}" width="${tableW}" height="${ROW_H - 2}" fill="rgba(255,255,255,0.03)"/>`;
      }
      const vals = [r.dayNum, r.keldi, r.ketdi, r.worked, r.late, r.overtime, r.cumLate, r.cumOvertime];
      vals.forEach((v, i) => {
        const color = i === 4 && r.lateFlag ? "#ff8a80" : "#e2e8f0";
        body += `<text x="${colX[i] + WIDTHS[i] / 2}" y="${yy}" text-anchor="middle" fill="${color}" font-size="11" font-family="${FF}">${esc(String(v))}</text>`;
      });
    });
    y += rows.length * ROW_H + 20;
  }

  const H = Math.max(y + 40, 200);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${svgFontDefs()}
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#071422"/><stop offset="100%" stop-color="#123066"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="16" fill="url(#bg)"/>
  <text x="${PAD}" y="${PAD + 24}" fill="#fff" font-size="22" font-weight="700" font-family="${FF}">TABEL — ${esc(data.rangeLabel)}</text>
  <text x="${PAD}" y="${PAD + 46}" fill="#94a3b8" font-size="13" font-family="${FF}">${data.staff.length} xodim · ${esc(nowClock())}</text>
  ${body}
  <text x="${PAD}" y="${H - 14}" fill="#64748b" font-size="11" font-family="${FF}">KANSTIK Face ID · barcha xodimlar</text>
</svg>`;
}

/** Bitta PNG — barcha xodimlar */
export async function renderTimesheetSinglePng(data) {
  if (!data.staff?.length) return null;
  const sharp = (await import("sharp")).default;
  const svg = buildCombinedSvg(data);
  return sharp(Buffer.from(svg)).png({ quality: 92 }).toBuffer();
}
