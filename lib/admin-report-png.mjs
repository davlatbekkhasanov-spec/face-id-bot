import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { svgFontDefs, REPORT_FONT } from "./report-fonts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const W = 920;
const PAD = 44;
const ROW_H = 88;
const MAX_ROWS = 10;

const THEMES = {
  teal: {
    g1: "#071422",
    g2: "#0c3554",
    accent: "#41dfc0",
    accent2: "#00a8bc",
    chip: "rgba(65,223,192,0.12)",
    badge: "ISHDA",
  },
  crimson: {
    g1: "#1a0810",
    g2: "#4a1020",
    accent: "#ff8a80",
    accent2: "#ff5252",
    chip: "rgba(255,82,82,0.14)",
    badge: "QARZ",
  },
  blue: {
    g1: "#08101f",
    g2: "#123066",
    accent: "#7cb8ff",
    accent2: "#3b82f6",
    chip: "rgba(59,130,246,0.14)",
    badge: "KUN",
  },
  amber: {
    g1: "#1a1206",
    g2: "#4a3010",
    accent: "#ffd166",
    accent2: "#ff9f43",
    chip: "rgba(255,159,67,0.14)",
    badge: "BUGUN",
  },
  violet: {
    g1: "#12081f",
    g2: "#301454",
    accent: "#d8b4fe",
    accent2: "#a855f7",
    chip: "rgba(168,85,247,0.14)",
    badge: "TOP",
  },
};

const FF = REPORT_FONT;

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s, max = 26) {
  const t = String(s || "");
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function logoDataUri() {
  try {
    const svg = fs.readFileSync(
      path.join(__dirname, "..", "assets", "report", "kanstik-logo.svg")
    );
    return `data:image/svg+xml;base64,${svg.toString("base64")}`;
  } catch {
    return "";
  }
}

function tierColor(tier, theme) {
  if (tier === "live") return theme.accent;
  if (tier === "gold-1") return "#ffd700";
  if (tier === "gold-2") return "#c0c0c0";
  if (tier === "gold-3") return "#cd7f32";
  if (tier === "warn-1") return "#ff6b6b";
  if (tier === "warn-2") return "#ff9f43";
  if (tier === "warn-3") return "#ffd166";
  return theme.accent2;
}

function buildSvg(data) {
  const theme = THEMES[data.theme] || THEMES.teal;
  const logo = logoDataUri();
  const rows = (data.rows || []).slice(0, MAX_ROWS);
  const extra = (data.rows?.length || 0) - rows.length;
  const headerH = 156;
  const kpiH = 108;
  const footerH = 64;
  const bodyH = data.empty ? 120 : Math.max(rows.length, 1) * ROW_H + 24;
  const H = headerH + kpiH + bodyH + footerH + 36;

  let body = "";
  if (data.empty) {
    body += `<rect x="${PAD}" y="${headerH + kpiH + 8}" width="${W - PAD * 2}" height="96" rx="18" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)"/>`;
    body += `<text x="${W / 2}" y="${headerH + kpiH + 62}" text-anchor="middle" fill="${theme.accent}" font-size="28" font-weight="700" font-family="${FF}">${esc(data.emptyMessage)}</text>`;
  } else {
    rows.forEach((row, i) => {
      const y = headerH + kpiH + 8 + i * ROW_H;
      const rankColor = tierColor(row.tier, theme);
      body += `<rect x="${PAD}" y="${y}" width="${W - PAD * 2}" height="${ROW_H - 10}" rx="16" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.06)"/>`;
      body += `<circle cx="${PAD + 34}" cy="${y + 36}" r="22" fill="${rankColor}" opacity="0.18"/>`;
      body += `<text x="${PAD + 34}" y="${y + 43}" text-anchor="middle" fill="${rankColor}" font-size="20" font-weight="700" font-family="${FF}">${esc(row.rank)}</text>`;
      body += `<text x="${PAD + 72}" y="${y + 32}" fill="#f8fafc" font-size="24" font-weight="700" font-family="${FF}">${esc(truncate(row.name))}</text>`;
      if (row.sub) {
        body += `<text x="${PAD + 72}" y="${y + 56}" fill="#94a3b8" font-size="18" font-family="${FF}">${esc(truncate(row.sub, 34))}</text>`;
      }
      body += `<text x="${W - PAD - 16}" y="${y + 40}" text-anchor="end" fill="${theme.accent}" font-size="24" font-weight="700" font-family="${FF}">${esc(truncate(row.value, 16))}</text>`;
    });
    if (extra > 0) {
      const y = headerH + kpiH + 8 + rows.length * ROW_H;
      body += `<text x="${W / 2}" y="${y + 8}" text-anchor="middle" fill="#64748b" font-size="18" font-family="${FF}">+ yana ${extra} ta</text>`;
    }
  }

  const kpis = (data.kpis || []).slice(0, 3);
  const kpiW = (W - PAD * 2 - 24) / 3;
  let kpiSvg = "";
  kpis.forEach((kpi, i) => {
    const x = PAD + i * (kpiW + 12);
    const y = headerH + 8;
    kpiSvg += `<rect x="${x}" y="${y}" width="${kpiW}" height="84" rx="16" fill="${theme.chip}" stroke="rgba(255,255,255,0.08)"/>`;
    kpiSvg += `<text x="${x + 18}" y="${y + 30}" fill="#94a3b8" font-size="16" font-weight="600" font-family="${FF}">${esc(kpi.label)}</text>`;
    kpiSvg += `<text x="${x + 18}" y="${y + 62}" fill="#ffffff" font-size="24" font-weight="700" font-family="${FF}">${esc(truncate(kpi.value, 14))}</text>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    ${svgFontDefs()}
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.g1}"/>
      <stop offset="100%" stop-color="${theme.g2}"/>
    </linearGradient>
    <linearGradient id="hdr" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${theme.accent2}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${theme.accent}" stop-opacity="0.08"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="${W}" height="${H}" rx="28" fill="url(#bg)"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="27" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
  <rect x="${PAD}" y="24" width="${W - PAD * 2}" height="112" rx="20" fill="url(#hdr)" stroke="rgba(255,255,255,0.08)"/>
  ${
    logo
      ? `<image href="${logo}" x="${PAD + 16}" y="42" width="72" height="72" preserveAspectRatio="xMidYMid meet"/>`
      : `<rect x="${PAD + 16}" y="42" width="72" height="72" rx="14" fill="rgba(255,255,255,0.06)"/>`
  }
  <text x="${PAD + (logo ? 104 : 96)}" y="68" fill="#ffffff" font-size="30" font-weight="700" font-family="${FF}">${esc(data.title)}</text>
  <text x="${PAD + (logo ? 104 : 96)}" y="98" fill="#94a3b8" font-size="18" font-family="${FF}">${esc(data.subtitle)} · ${esc(data.dateLabel)} · ${esc(data.timeLabel)}</text>
  <rect x="${W - PAD - 92}" y="48" width="76" height="34" rx="10" fill="${theme.chip}" stroke="${theme.accent}" stroke-opacity="0.35"/>
  <text x="${W - PAD - 54}" y="71" text-anchor="middle" fill="${theme.accent}" font-size="14" font-weight="700" font-family="${FF}">${esc(theme.badge)}</text>
  ${kpiSvg}
  ${body}
  <line x1="${PAD}" y1="${H - footerH}" x2="${W - PAD}" y2="${H - footerH}" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
  <text x="${PAD}" y="${H - 24}" fill="#64748b" font-size="16" font-family="${FF}">KANSTIK · Face ID hisobot</text>
  <text x="${W - PAD}" y="${H - 24}" text-anchor="end" fill="#64748b" font-size="16" font-family="${FF}">${esc(data.timeLabel)}</text>
</svg>`;
}

export async function renderAdminReportPng(data) {
  const sharp = (await import("sharp")).default;
  const svg = buildSvg(data);
  return sharp(Buffer.from(svg)).png({ quality: 92 }).toBuffer();
}

export function reportPhotoCaption(data) {
  const icons = {
    working: "👷",
    debtors: "💰",
    today: "📅",
    today_debt: "⚠️",
    leaders: "🏆",
  };
  const icon = icons[data.kind] || "📊";
  return `${icon} <b>${data.title}</b>\n📅 ${data.dateLabel} · 🕐 ${data.timeLabel}`;
}
