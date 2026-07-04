/** Tabel ma'lumotlarini tekshirish — faqat haqiqiy ma'lumot */

import { dayIsComplete } from "./timesheet-data.mjs";

function msToClock(ms) {
  if (!ms || ms <= 0) return "0:00";
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** @returns {{ ok: boolean, issues: string[], summary: object }} */
export function auditTimesheetData(data) {
  const issues = [];
  let workDays = 0;
  let realTimeDays = 0;
  let partialTimeDays = 0;
  let workedOnlyDays = 0;

  for (const st of data.staff) {
    let sumWorked = 0;
    let sumMinus = 0;
    let sumPlus = 0;
    let countDays = 0;

    for (const dk of data.days) {
      const day = st.days.get(dk);
      if (!day?.workedMs && !day?.hasRealIn && !day?.hasRealOut) continue;

      if (dayIsComplete(day)) {
        countDays += 1;
        sumWorked += day.workedMs || 0;
        const minus = day.minusMs ?? day.debtMs ?? 0;
        sumPlus += day.overtimeMs || 0;
        sumMinus += minus;
        realTimeDays += 1;

        const span = day.lastOut - day.firstIn;
        if (day.workedMs > span + 60_000) {
          issues.push(
            `${st.name} ${dk}: ish (${msToClock(day.workedMs)}) > keldi-ketdi (${msToClock(span)})`
          );
        }
      } else if (day.hasRealIn || day.hasRealOut) {
        partialTimeDays += 1;
        issues.push(`${st.name} ${dk}: keldi yoki ketdi yo'q — «📝 Kun kiritish»`);
      } else if (day.workedMs > 0) {
        workedOnlyDays += 1;
        issues.push(`${st.name} ${dk}: faqat ish soati bor, keldi/ketdi yo'q`);
      }

      if (day?.timesInferred) {
        issues.push(`${st.name} ${dk}: TAXMINIY vaqt — taqiqlangan`);
      }
    }

    workDays += countDays;

    if (countDays > 0 && Math.abs(sumWorked - st.totalWorkedMs) > 60_000) {
      issues.push(
        `${st.name}: jami ish mos emas (${msToClock(sumWorked)} ≠ ${msToClock(st.totalWorkedMs)})`
      );
    }

    const totalMinus = st.totalMinusMs ?? 0;
    if (Math.abs(sumMinus - totalMinus) > 60_000) {
      issues.push(`${st.name}: jami minus mos emas`);
    }

    if (Math.abs(sumPlus - (st.totalOvertimeMs || 0)) > 60_000) {
      issues.push(`${st.name}: jami plus mos emas`);
    }

    const balance = (st.totalOvertimeMs || 0) - totalMinus;
    if (Math.abs(balance - (st.totalBalanceMs ?? balance)) > 60_000) {
      issues.push(`${st.name}: balans jami noto'g'ri`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    summary: {
      staff: data.staff.length,
      workDays,
      realTimeDays,
      partialTimeDays,
      workedOnlyDays,
    },
  };
}

export function auditCaption(audit) {
  const s = audit.summary;
  let text =
    `🔍 <b>Audit</b>\n` +
    `✅ Haqiqiy keldi+ketdi: <b>${s.realTimeDays}</b> kun\n`;
  if (s.partialTimeDays) text += `⚠️ To'liq emas: <b>${s.partialTimeDays}</b> kun\n`;
  if (s.workedOnlyDays) text += `⚠️ Faqat ish soati: <b>${s.workedOnlyDays}</b> kun\n`;
  if (!audit.ok) {
    text += `\n❌ <b>${audit.issues.length}</b> muammo:\n`;
    text += audit.issues.slice(0, 8).map((x) => `• ${x}`).join("\n");
    if (audit.issues.length > 8) text += `\n… +${audit.issues.length - 8}`;
  } else {
    text += `\n✅ Barcha hisob-kitob mos`;
  }
  return text;
}
