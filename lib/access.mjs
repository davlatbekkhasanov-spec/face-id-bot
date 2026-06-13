import fs from "fs";
import path from "path";

export function staffTelegramIds(employees) {
  const ids = new Set();
  for (const s of Object.values(employees.staff || {})) {
    if (s.telegramId) ids.add(Number(s.telegramId));
  }
  return ids;
}

export function isRegisteredEmployee(uid, employees) {
  if (!uid) return false;
  return staffTelegramIds(employees).has(Number(uid));
}

export function canUseBot(uid, employees, adminIds) {
  if (adminIds.has(Number(uid))) return true;
  return isRegisteredEmployee(uid, employees);
}

export function staffKeyByTelegramId(uid, employees) {
  for (const [key, s] of Object.entries(employees.staff || {})) {
    if (Number(s.telegramId) === Number(uid)) return key;
  }
  return null;
}

export function parseAdminIds() {
  const ids = new Set();
  for (const raw of [process.env.NOTIFY_CHAT_ID, process.env.ADMIN_IDS]) {
    if (!raw) continue;
    for (const p of String(raw).split(/[,;\s]+/)) {
      const n = Number(p.trim());
      if (n) ids.add(n);
    }
  }
  return ids;
}
