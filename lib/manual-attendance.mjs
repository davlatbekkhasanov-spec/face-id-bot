import { buildManualAttendanceCard } from "./attendance.mjs";

/** Admin: keldi / ketdi (hozir yoki HH:MM) */
export function buildManualCard(staffKey, employees, intent, clockHHMM = null) {
  return buildManualAttendanceCard(staffKey, employees, intent, clockHHMM);
}
