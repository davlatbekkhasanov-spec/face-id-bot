/**
 * Face ID bot — Hikvision kelish/ketish → Telegram
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import DigestFetch from "digest-fetch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

const BOT_TOKEN = (process.env.BOT_TOKEN || "").trim();
const GROUP_CHAT_ID = String(process.env.GROUP_CHAT_ID || "-1001877019294").trim();
const ADMIN_IDS = new Set(
  (process.env.ADMIN_IDS || "1432810519")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
);
const FACE_IP = (process.env.FACE_DEVICE_IP || "192.168.110.50").trim();
const FACE_USER = (process.env.FACE_DEVICE_USER || "admin").trim();
const FACE_PASS = (process.env.FACE_DEVICE_PASSWORD || "").trim();
const POLL_SEC = Math.max(10, Number(process.env.POLL_INTERVAL_SEC || 25));
const TZ_OFFSET = (process.env.FACE_TIMEZONE || "+05:00").trim();

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN yo'q");
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { lastSerial: 0, seen: {}, watchlist: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function todayRange() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return {
    start: `${y}-${m}-${day}T00:00:00${TZ_OFFSET}`,
    end: `${y}-${m}-${day}T23:59:59${TZ_OFFSET}`,
    key: `${y}-${m}-${day}`,
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

function empName(ev) {
  return (
    ev.name ||
    ev.employeeNoString ||
    ev.employeeNo ||
    ev.cardNo ||
    "Noma'lum"
  ).toString();
}

function isIn(ev) {
  const t = String(ev.attendanceStatus || ev.doorNo || ev.minor || "").toLowerCase();
  if (t.includes("out") || t.includes("check out") || t === "2") return false;
  return true;
}

function eventKey(ev) {
  return `${ev.serialNo || ev.time || ""}_${empName(ev)}`;
}

function fmtTime(ev) {
  const t = String(ev.time || "");
  const m = t.match(/T(\d{2}:\d{2}:\d{2})/);
  return m ? m[1].slice(0, 5) : t.slice(11, 16) || "—";
}

async function notifyEvent(ev) {
  const name = empName(ev);
  const time = fmtTime(ev);
  const icon = isIn(ev) ? "📥" : "📤";
  const action = isIn(ev) ? "keldi" : "ketdi";
  const text = `${icon} <b>${name}</b> ${action} — <b>${time}</b>`;
  await send(GROUP_CHAT_ID, text);
}

async function pollFace() {
  if (!FACE_PASS) return;
  const { start, end, key } = todayRange();
  let raw;
  try {
    raw = await fetchAcsEvents(start, end);
  } catch (e) {
    console.warn("Face poll:", e.message);
    return;
  }
  if (raw.includes("401") || raw.includes("Unauthorized")) {
    console.warn("Face ID: parol noto'g'ri (401)");
    return;
  }
  const events = parseEvents(raw).reverse();
  const state = loadState();
  for (const ev of events) {
    const serial = Number(ev.serialNo || 0);
    const k = eventKey(ev);
    if (state.seen[k]) continue;
    if (serial && serial <= (state.lastSerial || 0)) continue;
    state.seen[k] = true;
    if (serial > (state.lastSerial || 0)) state.lastSerial = serial;
    try {
      await notifyEvent(ev);
    } catch (e) {
      console.warn("Notify:", e.message);
    }
  }
  saveState(state);
}

async function handleUpdate(upd) {
  const msg = upd.message;
  if (!msg?.text) return;
  const chatId = msg.chat.id;
  const uid = msg.from?.id;
  const text = msg.text.trim();

  if (text === "/start") {
    return send(
      chatId,
      "👋 <b>Face ID bot</b>\n\nHikvision terminaldan kelish/ketish xabarlari shu guruhga boradi.\n\n/bugin — bugungi holat\n/id — sizning ID"
    );
  }
  if (text === "/id") {
    return send(chatId, `ID: <code>${uid}</code>\nChat: <code>${chatId}</code>`);
  }
  if (text === "/bugun" || text === "/hozir") {
    if (!FACE_PASS) {
      return send(chatId, "⚠️ FACE_DEVICE_PASSWORD Railway da sozlanmagan.");
    }
    const { start, end } = todayRange();
    try {
      const raw = await curlAcsEvents(start, end);
      const events = parseEvents(raw);
      if (!events.length) return send(chatId, "Bugun hodisa yo'q yoki ulanish xato.");
      const lines = events.slice(0, 20).map((ev) => {
        const icon = isIn(ev) ? "📥" : "📤";
        return `${icon} ${empName(ev)} — ${fmtTime(ev)}`;
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
      `✅ @${me.username}\nFace: <code>${FACE_IP}</code>\nGuruh: <code>${GROUP_CHAT_ID}</code>\nPoll: ${POLL_SEC}s`
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

async function main() {
  const me = await tg("getMe");
  console.log(`Face ID bot @${me.username} | face=${FACE_IP} | group=${GROUP_CHAT_ID}`);
  await send(
    GROUP_CHAT_ID,
    `🟢 <b>Face ID bot ishga tushdi</b>\n@${me.username}`
  ).catch(() => {});

  let offset = 0;
  let lastPoll = 0;
  for (;;) {
    const tasks = [pollTelegram(offset).then((o) => (offset = o))];
    const now = Date.now();
    if (now - lastPoll >= POLL_SEC * 1000) {
      lastPoll = now;
      tasks.push(pollFace());
    }
    await Promise.all(tasks);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
