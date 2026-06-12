/**
 * Do'kon LAN: terminal → SQLite DB → Telegram guruh (foto + statistika).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import DigestFetch from "digest-fetch";
import { loadEmployees } from "../lib/attendance-core.mjs";
import { initDb } from "../lib/db.mjs";
import { handleFaceEvent } from "../lib/process-event.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");

for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

initDb(process.env.DATABASE_DIR || dataDir);
const employees = loadEmployees(dataDir);

const BOT_TOKEN = process.env.BOT_TOKEN;
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;
const NOTIFY_CHAT_ID = process.env.NOTIFY_CHAT_ID;
const ATTENDANCE_TO_GROUP = String(process.env.ATTENDANCE_TO_GROUP ?? "1") !== "0";
const ATTENDANCE_TO_DM = String(process.env.ATTENDANCE_TO_DM ?? "0") === "1";
const FACE_IP = process.env.FACE_DEVICE_IP || "192.168.0.28";
const FACE_USER = process.env.FACE_DEVICE_USER || "admin";
const FACE_PASS = process.env.FACE_DEVICE_PASSWORD;
const POLL = Math.max(5, Number(process.env.POLL_INTERVAL_SEC || 5));
const TZ = process.env.FACE_TIMEZONE || "+05:00";

const ctx = {
  botToken: BOT_TOKEN,
  dataDir: process.env.DATABASE_DIR || dataDir,
  groupChatId: ATTENDANCE_TO_GROUP ? GROUP_CHAT_ID : null,
  notifyChatId: ATTENDANCE_TO_DM ? NOTIFY_CHAT_ID : null,
};

function today() {
  const d = new Date();
  const y = d.getFullYear(),
    m = String(d.getMonth() + 1).padStart(2, "0"),
    day = String(d.getDate()).padStart(2, "0");
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
        searchID: "1",
        searchResultPosition: 0,
        maxResults: 40,
        major: 0,
        minor: 0,
        startTime: start,
        endTime: end,
        timeReverseOrder: true,
      },
    }),
  });
  const list = JSON.parse(await res.text())?.AcsEvent?.InfoList;
  return list ? (Array.isArray(list) ? list : [list]) : [];
}

console.log(`Poll bridge → guruh ${GROUP_CHAT_ID} | poll=${POLL}s`);

for (;;) {
  try {
    const events = await fetchEvents();
    for (const ev of events.reverse()) {
      await handleFaceEvent(ev, employees, ctx);
    }
  } catch (e) {
    console.warn(e.message);
  }
  await new Promise((r) => setTimeout(r, POLL * 1000));
}
