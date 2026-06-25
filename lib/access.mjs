/** Guruhda yozsa ham xabar yuborilmaydigan / botdan foydalana oladigan ID lar */
const BUILTIN_ALLOWED_IDS = new Set([
  1432810519, // Davlatbek admin
  2624538,
  5632359532,
  1386544385,
  7844168817, // Ergashev Ozodbek
]);

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

export function parseAllowedIds() {
  const ids = new Set(BUILTIN_ALLOWED_IDS);
  for (const raw of [process.env.ALLOWED_TELEGRAM_IDS, process.env.ADMIN_IDS, process.env.NOTIFY_CHAT_ID]) {
    if (!raw) continue;
    for (const p of String(raw).split(/[,;\s]+/)) {
      const n = Number(p.trim());
      if (n) ids.add(n);
    }
  }
  return ids;
}

export function canUseBot(uid, employees, adminIds) {
  const id = Number(uid);
  if (!id) return false;
  if (adminIds.has(id)) return true;
  if (parseAllowedIds().has(id)) return true;
  return isRegisteredEmployee(uid, employees);
}

export function isGroupChat(msg) {
  const t = msg?.chat?.type;
  return t === "group" || t === "supergroup";
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
