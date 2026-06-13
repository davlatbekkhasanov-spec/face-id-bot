/**
 * Railway ONLY — terminal webhook → admin lichka.
 * Local ISHGA-TUSHIR.bat ISHLATMAYDI.
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { loadEmployees } from "./lib/attendance-core.mjs";
import { initDb } from "./lib/db.mjs";
import { handleFaceEvent } from "./lib/process-event.mjs";
import { getPollWatermarkMs } from "./lib/poll-watermark.mjs";
import { listAllShifts } from "./lib/shifts.mjs";
import { bootstrapPersistence, persistenceStatusLine, resolveDataDir } from "./lib/persist-data.mjs";
import { startTelegramPoll } from "./lib/telegram-poll.mjs";
import { parseAdminIds } from "./lib/access.mjs";

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
const NOTIFY_CHAT_ID = String(
  process.env.NOTIFY_CHAT_ID || process.env.ADMIN_IDS?.split(/[,;]/)[0] || "1432810519"
).trim();
const WEBHOOK_PATH = (process.env.WEBHOOK_PATH || "/webhook/hikvision").trim();
const PORT = Number(process.env.PORT || 8080);

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN yo'q");
  process.exit(1);
}
if (!NOTIFY_CHAT_ID) {
  console.error("NOTIFY_CHAT_ID yo'q");
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });

function copyDirFiles(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const f of fs.readdirSync(srcDir)) {
    if (!/\.(jpe?g|png)$/i.test(f)) continue;
    const dest = path.join(destDir, f);
    if (!fs.existsSync(dest)) fs.copyFileSync(path.join(srcDir, f), dest);
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
    for (const f of ["shiftStart", "shiftHours", "firstName", "lastName", "deviceName", "telegramId", "photoFile", "noShift"]) {
      if (s[f] != null) dest.staff[key][f] = s[f];
    }
    delete dest.staff[key].shiftVariable;
    if (dest.staff[key].noShift) {
      delete dest.staff[key].shiftStart;
      delete dest.staff[key].shiftHours;
    }
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
  copyDirFiles(path.join(assets, "faces"), path.join(DATA_DIR, "faces"));
  copyDirFiles(path.join(BUNDLED_DIR, "faces"), path.join(DATA_DIR, "faces"));
}

const persist = bootstrapPersistence(DATA_DIR, BUNDLED_DIR);
ensureBundledData();
initDb(DATA_DIR);
const employees = loadEmployees(DATA_DIR);

const ctx = {
  botToken: BOT_TOKEN,
  dataDir: DATA_DIR,
  notifyChatId: NOTIFY_CHAT_ID,
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
      `face-id-bot ok v1.8.2 data-manage\n${persistenceStatusLine(DATA_DIR, persist.dbPath)}`
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
        if (ok) console.log("Webhook → DM:", ev.name || ev.employeeNoString);
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
  console.log(`Railway v1.6.3 | DM=${NOTIFY_CHAT_ID} | ${persistenceStatusLine(DATA_DIR, persist.dbPath)}`);
});
