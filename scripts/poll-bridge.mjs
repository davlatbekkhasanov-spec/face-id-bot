/**
 * Do'kon tarmog'ida ishlaydi: terminalni poll qilib Telegramga yuboradi.
 * Railway webhook ishlamasa — shu skriptni doimiy ishga tushiring.
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
const GROUP =
  process.env.NOTIFY_CHAT_ID ||
  process.env.ADMIN_IDS?.split(/[,;]/)[0] ||
  process.env.GROUP_CHAT_ID;
const FACE_IP = process.env.FACE_DEVICE_IP || "192.168.0.28";
const FACE_USER = process.env.FACE_DEVICE_USER || "admin";
const FACE_PASS = process.env.FACE_DEVICE_PASSWORD;
const POLL = Number(process.env.POLL_INTERVAL_SEC || 20);
const TZ = process.env.FACE_TIMEZONE || "+05:00";
const STATE = path.join(root, "data", "bridge-state.json");

fs.mkdirSync(path.dirname(STATE), { recursive: true });
const load = () => {
  try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return { seen: {} }; }
};
const save = (s) => fs.writeFileSync(STATE, JSON.stringify(s));

async function tg(text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: GROUP, text, parse_mode: "HTML" }),
  });
}

function today() {
  const d = new Date();
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0");
  return { start: `${y}-${m}-${day}T00:00:00${TZ}`, end: `${y}-${m}-${day}T23:59:59${TZ}` };
}

function isIn(ev) {
  const t = String(ev.attendanceStatus || ev.label || ev.minor || "").toLowerCase();
  return !(t.includes("out") || t.includes("checkout") || t === "2");
}

function name(ev) {
  return String(ev.name || ev.employeeNoString || ev.employeeNo || "?");
}

function time(ev) {
  const t = String(ev.time || "");
  const m = t.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : t.slice(11, 16) || "—";
}

console.log(`Poll bridge: ${FACE_IP} -> Telegram ${GROUP}`);

for (;;) {
  try {
    const { start, end } = today();
    const client = new DigestFetch(FACE_USER, FACE_PASS);
    const res = await client.fetch(`http://${FACE_IP}/ISAPI/AccessControl/AcsEvent?format=json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        AcsEventCond: { searchID: "1", searchResultPosition: 0, maxResults: 30, major: 0, minor: 0, startTime: start, endTime: end, timeReverseOrder: true },
      }),
    });
    const j = JSON.parse(await res.text());
    const list = j?.AcsEvent?.InfoList;
    const events = list ? (Array.isArray(list) ? list : [list]) : [];
    const state = load();
    for (const ev of events.reverse()) {
      const k = `${ev.serialNo}_${name(ev)}_${ev.time}`;
      if (state.seen[k]) continue;
      state.seen[k] = 1;
      const icon = isIn(ev) ? "📥" : "📤";
      const act = isIn(ev) ? "keldi" : "ketdi";
      await tg(`${icon} <b>${name(ev)}</b> ${act} — <b>${time(ev)}</b>`);
      console.log(`${name(ev)} ${act} ${time(ev)}`);
    }
    save(state);
  } catch (e) {
    console.warn(e.message);
  }
  await new Promise((r) => setTimeout(r, POLL * 1000));
}
