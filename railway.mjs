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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim();
  }
}

const DATA_DIR = process.env.DATABASE_DIR || process.env.DATA_DIR || path.join(__dirname, "data");
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
const bundled = path.join(__dirname, "data", "employees.json");
const destEmp = path.join(DATA_DIR, "employees.json");
if (!fs.existsSync(destEmp) && fs.existsSync(bundled)) {
  fs.copyFileSync(bundled, destEmp);
}

initDb(DATA_DIR);
const employees = loadEmployees(DATA_DIR);

const ctx = {
  botToken: BOT_TOKEN,
  dataDir: DATA_DIR,
  notifyChatId: NOTIFY_CHAT_ID,
  pollWatermarkMs: getPollWatermarkMs(),
};

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
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("face-id-bot ok v1.3 dm-only");
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
  console.log(`Railway v1.3 | webhook ${WEBHOOK_PATH} | DM=${NOTIFY_CHAT_ID}`);
});
