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

const KIND_ICON = { arrived: "⚔", returned: "🔄", left: "🏁" };

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

/** Sharp: xira xaki tint + harbiy forma overlay */
async function militaryPhotoB64(photoPath) {
  if (!photoPath || !fs.existsSync(photoPath)) return "";
  try {
    const sharp = (await import("sharp")).default;
    const size = 520;
    const overlay = path.join(assets, "uniform-overlay.svg");

    let pipeline = sharp(photoPath)
      .rotate()
      .resize(size, size, { fit: "cover", position: "top" })
      .modulate({ saturation: 0.9, brightness: 1.02 });

  if (fs.existsSync(overlay)) {
      pipeline = pipeline.composite([
        { input: overlay, blend: "over" },
      ]);
    }

    return (await pipeline.jpeg({ quality: 93 }).toBuffer()).toString("base64");
  } catch (e) {
    console.warn("military photo:", e.message);
    return fs.readFileSync(photoPath).toString("base64");
  }
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
    return `${n} кунлик меъёрни бажарди — ${w}. Аъло хизмат!`;
  }
  if (card.kind === "returned") {
    return `${n} яна ишга қайтди. Бугун ${w} ишланган, қолган ${fmtDuration(dayLeft)}.`;
  }
  return `${n} ишга келди. Кунлик вазифа: 12 соат. Омад!`;
}

function recommendText(card) {
  const dayLeft = Math.max(0, SHIFT_MS - card.dayWorkedMs);
  if (card.kind === "left" && dayLeft > 60_000) return "Буюруқ: эртаги сменада темпни ошириб, қарзни қопланг.";
  if (card.kind === "left") return "Буюруқ: шу дисциплина ва темпни сақланг.";
  return "Буюруқ: смена охирида қайта сканердан ўтинг.";
}

export async function buildFaceReportHtml(card, photoPath) {
  const css = fs.readFileSync(path.join(assets, "face-military.css"), "utf8");
  const avatarB64 = await militaryPhotoB64(photoPath);
  const camoB64 = assetB64("camo-pattern.svg");
  const kind = KIND_CYRL[card.kind] || "HODISA";
  const icon = KIND_ICON[card.kind] || "★";
  const dayLeft = Math.max(0, SHIFT_MS - card.dayWorkedMs);
  const pct = workPercent(card.dayWorkedMs);
  const month = periodLabel(card.periodKey);
  const summary = summaryText(card);
  const recommend = recommendText(card);
  const footerDate = fmtFooterDate(card.dayKey);
  const barClass = pct < 50 ? "low" : "";

  let statusClass = "status-left";
  if (card.kind === "arrived") statusClass = "status-arrived";
  else if (card.kind === "returned") statusClass = "status-returned";
  else if (dayLeft <= 60_000) statusClass = "status-left ok";

  const debtKpiClass = dayLeft > 60_000 ? "warn" : "ok";
  const debtKpiVal = dayLeft > 60_000 ? fmtDuration(dayLeft) : "✓";

  const tableRows = breakdownRows(card)
    .map(
      ([a, b, c]) =>
        `<tr><td>${esc(a)}</td><td>${esc(b)}</td><td class="val">${esc(c)}</td></tr>`
    )
    .join("");

  const photoHtml = avatarB64
    ? `<img src="data:image/jpeg;base64,${avatarB64}" alt=""/>`
    : `<div class="photo-placeholder">⚔</div>`;

  const dogTag = card.staffKey ? `ID-${esc(card.staffKey)}` : "FACE ID";

  return `<!DOCTYPE html>
<html lang="uz-Cyrl">
<head><meta charset="utf-8"/><style>${css}</style></head>
<body>
<div class="page">
  <img class="camo-bg" src="data:image/svg+xml;base64,${camoB64}" alt=""/>

  <header class="header-band">
    <div class="brand"><img src="data:image/svg+xml;base64,${logoB64()}" alt="Kanstik"/></div>
    <div class="header-center">
      <div class="header-stars">★ ★ ★</div>
      <div class="header-title">Склад ходимининг иш вақти натижаси</div>
      <div class="header-sub">HARBIY HISOBOT · FACE ID</div>
    </div>
    <div class="header-stars">★ ★ ★</div>
  </header>

  <div class="hero">
    <div class="id-frame">
      <div class="photo-wrap">
        <div class="photo-inner">${photoHtml}</div>
      </div>
      <div class="dog-tag">${dogTag}</div>
    </div>

    <div class="emp-name">${esc(card.staffName)}</div>
    <div class="status-banner ${statusClass}">${icon} ${esc(kind)}</div>
    <div class="clock">${esc(card.clock)} · ${esc(card.dayKey)}</div>

    <div class="meta-row">
      <div class="meta-chip">Ой<b>${esc(month)}</b></div>
      <div class="meta-chip">Иш кунлари<b>${esc(String(card.workDays))}</b></div>
      <div class="meta-chip">Меъёр<b>12 соат</b></div>
    </div>

    <div class="mission-bar">
      <div class="mission-label">
        <h3>⚔ Кунлик вазифа бажарилиши</h3>
        <div class="mission-pct">${pct}%</div>
      </div>
      <div class="bar-track">
        <div class="bar-fill ${barClass}" style="width:${pct}%"></div>
      </div>
      <div class="mission-sub">
        ${esc(fmtDuration(card.dayWorkedMs))} / 12 соат${dayLeft > 60_000 ? ` · Қарз: <b>${esc(fmtDuration(dayLeft))}</b>` : " · <b>Меъёр бажарилди</b>"}
      </div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-label">Бугун иш</div>
      <div class="kpi-val accent">${esc(fmtDuration(card.dayWorkedMs))}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Кунлик қарз</div>
      <div class="kpi-val ${debtKpiClass}">${esc(debtKpiVal)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Ой жами</div>
      <div class="kpi-val">${esc(fmtDuration(card.monthWorkedMs))}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Ой қарзи</div>
      <div class="kpi-val warn">${esc(fmtDuration(card.monthDebtMs))}</div>
    </div>
  </div>

  <div class="panels">
    <div class="panel">
      <div class="panel-title">Манба ва ҳисоблаш</div>
      <table>
        <thead><tr><th>Манба</th><th>Формула</th><th>Қиймат</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <div class="panel summary">
      <div class="panel-title">Буюруқ ва хулоса</div>
      <p>${esc(summary)}</p>
      <div class="tip">⚔ ${esc(recommend)}</div>
    </div>
  </div>

  <footer class="footer">
    <span class="footer-badge">KANSTIK · SKLAD-3</span>
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
        viewport: { width: 1080, height: 1400 },
        deviceScaleFactor: 2,
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
