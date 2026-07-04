/**
 * Railway ONLY — keldi/ketdi (ATTENDANCE_TO_GROUP); hisobot → admin lichka.
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { loadEmployees } from "./lib/attendance-core.mjs";
import { initDb, syncStaffNamesFromEmployees } from "./lib/db.mjs";
import { initAttendanceLogSchema, restoreAllAttendanceData } from "./lib/attendance-log.mjs";
import { handleFaceEvent } from "./lib/process-event.mjs";
import { getPollWatermarkMs } from "./lib/poll-watermark.mjs";
import { listAllShifts } from "./lib/shifts.mjs";
import { bootstrapPersistence, persistenceStatusLine, resolveDataDir } from "./lib/persist-data.mjs";
import { startTelegramPoll } from "./lib/telegram-poll.mjs";
import { parseAdminIds } from "./lib/access.mjs";
import { parseAdminDmId, parseAttendanceGroupIds, attendanceRouteLabel } from "./lib/chats.mjs";
import { syncTodayPointsToHub, hubConfigured, hubStatusLabel } from "./lib/yordamchi-push.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim();
  }
}

const BUNDLED_DIR = path.join(__dirname, "data");
const DATA_DIR = resolveDataDir(BUNDLED_DIR);
const BOT_TOKEN = (process.env.BOT_TOKEN || "").trim();
const GROUP_CHAT_IDS = parseAttendanceGroupIds();
const ADMIN_DM_ID = parseAdminDmId();
const WEBHOOK_PATH = (process.env.WEBHOOK_PATH || "/webhook/hikvision").trim();
const PORT = Number(process.env.PORT || 8080);

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN yo'q");
  process.exit(1);
}
if (!GROUP_CHAT_IDS.length) {
  console.error("GROUP_ID yo'q (keldi/ketdi guruhga ketmaydi)");
  process.exit(1);
}
if (!ADMIN_DM_ID) {
  console.error("ADMIN_IDS yoki NOTIFY_CHAT_ID yo'q");
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });

function copyDirFiles(srcDir, destDir, { overwrite = false } = {}) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const f of fs.readdirSync(srcDir)) {
    if (!/\.(jpe?g|png)$/i.test(f)) continue;
    const src = path.join(srcDir, f);
    const dest = path.join(destDir, f);
    if (!overwrite && fs.existsSync(dest)) continue;
    fs.copyFileSync(src, dest);
  }
}

function mergeBundledEmployees() {
  const bundled = path.join(BUNDLED_DIR, "employees.json");
  const destEmp = path.join(DATA_DIR, "employees.json");
  if (!fs.existsSync(bundled)) return;
  const src = JSON.parse(fs.readFileSync(bundled, "utf8"));
  let dest = { staff: {} };
  if (fs.existsSync(destEmp)) {
    try {
      dest = JSON.parse(fs.readFileSync(destEmp, "utf8"));
    } catch { /* yangi */ }
  }
  dest.staff ||= {};
  for (const [key, s] of Object.entries(src.staff || {})) {
    dest.staff[key] = { ...(dest.staff[key] || {}), ...s };
    for (const f of ["shiftStart", "shiftHours", "firstName", "lastName", "deviceName", "telegramId", "photoFile", "attendanceGroupId", "attendanceGroupIds"]) {
      if (s[f] != null) dest.staff[key][f] = s[f];
    }
    if (s.noShift === true) {
      dest.staff[key].noShift = true;
      delete dest.staff[key].shiftStart;
      delete dest.staff[key].shiftHours;
    } else {
      delete dest.staff[key].noShift;
    }
    delete dest.staff[key].shiftVariable;
  }
  fs.writeFileSync(destEmp, JSON.stringify(dest, null, 2));
}

function ensureBundledData() {
  const assets = path.join(__dirname, "assets");
  const destEmp = path.join(DATA_DIR, "employees.json");
  if (!fs.existsSync(destEmp)) {
    for (const src of [path.join(BUNDLED_DIR, "employees.json"), path.join(assets, "employees.json")]) {
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, destEmp);
        break;
      }
    }
  }
  mergeBundledEmployees();
  copyDirFiles(path.join(assets, "faces"), path.join(DATA_DIR, "faces"), { overwrite: true });
  copyDirFiles(path.join(BUNDLED_DIR, "faces"), path.join(DATA_DIR, "faces"), { overwrite: true });
}

const persist = bootstrapPersistence(DATA_DIR, BUNDLED_DIR);
ensureBundledData();
initDb(DATA_DIR);
initAttendanceLogSchema();
const employees = loadEmployees(DATA_DIR);
const nameSync = syncStaffNamesFromEmployees(employees);
if (nameSync) console.log(`Staff names synced in DB: ${nameSync} row(s)`);

try {
  const restored = restoreAllAttendanceData(employees);
  if (restored.fromLog || restored.fromState) {
    console.log(`Attendance restore: log=${restored.fromLog} state=${restored.fromState}`);
  }
} catch (e) {
  console.warn("Attendance restore:", e.message);
}

const ctx = {
  botToken: BOT_TOKEN,
  dataDir: DATA_DIR,
  groupChatId: GROUP_CHAT_IDS[0],
  groupChatIds: GROUP_CHAT_IDS,
  adminChatId: ADMIN_DM_ID,
  pollWatermarkMs: getPollWatermarkMs(),
  photoDirs: [path.join(__dirname, "assets"), path.join(__dirname, "data")],
  employees,
  adminIds: parseAdminIds(),
};

const enablePoll = process.env.TELEGRAM_POLL !== "0";
if (enablePoll) {
  startTelegramPoll(ctx);
} else {
  console.log("Telegram poll o'chirilgan (TELEGRAM_POLL=0)");
}

syncTodayPointsToHub(employees)
  .then((r) => {
    if (!hubConfigured()) {
      console.warn("YORDAMCHI_HUB_SECRET yo'q — yordamchi reytingga ball yuborilmaydi");
      return;
    }
    if (r.pushed) console.log(`Hub sync: ${r.pushed} hodim`);
  })
  .catch((e) => console.warn("Hub sync:", e.message));

function parseBody(raw) {
  if (!raw) return null;
  if (raw.includes("{")) {
    try {
      const j = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
      const e = j.AccessControllerEvent || j.AcsEvent || j;
      return {
        name: e.employeeName || e.name,
        employeeNoString: e.employeeNoString || e.employeeNo,
        time: e.dateTime || e.time,
        minor: e.minor || e.subEventType,
        serialNo: e.serialNo,
      };
    } catch { /* xml */ }
  }
  const tag = (t) => {
    const m = raw.match(new RegExp(`<${t}[^>]*>([^<]*)</${t}>`, "i"));
    return m ? m[1].trim() : "";
  };
  const name = tag("employeeName") || tag("name");
  if (!name) return null;
  return {
    name,
    employeeNoString: tag("employeeNoString") || tag("employeeNo"),
    time: tag("dateTime") || tag("time"),
    minor: tag("minor"),
    serialNo: tag("serialNo"),
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end(
      `face-id-bot ok v1.16.10\nkeldi/ketdi: ${attendanceRouteLabel(ctx)}\n${hubStatusLabel()}\n${persistenceStatusLine(DATA_DIR, persist.dbPath)}`
    );
  }
  if (req.method === "GET" && req.url === "/shifts") {
    const rows = listAllShifts(employees);
    const lines = rows.map((r) => `${r.name.padEnd(22)} | ${r.shift}`);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end(["=== HODIMLAR SMENASI (12 soat) ===", ...lines].join("\n"));
  }
  if (req.method === "POST" && req.url === WEBHOOK_PATH) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8");
    res.writeHead(200);
    res.end("OK");
    try {
      const ev = parseBody(raw);
      if (ev) {
        const ok = await handleFaceEvent(ev, employees, ctx);
        if (ok) console.log("Webhook →", attendanceRouteLabel(ctx), ev.name || ev.employeeNoString);
      }
    } catch (e) {
      console.warn("webhook:", e.message);
    }
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Railway v1.16.10 | keldi/ketdi: ${attendanceRouteLabel(ctx)} | ${hubStatusLabel()} | ${persistenceStatusLine(DATA_DIR, persist.dbPath)}`
  );
});
