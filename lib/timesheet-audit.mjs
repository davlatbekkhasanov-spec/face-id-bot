/** Tabel ma'lumotlarini tekshirish — hisob-kitob xatolari */

function msToClock(ms) {
  if (!ms || ms <= 0) return "0:00";
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** @returns {{ ok: boolean, issues: string[], summary: object }} */
export function auditTimesheetData(data) {
  const issues = [];
  let workDays = 0;
  let inferredDays = 0;
  let realTimeDays = 0;

  for (const st of data.staff) {
    let sumWorked = 0;
    let sumMinus = 0;
    let sumPlus = 0;
    let countDays = 0;

    for (const dk of data.days) {
      const day = st.days.get(dk);
      if (!day?.workedMs && !day?.firstIn) continue;

      countDays += 1;
      sumWorked += day.workedMs || 0;
      const minus = day.minusMs ?? (day.lateMs || 0) + (day.debtMs || 0);
      sumPlus += day.overtimeMs || 0;
      sumMinus += minus;

      const bal = (day.overtimeMs || 0) - minus;
      const expectedBal = (day.overtimeMs || 0) - (day.lateMs || 0) - (day.debtMs || 0);
      if (bal !== expectedBal) {
        issues.push(`${st.name} ${dk}: balans noto'g'ri`);
      }

      if (day.firstIn && day.lastOut) {
        const span = day.lastOut - day.firstIn;
        if (day.workedMs > span + 120_000) {
          issues.push(`${st.name} ${dk}: ish vaqti (${msToClock(day.workedMs)}) > keldi-ketdi oralig'i (${msToClock(span)})`);
        }
        if (day.hasRealIn && day.hasRealOut) realTimeDays += 1;
        else if (day.timesInferred) inferredDays += 1;
      } else if (day.timesInferred) {
        inferredDays += 1;
      }

      const normMs = (st.shiftHours || 12) * 3_600_000;
      if (day.debtMs > 0 && day.workedMs + day.debtMs < normMs - 60_000) {
        issues.push(`${st.name} ${dk}: qarz hisobi shubhali (ish ${msToClock(day.workedMs)}, qarz ${msToClock(day.debtMs)})`);
      }
    }

    workDays += countDays;

    if (countDays !== st.totalWorkedMs && countDays === 0 && st.totalWorkedMs === 0) {
      // ok empty
    } else if (Math.abs(sumWorked - st.totalWorkedMs) > 60_000) {
      issues.push(
        `${st.name}: jami ish mos emas (kunlar ${msToClock(sumWorked)} ≠ ${msToClock(st.totalWorkedMs)})`
      );
    }

    const totalMinus = st.totalMinusMs ?? (st.totalLateMs || 0) + (st.totalDebtMs || 0);
    if (Math.abs(sumMinus - totalMinus) > 60_000) {
      issues.push(
        `${st.name}: jami minus mos emas (kunlar ${msToClock(sumMinus)} ≠ ${msToClock(totalMinus)})`
      );
    }

    if (Math.abs(sumPlus - st.totalOvertimeMs) > 60_000) {
      issues.push(
        `${st.name}: jami plus mos emas (kunlar ${msToClock(sumPlus)} ≠ ${msToClock(st.totalOvertimeMs)})`
      );
    }

    const balance = st.totalOvertimeMs - totalMinus;
    const reported = st.totalOvertimeMs - (st.totalMinusMs ?? totalMinus);
    if (Math.abs(balance - (st.totalOvertimeMs - totalMinus)) > 60_000) {
      issues.push(`${st.name}: balans jami noto'g'ri`);
    }
    void reported;
  }

  return {
    ok: issues.length === 0,
    issues,
    summary: {
      staff: data.staff.length,
      workDays,
      realTimeDays,
      inferredDays,
    },
  };
}
