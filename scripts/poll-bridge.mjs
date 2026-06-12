/**
 * Do'kon tarmog'i: keldi/ketdi, 12 soat, 20s cooldown.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import DigestFetch from "digest-fetch";
import {
  isFaceEvent,
  loadEmployees,
  buildMessage,
} from "../lib/attendance.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");

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
const STATE = path.join(dataDir, "bridge-state.json");
const employees = loadEmployees(dataDir);

fs.mkdirSync(dataDir, { recursive: true });
const load = () => {
  try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return { lastSerial: 0, staff: {} }; }
};
const save = (s) => fs.writeFileSync(STATE, JSON.stringify(s, null, 2));

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

console.log(`Poll bridge: ${FACE_IP} | keldi/ketdi | 12soat | 20s`);

const state = load();
const existing = await fetchEvents();
const maxSerial = existing.reduce((m, e) => Math.max(m, Number(e.serialNo || 0)), 0);
if (maxSerial > (state.lastSerial || 0)) {
  state.lastSerial = maxSerial;
  save(state);
  console.log(`Skip eski hodisalar <= serial ${maxSerial}`);
}

for (;;) {
  try {
    const events = await fetchEvents();
    const st = load();
    for (const ev of events.reverse()) {
      const serial = Number(ev.serialNo || 0);
      if (!serial || serial <= (st.lastSerial || 0)) continue;
      if (!isFaceEvent(ev)) {
        st.lastSerial = Math.max(st.lastSerial || 0, serial);
        continue;
      }
      const msg = buildMessage(ev, st, employees);
      st.lastSerial = serial;
      save(st);
      if (!msg) continue;
      await tg(msg);
      console.log(msg.replace(/<[^>]+>/g, ""));
    }
    save(st);
  } catch (e) {
    console.warn(e.message);
  }
  await new Promise((r) => setTimeout(r, POLL * 1000));
}
