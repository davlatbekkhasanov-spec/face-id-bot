import { fmtClockMs } from "./attendance-core.mjs";
import { svgFontDefs, REPORT_FONT } from "./report-fonts.mjs";
import { nowClock } from "./admin-report-data.mjs";
import { fmtDurationNorm, fmtHoursShort, dayNumberFromKey } from "./period.mjs";
import { staffDetailRows } from "./timesheet-data.mjs";

const FF = REPORT_FONT;

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function trunc(s, max = 12) {
  const t = String(s || "");
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function dayCellLabel(day) {
  if (!day.workedMs && !day.firstIn) return "";
  if (day.firstIn && day.lastOut) {
    const a = fmtClockMs(day.firstIn);
    const b = fmtClockMs(day.lastOut);
    return `${a}-${b}`;
  }
  if (day.firstIn) return fmtClockMs(day.firstIn);
  return fmtHoursShort(day.workedMs);
}

function buildOverviewSvg(data) {
  const days = data.days || [];
  const staff = data.staff || [];
  const NAME_W = 128;
  const DAY_W = 38;
  const SUM_W = 72;
  const ROW_H = 34;
  const PAD = 24;
  const W = PAD * 2 + NAME_W + days.length * DAY_W + SUM_W * 3;
  const H = PAD * 2 + 72 + ROW_H + staff.length * ROW_H + 40;
  const y0 = PAD + 72;

  let headerDays = "";
  days.forEach((dk, i) => {
    const x = PAD + NAME_W + i * DAY_W + DAY_W / 2;
    headerDays += `<text x="${x}" y="${y0 - 10}" text-anchor="middle" fill="#94a3b8" font-size="11" font-weight="600" font-family="${FF}">${dayNumberFromKey(dk)}</text>`;
  });

  const sumX = PAD + NAME_W + days.length * DAY_W;
  ["Ish", "Kech", "Ortiq"].forEach((lbl, i) => {
    const x = sumX + i * SUM_W + SUM_W / 2;
    headerDays += `<text x="${x}" y="${y0 - 10}" text-anchor="middle" fill="#7cb8ff" font-size="11" font-weight="700" font-family="${FF}">${lbl}</text>`;
  });

  let body = "";
  staff.forEach((st, ri) => {
    const y = y0 + ri * ROW_H;
    const bg = ri % 2 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)";
    body += `<rect x="${PAD}" y="${y}" width="${W - PAD * 2}" height="${ROW_H - 2}" fill="${bg}"/>`;
    body += `<text x="${PAD + 8}" y="${y + 22}" fill="#f1f5f9" font-size="13" font-weight="600" font-family="${FF}">${esc(trunc(st.name, 16))}</text>`;

    days.forEach((dk, ci) => {
      const day = st.days.get(dk);
      const x = PAD + NAME_W + ci * DAY_W;
      const label = day ? dayCellLabel(day) : "";
      const late = day?.lateMs > 0;
      if (late) {
        body += `<rect x="${x + 1}" y="${y + 3}" width="${DAY_W - 2}" height="${ROW_H - 8}" rx="4" fill="rgba(255,82,82,0.22)"/>`;
      }
      if (label) {
        body += `<text x="${x + DAY_W / 2}" y="${y + 21}" text-anchor="middle" fill="${late ? "#ffb4b4" : "#cbd5e1"}" font-size="9" font-family="${FF}">${esc(trunc(label, 11))}</text>`;
      }
    });

    const vals = [
      fmtHoursShort(st.totalWorkedMs),
      st.totalLateMs > 0 ? fmtHoursShort(st.totalLateMs) : "—",
      st.totalOvertimeMs > 0 ? fmtHoursShort(st.totalOvertimeMs) : "—",
    ];
    vals.forEach((v, i) => {
      const x = sumX + i * SUM_W + SUM_W / 2;
      body += `<text x="${x}" y="${y + 22}" text-anchor="middle" fill="#41dfc0" font-size="12" font-weight="700" font-family="${FF}">${esc(v)}</text>`;
    });
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${svgFontDefs()}
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#071422"/><stop offset="100%" stop-color="#123066"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="16" fill="url(#bg)"/>
  <text x="${PAD}" y="${PAD + 28}" fill="#fff" font-size="22" font-weight="700" font-family="${FF}">TABEL — ${esc(data.periodLabel)}</text>
  <text x="${PAD}" y="${PAD + 52}" fill="#94a3b8" font-size="14" font-family="${FF}">Kun · keldi-ketdi · qizil = kechikish · ${esc(nowClock())}</text>
  <rect x="${PAD}" y="${y0 - 4}" width="${W - PAD * 2}" height="1" fill="rgba(255,255,255,0.1)"/>
  ${headerDays}
  ${body}
  <text x="${PAD}" y="${H - 12}" fill="#64748b" font-size="11" font-family="${FF}">KANSTIK Face ID · umumiy ko'rinish</text>
</svg>`;
}

function buildDetailSvg(staffEntry, periodLabel) {
  const rows = staffDetailRows(staffEntry);
  const cols = ["Kun", "Keldi", "Ketdi", "Ish", "Kech", "Ortiqcha", "∑ Kech", "∑ Ortiqcha"];
  const widths = [44, 64, 64, 56, 56, 64, 64, 80];
  const PAD = 28;
  const ROW_H = 36;
  const HDR = 88;
  const W = PAD * 2 + widths.reduce((a, b) => a + b, 0);
  const H = PAD * 2 + HDR + Math.max(rows.length, 1) * ROW_H + 48;

  let x = PAD;
  const colX = widths.map((w) => {
    const cx = x;
    x += w;
    return cx;
  });

  let header = "";
  cols.forEach((c, i) => {
    header += `<text x="${colX[i] + widths[i] / 2}" y="${PAD + HDR - 14}" text-anchor="middle" fill="#7cb8ff" font-size="12" font-weight="700" font-family="${FF}">${esc(c)}</text>`;
  });

  let body = "";
  if (!rows.length) {
    body += `<text x="${W / 2}" y="${PAD + HDR + 40}" text-anchor="middle" fill="#94a3b8" font-size="16" font-family="${FF}">Ma'lumot yo'q</text>`;
  } else {
    rows.forEach((r, ri) => {
      const y = PAD + HDR + ri * ROW_H;
      const bg = ri % 2 ? "rgba(255,255,255,0.03)" : "transparent";
      body += `<rect x="${PAD}" y="${y}" width="${W - PAD * 2}" height="${ROW_H - 2}" fill="${bg}"/>`;
      const vals = [r.dayNum, r.keldi, r.ketdi, r.worked, r.late, r.overtime, r.cumLate, r.cumOvertime];
      vals.forEach((v, i) => {
        const color = i === 4 && r.lateFlag ? "#ff8a80" : "#e2e8f0";
        body += `<text x="${colX[i] + widths[i] / 2}" y="${y + 24}" text-anchor="middle" fill="${color}" font-size="12" font-family="${FF}">${esc(String(v))}</text>`;
      });
    });
  }

  const footY = PAD + HDR + rows.length * ROW_H + 20;
  const summary =
    `Jami ish: ${fmtHoursShort(staffEntry.totalWorkedMs)} · ` +
    `Kech: ${fmtHoursShort(staffEntry.totalLateMs)} · ` +
    `Ortiqcha: ${fmtHoursShort(staffEntry.totalOvertimeMs)}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${svgFontDefs()}
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f1419"/><stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="16" fill="url(#bg)"/>
  <text x="${PAD}" y="${PAD + 30}" fill="#fff" font-size="20" font-weight="700" font-family="${FF}">${esc(staffEntry.name)}</text>
  <text x="${PAD}" y="${PAD + 54}" fill="#94a3b8" font-size="13" font-family="${FF}">${esc(periodLabel)} · kunlik tafsilot</text>
  <line x1="${PAD}" y1="${PAD + HDR - 6}" x2="${W - PAD}" y2="${PAD + HDR - 6}" stroke="rgba(255,255,255,0.12)"/>
  ${header}
  ${body}
  <text x="${PAD}" y="${footY}" fill="#41dfc0" font-size="13" font-weight="600" font-family="${FF}">${esc(summary)}</text>
</svg>`;
}

async function svgToPng(svg) {
  const sharp = (await import("sharp")).default;
  return sharp(Buffer.from(svg)).png({ quality: 92 }).toBuffer();
}

/** @returns {Promise<Array<{ png: Buffer, caption: string, kind: string }>>} */
export async function renderTimesheetPngs(data) {
  const out = [];
  if (!data.staff.length) return out;

  const overviewSvg = buildOverviewSvg(data);
  out.push({
    kind: "overview",
    png: await svgToPng(overviewSvg),
    caption: `📋 <b>Tabel</b> · ${data.periodLabel}\nUmumiy ko'rinish · ${data.staff.length} xodim`,
  });

  for (const st of data.staff) {
    const rows = staffDetailRows(st);
    if (!rows.length) continue;
    out.push({
      kind: "detail",
      png: await svgToPng(buildDetailSvg(st, data.periodLabel)),
      caption:
        `📋 <b>${st.name}</b>\n` +
        `Ish: ${fmtDurationNorm(st.totalWorkedMs)} · ` +
        `Kech: ${fmtHoursShort(st.totalLateMs)} · ` +
        `Ortiqcha: ${fmtHoursShort(st.totalOvertimeMs)}`,
    });
  }
  return out;
}
