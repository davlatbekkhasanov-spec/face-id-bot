/** Telegram chat ID lar — keldi/ketdi guruh yoki lichka, hisobot admin lichka */

export function parseGroupChatId() {
  return String(process.env.GROUP_ID || process.env.GROUP_CHAT_ID || "").trim();
}

/** Qo'shimcha guruhlar — vergul bilan: EXTRA_GROUP_IDS=-5351426801 */
export function parseExtraGroupIds() {
  const raw = String(process.env.EXTRA_GROUP_IDS || process.env.GROUP_IDS || "").trim();
  if (!raw) return [];
  return raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
}

/** Barcha keldi/ketdi guruhlari (asosiy + qo'shimcha, takrorlarsiz) */
export function parseAttendanceGroupIds() {
  const ids = [];
  const seen = new Set();
  const add = (id) => {
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  };
  add(parseGroupChatId());
  for (const id of parseExtraGroupIds()) add(id);
  return ids;
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

function attendanceGroupIdsFromCtx(ctx) {
  if (ctx?.groupChatIds?.length) return ctx.groupChatIds;
  if (ctx?.groupChatId) return [ctx.groupChatId];
  return [];
}

export function resolveAttendanceChatIds(ctx) {
  if (attendanceToGroup()) {
    const groups = attendanceGroupIdsFromCtx(ctx);
    if (groups.length) return groups;
  }
  if (ctx?.adminChatId) return [ctx.adminChatId];
  const fallback = attendanceGroupIdsFromCtx(ctx);
  return fallback.length ? fallback : [];
}

export function resolveAttendanceChatId(ctx) {
  return resolveAttendanceChatIds(ctx)[0] || null;
}

export function attendanceRouteLabel(ctx) {
  if (attendanceToGroup()) {
    const groups = attendanceGroupIdsFromCtx(ctx);
    return `guruhlar=${groups.join(",") || "?"}`;
  }
  return `lichka=${ctx?.adminChatId || "?"}`;
}
