import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fmtDuration, periodLabel, SHIFT_MS } from "./period.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, "..", "assets", "report");

const KIND_CYRL = {
  arrived: "ИШГА КЕЛДИ",
  returned: "ЯНА ҚАЙТДИ",
  left: "ИШДАН КЕТДИ",
};

const KIND_ICON = { arrived: "▶", returned: "↩", left: "■" };

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function logoB64() {
  return fs.readFileSync(path.join(assets, "kanstik-logo.svg")).toString("base64");
}

function assetB64(name) {
  return fs.readFileSync(path.join(assets, name)).toString("base64");
}

function fmtFooterDate(dayKey) {
  if (!dayKey) return "";
  const [y, m, d] = dayKey.split("-");
  return `${d}.${m}.${y}`;
}

function workPercent(ms) {
  return Math.min(100, Math.round((ms / SHIFT_MS) * 100));
}

/** Kinematik portret — keskin, yorqin, kontrastli */
async function portraitB64(photoPath) {
  if (!photoPath || !fs.existsSync(photoPath)) return "";
  try {
    const sharp = (await import("sharp")).default;
    return (
      await sharp(photoPath)
        .rotate()
        .resize(800, 920, { fit: "cover", position: "top" })
        .modulate({ brightness: 1.06, saturation: 1.15 })
        .linear(1.12, -14)
        .sharpen({ sigma: 1.0 })
        .jpeg({ quality: 96 })
        .toBuffer()
    ).toString("base64");
  } catch (e) {
    console.warn("portrait:", e.message);
    return fs.readFileSync(photoPath).toString("base64");
  }
}

function progressRing(pct) {
  const r = 118;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return `<svg viewBox="0 0 280 280">
    <defs>
      <linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f0d060"/>
        <stop offset="35%" stop-color="#3b82f6"/>
        <stop offset="70%" stop-color="#60a5fa"/>
        <stop offset="100%" stop-color="#f0d060"/>
      </linearGradient>
      <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="6" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <circle cx="140" cy="140" r="${r + 8}" fill="none" stroke="rgba(59,130,246,0.12)" stroke-width="2"/>
    <circle cx="140" cy="140" r="${r}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="16"/>
    <circle cx="140" cy="140" r="${r}" fill="none" stroke="url(#rg)" stroke-width="16"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" filter="url(#glow)"/>
  </svg>`;
}

function breakdownRows(card) {
  const dayLeft = Math.max(0, SHIFT_MS - card.dayWorkedMs);
  const rows = [
    ["Кунлик меъёр", "12 соат", "—"],
    ["Бугун ишланган", "Face ID", fmtDuration(card.dayWorkedMs)],
  ];
  if (dayLeft > 60_000) {
    rows.push(["Кунлик қарз", `${fmtDuration(SHIFT_MS)} − ${fmtDuration(card.dayWorkedMs)}`, fmtDuration(dayLeft)]);
  } else {
    rows.push(["Кунлик қарз", "бажарилди", "✓"]);
  }
  rows.push(
    ["Ой жами", periodLabel(card.periodKey), fmtDuration(card.monthWorkedMs)],
    ["Ой қарзи", "жами", fmtDuration(card.monthDebtMs)]
  );
  return rows;
}

function summaryText(card) {
  const n = card.staffName;
  const w = fmtDuration(card.dayWorkedMs);
  const dayLeft = Math.max(0, SHIFT_MS - card.dayWorkedMs);
  if (card.kind === "left") {
    if (dayLeft > 60_000) {
      return `${n} бугун ${w} ишлади. Қарз: ${fmtDuration(dayLeft)}. Ой жами қарз: ${fmtDuration(card.monthDebtMs)}.`;
    }
    return `${n} кунлик меъёрни бажарди — ${w}.`;
  }
  if (card.kind === "returned") {
    return `${n} яна ишга қайтди. Бугун ${w}, қолган ${fmtDuration(dayLeft)}.`;
  }
  return `${n} ишга келди. Кунлик меъёр: 12 соат.`;
}

function recommendText(card) {
  const dayLeft = Math.max(0, SHIFT_MS - card.dayWorkedMs);
  if (card.kind === "left" && dayLeft > 60_000) return "Эртаги сменада темпни ошириб, қарзни қопланг.";
  if (card.kind === "left") return "Аъло! Шу темпни сақлаб қолинг.";
  return "Смена охирида қайта сканердан ўтинг.";
}

export async function buildFaceReportHtml(card, photoPath) {
  const css = fs.readFileSync(path.join(assets, "face-premium.css"), "utf8");
  const avatarB64 = await portraitB64(photoPath);
  const beamsB64 = assetB64("fx-beams.svg");
  const kind = KIND_CYRL[card.kind] || "HODISA";
  const icon = KIND_ICON[card.kind] || "★";
  const dayLeft = Math.max(0, SHIFT_MS - card.dayWorkedMs);
  const pct = workPercent(card.dayWorkedMs);
  const month = periodLabel(card.periodKey);
  const summary = summaryText(card);
  const recommend = recommendText(card);
  const footerDate = fmtFooterDate(card.dayKey);

  let statusClass = "st-left";
  if (card.kind === "arrived") statusClass = "st-arrived";
  else if (card.kind === "returned") statusClass = "st-returned";
  else if (dayLeft <= 60_000) statusClass = "st-left ok";

  const debtClass = dayLeft > 60_000 ? "gold" : "green";
  const debtVal = dayLeft > 60_000 ? fmtDuration(dayLeft) : "✓";
  const liveDot = card.kind !== "left" ? '<span class="live-dot"></span>' : "";

  const tableRows = breakdownRows(card)
    .map(([a, b, c]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td><td class="v">${esc(c)}</td></tr>`)
    .join("");

  const photoHtml = avatarB64
    ? `<img src="data:image/jpeg;base64,${avatarB64}" alt=""/>`
    : `<div class="portrait-ph">★</div>`;

  const unitId = card.staffKey ? `ID · ${esc(card.staffKey)}` : "SKLAD-3";

  return `<!DOCTYPE html>
<html lang="uz-Cyrl">
<head><meta charset="utf-8"/><style>${css}</style></head>
<body>
<div class="page">
  <img class="fx-beams" src="data:image/svg+xml;base64,${beamsB64}" alt=""/>
  <div class="grid-bg"></div>
  <div class="glow-orb"></div>
  <div class="glow-orb-gold"></div>
  <div class="vignette"></div>
  <div class="corner-deco tl"></div><div class="corner-deco tr"></div>
  <div class="corner-deco bl"></div><div class="corner-deco br"></div>

  <header class="hdr">
    <div class="logo"><img src="data:image/svg+xml;base64,${logoB64()}" alt="Kanstik"/></div>
    <div class="hdr-mid">
      <h1>Склад ходимининг иш вақти натижаси</h1>
      <p>FACE ID · KANSTIK SAMARQAND</p>
    </div>
    <div class="hdr-badge">SKLAD-3</div>
  </header>

  <section class="hero">
    <div class="portrait-stage">
      <div class="portrait-halo"></div>
      <div class="portrait-wrap">
        <div class="c tl"></div><div class="c tr"></div>
        <div class="c bl"></div><div class="c br"></div>
        <div class="portrait-box">
          ${photoHtml}
          <div class="scan-lines"></div>
        </div>
        <div class="unit-badge">${unitId}</div>
      </div>
    </div>

    <div class="emp">${esc(card.staffName)}</div>
    <div class="status-wrap">
      <div class="status ${statusClass}">${liveDot}${icon} ${esc(kind)}</div>
    </div>
    <div class="time-line">${esc(card.clock)} · ${esc(card.dayKey)}</div>
  </section>

  <div class="chips">
    <div class="chip">Ой<b>${esc(month)}</b></div>
    <div class="chip">Иш кунлари<b>${esc(String(card.workDays))}</b></div>
    <div class="chip">Меъёр<b>12 соат</b></div>
  </div>

  <section class="stats-band">
    <div class="ring-wrap">
      <div class="ring-glow"></div>
      ${progressRing(pct)}
      <div class="ring-mid">
        <div class="ring-pct">${pct}%</div>
        <div class="ring-lbl">кунлик</div>
      </div>
    </div>
    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-lbl">Бугун иш</div>
        <div class="kpi-val blue">${esc(fmtDuration(card.dayWorkedMs))}</div>
      </div>
      <div class="kpi">
        <div class="kpi-lbl">Кунлик қарз</div>
        <div class="kpi-val ${debtClass}">${esc(debtVal)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-lbl">Ой жами</div>
        <div class="kpi-val">${esc(fmtDuration(card.monthWorkedMs))}</div>
      </div>
      <div class="kpi">
        <div class="kpi-lbl">Ой қарзи</div>
        <div class="kpi-val gold">${esc(fmtDuration(card.monthDebtMs))}</div>
      </div>
    </div>
  </section>

  <div class="panels">
    <div class="panel">
      <div class="panel-h">Манба ва ҳисоблаш</div>
      <table>
        <thead><tr><th>Манба</th><th>Формула</th><th>Қиймат</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <div class="panel sum">
      <div class="panel-h">Хулоса</div>
      <p>${esc(summary)}</p>
      <div class="order">${esc(recommend)}</div>
    </div>
  </div>

  <footer class="ftr">
    <span class="ftr-tag">KANSTIK · FACE ID</span>
    <span>${esc(card.staffName)} · ${esc(footerDate)}</span>
  </footer>
</div>
</body>
</html>`;
}

let _playwright;
export async function renderFaceReportPng(html) {
  try {
    if (!_playwright) _playwright = await import("playwright");
    const browser = await _playwright.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1080, height: 1380 },
        deviceScaleFactor: 3,
      });
      await page.setContent(html, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const height = await page.evaluate(() =>
        Math.max(1380, Math.ceil(document.querySelector(".page").getBoundingClientRect().height) + 8)
      );
      await page.setViewportSize({ width: 1080, height });
      return await page.locator(".page").screenshot({ type: "png", animations: "disabled" });
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.warn("PNG render:", e.message);
    return null;
  }
}
