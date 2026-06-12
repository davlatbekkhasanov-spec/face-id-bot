/**
 * Do'kon tarmog'ida: faqat haqiqiy yuz tanish (minor=75 + ism) -> Telegram.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import DigestFetch from "digest-fetch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT =
  process.env.NOTIFY_CHAT_ID ||
  process.env.ADMIN_IDS?.split(/[,;]/)[0] ||
  process.env.GROUP_CHAT_ID;
const FACE_IP = process.env.FACE_DEVICE_IP || "192.168.0.28";
const FACE_USER = process.env.FACE_DEVICE_USER || "admin";
const FACE_PASS = process.env.FACE_DEVICE_PASSWORD;
const POLL = Math.max(20, Number(process.env.POLL_INTERVAL_SEC || 25));
const TZ = process.env.FACE_TIMEZONE || "+05:00";
const STATE = path.join(root, "data", "bridge-state.json");

fs.mkdirSync(path.dirname(STATE), { recursive: true });
const load = () => {
  try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return { lastSerial: 0 }; }
};
const save = (s) => fs.writeFileSync(STATE, JSON.stringify(s));

function isFaceEvent(ev) {
  const n = String(ev.name || "").trim();
  if (!n || n === "?" || n.toLowerCase() === "noma'lum") return false;
  return Number(ev.minor) === 75;
}

function name(ev) {
  return String(ev.name || ev.employeeNoString || "?");
}

function time(ev) {
  const t = String(ev.time || "");
  const m = t.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : t.slice(11, 16) || "—";
}

async function tg(text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, text, parse_mode: "HTML" }),
  });
}

function today() {
  const d = new Date();
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return { start: `${y}-${m}-${day}T00:00:00${TZ}`, end: `${y}-${m}-${day}T23:59:59${TZ}` };
}

async function fetchEvents() {
  const { start, end } = today();
  const client = new DigestFetch(FACE_USER, FACE_PASS);
  const res = await client.fetch(`http://${FACE_IP}/ISAPI/AccessControl/AcsEvent?format=json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      AcsEventCond: {
        searchID: "1", searchResultPosition: 0, maxResults: 40, major: 0, minor: 0,
        startTime: start, endTime: end, timeReverseOrder: true,
      },
    }),
  });
  const list = JSON.parse(await res.text())?.AcsEvent?.InfoList;
  return list ? (Array.isArray(list) ? list : [list]) : [];
}

console.log(`Poll bridge: ${FACE_IP} -> lichka ${CHAT}`);

// Eski hodisalarni yubormaslik — faqat hozirgi serial dan keyingilari
const state = load();
const existing = await fetchEvents();
const maxSerial = existing.reduce((m, e) => Math.max(m, Number(e.serialNo || 0)), 0);
if (maxSerial > (state.lastSerial || 0)) {
  state.lastSerial = maxSerial;
  save(state);
  console.log(`Boshlang'ich serial: ${maxSerial} (eski xabarlar yuborilmaydi)`);
}

for (;;) {
  try {
    const events = await fetchEvents();
    const st = load();
    for (const ev of events.reverse()) {
      const serial = Number(ev.serialNo || 0);
      if (!serial || serial <= (st.lastSerial || 0)) continue;
      if (!isFaceEvent(ev)) {
        if (serial > st.lastSerial) st.lastSerial = serial;
        continue;
      }
      st.lastSerial = serial;
      save(st);
      await tg(`📥 <b>${name(ev)}</b> keldi — <b>${time(ev)}</b>`);
      console.log(`${name(ev)} keldi ${time(ev)}`);
    }
    save(st);
  } catch (e) {
    console.warn(e.message);
  }
  await new Promise((r) => setTimeout(r, POLL * 1000));
}
