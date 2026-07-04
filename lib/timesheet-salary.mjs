/** Oylik maosh × soat balansi → pul (22 kun × 12 soat me'yor) */
const MONTHLY_NORM_MS = 22 * 12 * 3_600_000;

export function calcBalansSum(monthlySalary, balanceMs) {
  const salary = Number(monthlySalary) || 0;
  const bal = Number(balanceMs) || 0;
  if (!salary || !bal) return 0;
  return Math.round((salary * bal) / MONTHLY_NORM_MS);
}

export function fmtBalansSum(amount) {
  const n = Math.round(Number(amount) || 0);
  if (n === 0) return "0";
  const sign = n > 0 ? "+" : "−";
  const formatted = Math.abs(n).toLocaleString("ru-RU");
  return `${sign}${formatted}`;
}

export function staffMonthlySalary(staff) {
  return Number(staff?.monthlySalary) || 0;
}

/** Balans soat → so'm matn (+/− va probel) */
export function fmtMoneySom(monthlySalary, balanceMs) {
  const salary = Number(monthlySalary) || 0;
  if (!salary) return null;
  return `${fmtBalansSum(calcBalansSum(salary, balanceMs))} so'm`;
}
