/** Telegram chat ID lar — keldi/ketdi guruh, hisobot admin lichka */

export function parseGroupChatId() {
  return String(process.env.GROUP_ID || process.env.GROUP_CHAT_ID || "").trim();
}

export function parseAdminDmId() {
  const raw =
    process.env.ADMIN_DM_ID ||
    process.env.NOTIFY_CHAT_ID ||
    process.env.ADMIN_IDS?.split(/[,;\s]+/)[0] ||
    "";
  return String(raw).trim();
}
