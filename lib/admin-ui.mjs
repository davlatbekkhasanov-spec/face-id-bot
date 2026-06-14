/** Admin klaviaturalar */

export function staffReplyLabel(s) {
  const last = (s.lastName || "").trim();
  const first = (s.firstName || "").trim();
  if (last && first) return `${last} ${first}`;
  return first || last || "?";
}

export function staffKeyByReplyLabel(text, employees) {
  const t = String(text || "").trim();
  for (const [key, s] of Object.entries(employees.staff || {})) {
    if (staffReplyLabel(s) === t) return key;
  }
  return null;
}

/** Pastki klaviatura — hodimlar ro'yxati (screenshot kabi) */
export function adminStaffReplyKeyboard(employees) {
  const rows = Object.entries(employees.staff || {})
    .map(([, s]) => [{ text: staffReplyLabel(s) }])
    .sort((a, b) => a[0].text.localeCompare(b[0].text, "uz"));
  rows.push([{ text: "📊 Hisobotlar" }]);
  return { keyboard: rows, resize_keyboard: true };
}

/** Hisobotlar menyusi */
export function adminReportsReplyKeyboard() {
  return {
    keyboard: [
      [{ text: "👷 Kimlar ishda" }, { text: "💰 Jami qarzdorlar" }],
      [{ text: "📅 Bugungi holat" }, { text: "⚠️ Bugungi qarz" }],
      [{ text: "🏆 Oy reytingi" }],
      [{ text: "📆 Ma'lumot kunlari" }, { text: "🗑 Ma'lumot o'chirish" }],
      [{ text: "◀️ Hodimlar" }, { text: "✖️ Yopish" }],
    ],
    resize_keyboard: true,
  };
}

/** Hodim tanlangandan keyin — Keldi / Ketdi */
export function adminActionReplyKeyboard() {
  return {
    keyboard: [
      [{ text: "▶️ Keldi" }, { text: "⏹ Ketdi" }],
      [{ text: "🕐 Vaqt kiritish" }],
      [{ text: "🧪 Test tozalash" }],
      [{ text: "◀️ Hodimlar" }],
    ],
    resize_keyboard: true,
  };
}

export function removeReplyKeyboard() {
  return { remove_keyboard: true };
}

/** Inline (ixtiyoriy) */
export function adminMainKeyboard() {
  return {
    inline_keyboard: [[{ text: "✍️ Qo'lda keldi/ketdi", callback_data: "adm:pick" }]],
  };
}

export function employeePickKeyboard(employees) {
  const rows = [];
  const staff = Object.entries(employees.staff || {});
  for (let i = 0; i < staff.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, staff.length); j++) {
      const [key, s] = staff[j];
      row.push({ text: staffReplyLabel(s), callback_data: `adm:emp:${key}` });
    }
    rows.push(row);
  }
  rows.push([{ text: "◀️ Orqaga", callback_data: "adm:menu" }]);
  return { inline_keyboard: rows };
}

export function actionKeyboard(staffKey) {
  return {
    inline_keyboard: [
      [
        { text: "▶️ Keldi", callback_data: `adm:in:${staffKey}` },
        { text: "⏹ Ketdi", callback_data: `adm:out:${staffKey}` },
      ],
      [{ text: "🕐 Vaqt kiritish", callback_data: `adm:wt:${staffKey}` }],
      [{ text: "◀️ Orqaga", callback_data: "adm:pick" }],
    ],
  };
}

export function manualTimeKeyboard(staffKey, hhmm) {
  const compact = hhmm.replace(":", "");
  return {
    inline_keyboard: [
      [
        { text: `▶️ Keldi ${hhmm}`, callback_data: `adm:win:${staffKey}:${compact}` },
        { text: `⏹ Ketdi ${hhmm}`, callback_data: `adm:wout:${staffKey}:${compact}` },
      ],
      [{ text: "◀️ Orqaga", callback_data: `adm:emp:${staffKey}` }],
    ],
  };
}

export function employeeMenuKeyboard() {
  return {
    keyboard: [[{ text: "📋 Mening smenam" }]],
    resize_keyboard: true,
  };
}
