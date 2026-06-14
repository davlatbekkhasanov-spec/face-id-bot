/** Telegram chat ID lar — keldi/ketdi guruh yoki lichka, hisobot admin lichka */

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

/** ATTENDANCE_TO_GROUP=1 → guruh; 0 (default test) → admin lichka */
export function attendanceToGroup() {
  const v = String(process.env.ATTENDANCE_TO_GROUP ?? "0")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function resolveAttendanceChatId(ctx) {
  if (attendanceToGroup() && ctx?.groupChatId) return ctx.groupChatId;
  if (ctx?.adminChatId) return ctx.adminChatId;
  return ctx?.groupChatId;
}

export function attendanceRouteLabel(ctx) {
  if (attendanceToGroup()) return `guruh=${ctx?.groupChatId || "?"}`;
  return `lichka=${ctx?.adminChatId || "?"}`;
}
