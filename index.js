/**
 * Face ID bot — Hikvision webhook/poll → Telegram
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import DigestFetch from "digest-fetch";
import { isFaceEvent, loadEmployees, fmtClock } from "./lib/attendance.mjs";
import { initDb, shouldRunMonthClose, closePeriod, setMeta } from "./lib/db.mjs";
import { handleFaceEvent } from "./lib/process-event.mjs";
import { buildMonthlyReport } from "./lib/report.mjs";
import { periodKey } from "./lib/period.mjs";
import {
  startWizard,
  loadRegistration,
  afterPhoto,
  currentEmployee,
  askMessage,
} from "./lib/register-wizard.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR =
  process.env.DATA_DIR || process.env.DATABASE_DIR || path.join(__dirname, "data");
const TELEGRAM_POLL = String(process.env.TELEGRAM_POLL ?? "1") !== "0";
const employees = loadEmployees(DATA_DIR);
initDb(DATA_DIR);

const BOT_TOKEN = (process.env.BOT_TOKEN || "").trim();
const GROUP_CHAT_ID = String(process.env.GROUP_CHAT_ID || "-1001877019294").trim();
const NOTIFY_CHAT_ID = String(
  process.env.NOTIFY_CHAT_ID || process.env.ADMIN_IDS?.split(/[,;]/)[0] || GROUP_CHAT_ID
).trim();
const ADMIN_IDS = new Set(
  (process.env.ADMIN_IDS || "1432810519")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
);
const FACE_IP = (process.env.FACE_DEVICE_IP || "192.168.0.28").trim();
const FACE_USER = (process.env.FACE_DEVICE_USER || "admin").trim();
const FACE_PASS = (process.env.FACE_DEVICE_PASSWORD || "").trim();
const POLL_SEC = Math.max(10, Number(process.env.POLL_INTERVAL_SEC || 25));
const TZ_OFFSET = (process.env.FACE_TIMEZONE || "+05:00").trim();
const PORT = Number(process.env.PORT || 8080);
const WEBHOOK_PATH = (process.env.WEBHOOK_PATH || "/webhook/hikvision").trim();
const USE_POLL = String(process.env.USE_POLL || "0") === "1";

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN yo'q");
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });

function todayRange() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return {
    start: `${y}-${m}-${day}T00:00:00${TZ_OFFSET}`,
    end: `${y}-${m}-${day}T23:59:59${TZ_OFFSET}`,
  };
}

async function tg(method, body = {}) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || "Telegram API xato");
  return data.result;
}

async function send(chatId, text, extra = {}) {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });
}

function empName(ev) {
  return (
    ev.name ||
    ev.employeeNoString ||
    ev.employeeNo ||
    ev.cardNo ||
    ""
  ).toString().trim();
}

async function processEvent(ev) {
  return handleFaceEvent(ev, employees, (msg) => send(NOTIFY_CHAT_ID, msg));
}

async function maybeCloseMonth() {
  const pk = shouldRunMonthClose();
  if (!pk) return;
  const report = buildMonthlyReport(pk, "📅 Oy yopildi (2-sana)");
  await send(GROUP_CHAT_ID, report);
  closePeriod(pk);
  setMeta(`close_sent_${pk}`, "1");
  console.log("Month closed:", pk);
}

function xmlTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function parseWebhookBody(raw) {
  if (!raw) return null;
  let block = raw;
  if (raw.includes("application/json") || raw.trim().startsWith("{")) {
    const jsonPart = raw.match(/\{[\s\S]*\}/)?.[0];
    if (jsonPart) {
      try {
        const j = JSON.parse(jsonPart);
        const e = j.AccessControllerEvent || j.AcsEvent || j;
        return {
          name: e.employeeName || e.name,
          employeeNoString: e.employeeNoString || e.employeeNo,
          dateTime: e.dateTime || e.time,
          minor: e.minor || e.subEventType,
          label: e.label,
          attendanceStatus: e.attendanceStatus,
          serialNo: e.serialNo,
          time: e.dateTime || e.time,
        };
      } catch { /* xml fallback */ }
    }
  }
  if (!raw.includes("AccessControllerEvent") && !raw.includes("employeeName")) return null;
  block = raw.includes("AccessControllerEvent")
    ? raw.match(/<AccessControllerEvent[\s\S]*?<\/AccessControllerEvent>/i)?.[0] || raw
    : raw;
  const ev = {
    name: xmlTag(block, "employeeName") || xmlTag(block, "name"),
    employeeNoString: xmlTag(block, "employeeNoString") || xmlTag(block, "employeeNo"),
    dateTime: xmlTag(block, "dateTime") || xmlTag(block, "time"),
    minor: xmlTag(block, "minor") || xmlTag(block, "subEventType"),
    label: xmlTag(block, "label"),
    attendanceStatus: xmlTag(block, "attendanceStatus"),
    serialNo: xmlTag(block, "serialNo"),
  };
  if (!ev.name && !ev.employeeNoString) return null;
  ev.time = ev.dateTime;
  return ev;
}

async function handleWebhook(req, res) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OK");
  try {
    console.log(`Webhook in: ${raw.length}b`);
    const ev = parseWebhookBody(raw);
    if (!ev) {
      console.warn("Webhook: parse failed", raw.slice(0, 120));
      return;
    }
    const ok = await processEvent(ev);
    if (ok) console.log(`Webhook: ${empName(ev)}`);
  } catch (e) {
    console.warn("Webhook:", e.message);
  }
}

function startHttpServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end("face-id-bot ok");
    }
    if (req.method === "POST" && req.url === WEBHOOK_PATH) {
      return handleWebhook(req, res);
    }
    res.writeHead(404);
    res.end("not found");
  });
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`HTTP :${PORT} webhook=${WEBHOOK_PATH}`);
  });
}

async function fetchAcsEvents(start, end) {
  const payload = JSON.stringify({
    AcsEventCond: {
      searchID: "1",
      searchResultPosition: 0,
      maxResults: 50,
      major: 0,
      minor: 0,
      startTime: start,
      endTime: end,
      timeReverseOrder: true,
    },
  });
  const client = new DigestFetch(FACE_USER, FACE_PASS);
  const res = await client.fetch(
    `http://${FACE_IP}/ISAPI/AccessControl/AcsEvent?format=json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    }
  );
  const text = await res.text();
  if (res.status === 401) throw new Error("Face ID parol noto'g'ri (401)");
  if (!res.ok) throw new Error(`Face ID HTTP ${res.status}`);
  return text;
}

function parseEvents(raw) {
  try {
    const j = JSON.parse(raw);
    const info = j?.AcsEvent?.InfoList;
    if (!info) return [];
    return Array.isArray(info) ? info : [info];
  } catch {
    return [];
  }
}

async function pollFace() {
  if (!FACE_PASS) return;
  const { start, end } = todayRange();
  let raw;
  try {
    raw = await fetchAcsEvents(start, end);
  } catch (e) {
    console.warn("Face poll:", e.message);
    return;
  }
  const events = parseEvents(raw).reverse();
  for (const ev of events) {
    try {
      await processEvent(ev);
    } catch (e) {
      console.warn("Notify:", e.message);
    }
  }
}

async function downloadPhoto(fileId, destPath) {
  const f = await tg("getFile", { file_id: fileId });
  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${f.file_path}`;
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
}

async function handlePhoto(msg) {
  const uid = msg.from?.id;
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.has(uid)) return;
  const reg = loadRegistration(DATA_DIR);
  if (!reg.active || !reg.awaitingPhoto) {
    return send(chatId, "Avval /hodim buyrug'ini yuboring.");
  }
  const emp = currentEmployee(DATA_DIR);
  if (!emp) return send(chatId, "Navbatda hodim yo'q.");

  const photos = msg.photo;
  const best = photos[photos.length - 1];
  const facesDir = path.join(DATA_DIR, "faces");
  fs.mkdirSync(facesDir, { recursive: true });
  const filename = `${emp.key}.jpg`;
  const dest = path.join(facesDir, filename);
  await downloadPhoto(best.file_id, dest);

  const result = afterPhoto(DATA_DIR, `faces/${filename}`);
  return send(chatId, result.text);
}

async function handleUpdate(upd) {
  const msg = upd.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const uid = msg.from?.id;

  if (msg.photo?.length) {
    return handlePhoto(msg);
  }
  if (!msg.text) return;
  const text = msg.text.trim();

  if (text === "/start") {
    return send(
      chatId,
      "👋 <b>Face ID Hisobot</b>\n\n/jadval — oylik jadval (guruh)\n/bugun — bugungi hodisalar\n/id — sizning ID"
    );
  }
  if (text === "/hodim" && ADMIN_IDS.has(uid)) {
    const r = startWizard(DATA_DIR);
    return send(chatId, r.text);
  }
  if ((text === "/jadval" || text === "/oy") && ADMIN_IDS.has(uid)) {
    const pk = periodKey();
    return send(GROUP_CHAT_ID, buildMonthlyReport(pk, "Joriy oy"));
  }
  if (text === "/id") {
    return send(chatId, `ID: <code>${uid}</code>\nChat: <code>${chatId}</code>`);
  }
  if (text === "/bugun" || text === "/hozir") {
    if (!FACE_PASS) {
      return send(chatId, "⚠️ FACE_DEVICE_PASSWORD sozlanmagan.");
    }
    const { start, end } = todayRange();
    try {
      const raw = await fetchAcsEvents(start, end);
      const events = parseEvents(raw);
      if (!events.length) return send(chatId, "Bugun hodisa yo'q yoki ulanish xato.");
      const lines = events.filter(isFaceEvent).slice(0, 20).map((ev) => {
        return `• ${empName(ev)} — ${fmtClock(ev)}`;
      });
      return send(chatId, `<b>Bugun:</b>\n${lines.join("\n")}`);
    } catch (e) {
      return send(chatId, `⚠️ ${e.message}`);
    }
  }
  if (text.startsWith("/status") && ADMIN_IDS.has(uid)) {
    const me = await tg("getMe");
    return send(
      chatId,
      `✅ @${me.username}\nFace: <code>${FACE_IP}</code>\nGuruh: <code>${GROUP_CHAT_ID}</code>\nWebhook: <code>${WEBHOOK_PATH}</code>\nPoll: ${USE_POLL ? `${POLL_SEC}s` : "off"}`
    );
  }
}

async function pollTelegram(offset) {
  const updates = await tg("getUpdates", { timeout: 30, offset });
  let next = offset;
  for (const u of updates) {
    next = u.update_id + 1;
    try {
      await handleUpdate(u);
    } catch (e) {
      console.warn("Update:", e.message);
    }
  }
  return next;
}

async function bootRegistration() {
  const reg = loadRegistration(DATA_DIR);
  if (!reg.active || !reg.awaitingPhoto) return;
  const emp = currentEmployee(DATA_DIR);
  if (!emp) return;
  const total = reg.total || Object.keys(employees.staff || {}).length;
  const done = reg.done || 0;
  await send(NOTIFY_CHAT_ID, askMessage(emp, done + 1, total));
}

async function main() {
  startHttpServer();
  const me = await tg("getMe");
  console.log(
    `Face ID bot @${me.username} | face=${FACE_IP} | notify=${NOTIFY_CHAT_ID} | tgPoll=${TELEGRAM_POLL}`
  );
  if (TELEGRAM_POLL) await bootRegistration();

  let offset = 0;
  let lastPoll = 0;
  let lastMonthCheck = 0;
  for (;;) {
    const tasks = [];
    if (TELEGRAM_POLL) {
      tasks.push(pollTelegram(offset).then((o) => (offset = o)));
    } else {
      await new Promise((r) => setTimeout(r, 2000));
    }
    const now = Date.now();
    if (now - lastMonthCheck >= 3600_000) {
      lastMonthCheck = now;
      tasks.push(maybeCloseMonth());
    }
    if (USE_POLL && FACE_PASS) {
      if (now - lastPoll >= POLL_SEC * 1000) {
        lastPoll = now;
        tasks.push(pollFace());
      }
    }
    await Promise.all(tasks);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
