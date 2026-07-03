#!/usr/bin/env node
/**
 * Kunlik ma'lumotlarni tiklash:
 *   node scripts/backfill-attendance.mjs
 *   node scripts/backfill-attendance.mjs --export path/to/result.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadEmployees } from "../lib/attendance-core.mjs";
import { initDb } from "../lib/db.mjs";
import { resolveDataDir } from "../lib/persist-data.mjs";
import {
  backfillFromTelegramExport,
  initAttendanceLogSchema,
  restoreAllAttendanceData,
} from "../lib/attendance-log.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = resolveDataDir(path.join(__dirname, "..", "data"));

initDb(dataDir);
initAttendanceLogSchema();
const employees = loadEmployees(dataDir);

const exportArg = process.argv.find((a) => a.startsWith("--export="));
const exportPath = exportArg?.slice("--export=".length) || process.argv[process.argv.indexOf("--export") + 1];

let imported = null;
if (exportPath) {
  const abs = path.resolve(exportPath);
  if (!fs.existsSync(abs)) {
    console.error("Fayl topilmadi:", abs);
    process.exit(1);
  }
  const parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
  imported = backfillFromTelegramExport(parsed, employees);
  console.log("Telegram export:", imported);
}

const restored = restoreAllAttendanceData(employees);
console.log("Tiklandi:", restored);
if (imported) console.log("Import:", imported);
