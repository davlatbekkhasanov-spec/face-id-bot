import {
  backfillFromTelegramExport,
  rebuildDailyStatsFromLog,
  restoreAllAttendanceData,
  syncStaffStateToDailyStats,
} from "./attendance-log.mjs";

export {
  backfillFromTelegramExport,
  rebuildDailyStatsFromLog,
  restoreAllAttendanceData,
  syncStaffStateToDailyStats,
};

export function formatRestoreReport(result, extra = {}) {
  const lines = [
    "✅ <b>Ma'lumot tiklandi</b>",
    `📦 Jurnal: <b>${result.fromLog}</b> kun`,
    `👤 Holat (staff_state): <b>${result.fromState}</b> yozuv`,
  ];
  if (extra.imported != null) {
    lines.push(`📥 Telegram export: <b>${extra.imported}</b> kun tiklandi`);
    if (extra.skipped) lines.push(`⏭ O'tkazildi: ${extra.skipped}`);
  }
  lines.push("\n📋 Endi Tabel ni qayta yuklang.");
  return lines.join("\n");
}
