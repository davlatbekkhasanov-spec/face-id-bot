/** Admin inline tugmalar */
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
      const label = `${s.firstName || key}`;
      row.push({ text: `😊 ${label}`, callback_data: `adm:emp:${key}` });
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
