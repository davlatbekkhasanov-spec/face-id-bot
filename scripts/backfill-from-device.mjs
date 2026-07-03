#!/usr/bin/env node
/**
 * Face ID terminal xotirasidan tabel tiklash (Telegram export shart emas).
 *
 * Ofis tarmog'ida (192.168.110.x):
 *   node scripts/backfill-from-device.mjs --from 2026-06-18 --to 2026-07-03
 *   node scripts/backfill-from-device.mjs --from 2026-06-18 --to 2026-07-03 --staff 1
 *   node scripts/backfill-from-device.mjs --from 2026-06-18 --to 2026-07-03 --out device-backfill.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadEmployees } from "../lib/attendance-core.mjs";
import { initAttendanceLogSchema } from "../lib/attendance-log.mjs";
import { initDb } from "../lib/db.mjs";
import {
  backfillFromDevice,
  exportDeviceBackfillPayload,
} from "../lib/device-backfill.mjs";
import { resolveDataDir } from "../lib/persist-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim();
  }
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const fromKey = arg("--from");
const toKey = arg("--to") || fromKey;
const staffFilter = arg("--staff");
const outFile = arg("--out");
const dryRun = process.argv.includes("--dry-run");

if (!fromKey || !toKey) {
  console.error("Ishlatish: node scripts/backfill-from-device.mjs --from YYYY-MM-DD --to YYYY-MM-DD");
  process.exit(1);
}

const ip = (process.env.FACE_DEVICE_IP || "192.168.110.224").trim();
const user = (process.env.FACE_DEVICE_USER || "admin").trim();
const pass = (process.env.FACE_DEVICE_PASSWORD || "").trim();
if (!pass) {
  console.error("FACE_DEVICE_PASSWORD .env da yo'q");
  process.exit(1);
}

const dataDir = resolveDataDir(path.join(root, "data"));
initDb(dataDir);
initAttendanceLogSchema();
const employees = loadEmployees(dataDir);

console.log(`Terminal: ${ip} | ${fromKey} → ${toKey}${staffFilter ? ` | staff=${staffFilter}` : ""}`);

try {
  const result = await backfillFromDevice({
    ip,
    user,
    pass,
    fromKey,
    toKey,
    employees,
    staffFilter,
    dryRun,
  });
  console.log(`\nTayyor: ${result.imported} kunlik yozuv (${result.daysOk}/${result.days} kun)`);

  if (outFile) {
    const abs = path.resolve(outFile);
    fs.writeFileSync(abs, exportDeviceBackfillPayload(result));
    console.log(`Saqlandi: ${abs}`);
    console.log("Bu faylni botga yuboring (ofisdan chiqib ketgan bo'lsangiz ham ishlaydi).");
  } else if (!dryRun) {
    console.log("\n📋 Endi botda Tabel ni qayta oling.");
  }
} catch (e) {
  console.error("Xato:", e.message);
  console.error("\nKompyuteringiz ofis tarmog'ida (192.168.110.x) ekanligini tekshiring.");
  process.exit(1);
}
