/** Hodimlar smena jadvali */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadEmployees } from "../lib/attendance-core.mjs";
import { listAllShifts } from "../lib/shifts.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const employees = loadEmployees(path.join(root, "data"));

console.log("=== HODIMLAR ISH VAQTI (12 soat smena) ===\n");
for (const r of listAllShifts(employees)) {
  console.log(`${r.name.padEnd(24)} ${r.shift}`);
}
