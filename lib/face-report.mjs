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

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function logoB64() {
  return fs.readFileSync(path.join(assets, "kanstik-logo.svg")).toString("base64");
}

function photoB64(photoPath) {
  if (!photoPath || !fs.existsSync(photoPath)) return { b64: "", mime: "image/jpeg" };
  const buf = fs.readFileSync(photoPath);
  return { b64: buf.toString("base64"), mime: "image/jpeg" };
}

function fmtFooterDate(dayKey) {
  if (!dayKey) return "";
  const [y, m, d] = dayKey.split("-");
  return `${d}.${m}.${y}`;
}

function breakdownRows(card) {
  const dayLeft = Math.max(0, SHIFT_MS - card.dayWorkedMs);
  const rows = [
    { source: "Кунлик меъёр", formula: "12 соат", points: "—" },
    { source: "Бугун ишланган", formula: "Face ID сканер", points: fmtDuration(card.dayWorkedMs) },
  ];
  if (dayLeft > 60_000) {
    rows.push({
      source: "Кунлик қарз",
      formula: `${fmtDuration(SHIFT_MS)} − ${fmtDuration(card.dayWorkedMs)}`,
      points: fmtDuration(dayLeft),
    });
  } else {
    rows.push({ source: "Кунлик қарз", formula: "меъёр бажарилди", points: "0" });
  }
  rows.push(
    { source: "Ой жами иш", formula: periodLabel(card.periodKey), points: fmtDuration(card.monthWorkedMs) },
    { source: "Ой умумий қарз", formula: "жами", points: fmtDuration(card.monthDebtMs) }
  );
  return rows;
}

function summaryText(card) {
  const n = card.staffName;
  const w = fmtDuration(card.dayWorkedMs);
  const dayLeft = Math.max(0, SHIFT_MS - card.dayWorkedMs);
  if (card.kind === "left") {
    if (dayLeft > 60_000) {
      return (
        `${n} бугун ${w} ишлади. Иш берувчи олдида кунлик қарз: ${fmtDuration(dayLeft)}. ` +
        `Ой бўйича умумий қарз: ${fmtDuration(card.monthDebtMs)}. Иш кунлари: ${card.workDays}.`
      );
    }
    return `${n} бугун кунлик меъёрни бажарди (${w}). Ой жами: ${fmtDuration(card.monthWorkedMs)}.`;
  }
  if (card.kind === "returned") {
    return `${n} яна ишга қайтди (${card.clock}). Бугун аввал ${w} ишланган. Қолган: ${fmtDuration(dayLeft)}.`;
  }
  return `${n} ишга келди (${card.clock}). Кунлик меъёр: 12 соат. Ҳозир ишда.`;
}

function recommendText(card) {
  const dayLeft = Math.max(0, SHIFT_MS - card.dayWorkedMs);
  if (card.kind === "left" && dayLeft > 60_000) {
    return "Эртаги сменада темпни ошириб, қарзни қоплашга ҳаракат қилинг.";
  }
  if (card.kind === "left") {
    return "Жуда яхши! Кунлик меъёр бажарилди — шу темпни давом эттиринг.";
  }
  return "Яхши иш! Смена охирида қайта сканердан ўтинг.";
}

export function buildFaceReportHtml(card, photoPath) {
  const css = fs.readFileSync(path.join(assets, "face-attendance.css"), "utf8");
  const { b64: avatarB64, mime: avatarMime } = photoB64(photoPath);
  const kind = KIND_CYRL[card.kind] || "HODISA";
  const dayLeft = Math.max(0, SHIFT_MS - card.dayWorkedMs);
  const month = periodLabel(card.periodKey);
  const rows = breakdownRows(card);
  const summary = summaryText(card);
  const recommend = recommendText(card);
  const footerDate = fmtFooterDate(card.dayKey);

  const breakdownHtml = rows
    .map(
      (r) =>
        `<tr><td class="col-src">${esc(r.source)}</td><td class="col-formula">${esc(r.formula)}</td><td class="col-pts">${esc(r.points)}</td></tr>`
    )
    .join("");

  const statusNote =
    card.status === "in"
      ? `Иш: ${fmtDuration(card.dayWorkedMs)} · Ҳолат: ишда`
      : `Иш: ${fmtDuration(card.dayWorkedMs)} · Қарз: ${dayLeft > 60_000 ? fmtDuration(dayLeft) : "йўқ"}`;

  return `<!DOCTYPE html>
<html lang="uz-Cyrl">
<head>
  <meta charset="utf-8"/>
  <title>Иш вақти натижаси</title>
  <style>${css}</style>
</head>
<body>
  <div class="page density-normal">
    <div class="page-top">
      <div class="hero-header">
        <div class="hero-brand">
          <img class="company-logo" src="data:image/svg+xml;base64,${logoB64()}" alt="Kanstik"/>
        </div>
        <h1 class="hero-title">Склад ходимининг иш вақти натижаси</h1>
        <div class="photo-wrap photo-hero">
          ${
            avatarB64
              ? `<img src="data:${avatarMime};base64,${avatarB64}" alt=""/>`
              : `<div class="photo-placeholder">👤</div>`
          }
        </div>
      </div>

      <div class="meta-bar">
        <div class="meta-item">
          <span class="meta-ico">📅</span>
          <div class="meta-body">
            <span class="meta-label">Сана</span>
            <span class="meta-value">${esc(card.dayKey)}</span>
          </div>
        </div>
        <div class="meta-item">
          <span class="meta-ico">👤</span>
          <div class="meta-body">
            <span class="meta-label">Ходим</span>
            <span class="meta-value">${esc(card.staffName)}</span>
          </div>
        </div>
        <div class="meta-item">
          <span class="meta-ico">🗓</span>
          <div class="meta-body">
            <span class="meta-label">Период</span>
            <span class="meta-value">${esc(card.periodKey)}</span>
          </div>
        </div>
      </div>

      <div class="kpi-row">
        <div class="kpi-card kpi-total">
          <div class="kpi-label">Бугун ишланган</div>
          <div class="kpi-value">${esc(fmtDuration(card.dayWorkedMs))}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Кунлик қарз</div>
          <div class="kpi-value ${dayLeft > 60_000 ? "" : "kpi-green"}">${dayLeft > 60_000 ? esc(fmtDuration(dayLeft)) : "✓"}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Ой жами</div>
          <div class="kpi-value kpi-blue">${esc(fmtDuration(card.monthWorkedMs))}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Ой қарзи</div>
          <div class="kpi-value">${esc(fmtDuration(card.monthDebtMs))}</div>
        </div>
      </div>
    </div>

    <div class="main-grid">
      <div class="left-col">
        <div class="section-block">
          <div class="section-bar">АСОСИЙ КЎРСАТКИЧЛАР</div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>КЎРСАТКИЧ</th>
                  <th>БУГУН</th>
                  <th>ОЙ</th>
                  <th>КУНЛАР</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1</td>
                  <td>Иш вақти</td>
                  <td>${esc(fmtDuration(card.dayWorkedMs))}</td>
                  <td>${esc(fmtDuration(card.monthWorkedMs))}</td>
                  <td>${esc(String(card.workDays))}</td>
                </tr>
                <tr>
                  <td>2</td>
                  <td>Қарз</td>
                  <td>${dayLeft > 60_000 ? esc(fmtDuration(dayLeft)) : "—"}</td>
                  <td>${esc(fmtDuration(card.monthDebtMs))}</td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="highlights">
          <div class="highlight-box">
            <div class="hl-label">📌 ҲОЛАТ</div>
            <div class="hl-value">${esc(kind)} · ${esc(card.clock)}</div>
          </div>
          <div class="highlight-box">
            <div class="hl-label">⏱ МЕЪЁР</div>
            <div class="hl-value">12 соат / кун · ${month}</div>
          </div>
        </div>

        <div class="summary-box">
          <h3>ҚИСҚАЧА ХУЛОСА</h3>
          <p>${esc(summary)}</p>
          <div class="sub">Таклиф:</div>
          <p>${esc(recommend)}</p>
        </div>
      </div>

      <div class="right-col">
        <div class="section-block section-block-fill">
          <div class="section-bar">МАНБА ВА ҲИСОБЛАШ</div>
          <div class="table-wrap">
            <table class="data-table breakdown-daily-table">
              <thead>
                <tr>
                  <th class="col-src-h">Манба</th>
                  <th class="col-formula-h">Қандай ҳисобланди</th>
                  <th class="col-pts-h">Қиймат</th>
                </tr>
              </thead>
              <tbody>
                ${breakdownHtml}
                <tr class="bd-total-row">
                  <td class="col-src"><b>ЖАМИ</b></td>
                  <td class="col-formula">иш ${esc(fmtDuration(card.dayWorkedMs))} · қарз ${esc(fmtDuration(card.monthDebtMs))}</td>
                  <td class="col-pts">${esc(String(card.workDays))} кун</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="bots-stack bots-stack-compact">
            <div class="bot-card time-summary">
              <div class="bot-ico">⏱</div>
              <div class="bot-body">
                <div class="bot-title">ИШ ВАҚТИ (БУГУН)</div>
                <div class="bot-text">${esc(statusNote)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer class="footer">
      <span class="footer-brand">🏭 Face ID · Sklad-3</span>
      <span class="footer-date">${esc(card.staffName)} · ${esc(footerDate)}</span>
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
        viewport: { width: 1240, height: 1754 },
        deviceScaleFactor: 2,
      });
      await page.setContent(html, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const height = await page.evaluate(() =>
        Math.max(1754, Math.ceil(document.querySelector(".page").getBoundingClientRect().height) + 4)
      );
      await page.setViewportSize({ width: 1240, height });
      return await page.locator(".page").screenshot({ type: "png", animations: "disabled" });
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.warn("PNG render:", e.message);
    return null;
  }
}
