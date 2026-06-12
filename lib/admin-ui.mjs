/** Admin inline tugmalar */
export function adminMainKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👤 Hodim tanlash", callback_data: "adm:pick" }],
      [{ text: "📊 Oxirgi hisobotni yuborish", callback_data: "adm:send_last" }],
    ],
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
        { text: "⏹ Smena tugadi", callback_data: `adm:out:${staffKey}` },
      ],
      [{ text: "◀️ Orqaga", callback_data: "adm:pick" }],
    ],
  };
}

export function employeeMenuKeyboard() {
  return {
    keyboard: [[{ text: "📋 Mening smenam" }]],
    resize_keyboard: true,
  };
}
