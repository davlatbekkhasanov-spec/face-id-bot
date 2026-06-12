/**
 * Barcha davomat statistikasini 0 ga tushirish + eski hodisalarni e'tiborsiz qoldirish
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import DigestFetch from "digest-fetch";
import { initDb, resetAllAttendance } from "../lib/db.mjs";
import { setPollWatermarkMs, markSerialsProcessed } from "../lib/poll-watermark.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");

for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

initDb(process.env.DATABASE_DIR || dataDir);
resetAllAttendance();
setPollWatermarkMs(Date.now());

const ip = process.env.FACE_DEVICE_IP || "192.168.0.28";
const pass = process.env.FACE_DEVICE_PASSWORD;
const tz = process.env.FACE_TIMEZONE || "+05:00";

if (pass) {
  try {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const start = `${y}-${m}-${day}T00:00:00${tz}`;
    const end = `${y}-${m}-${day}T23:59:59${tz}`;
    const client = new DigestFetch(process.env.FACE_DEVICE_USER || "admin", pass);
    const res = await client.fetch(`http://${ip}/ISAPI/AccessControl/AcsEvent?format=json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        AcsEventCond: {
          searchID: "1",
          searchResultPosition: 0,
          maxResults: 500,
          major: 0,
          minor: 0,
          startTime: start,
          endTime: end,
          timeReverseOrder: true,
        },
      }),
    });
    const list = JSON.parse(await res.text())?.AcsEvent?.InfoList;
    const events = list ? (Array.isArray(list) ? list : [list]) : [];
    markSerialsProcessed(events);
    console.log(`Eski hodisalar belgilandi: ${events.length} ta`);
  } catch (e) {
    console.warn("Terminal serial belgilash:", e.message);
  }
}

for (const f of ["last-card.json", "bridge-state.json"]) {
  const p = path.join(process.env.DATABASE_DIR || dataDir, f);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

console.log("✅ Hamma davomat ma'lumotlari o'chirildi (0 dan boshlandi).");
