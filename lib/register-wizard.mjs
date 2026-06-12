import fs from "fs";
import path from "path";

const QUEUE_FILE = "registration.json";

export function loadEmployeesFile(dataDir) {
  const f = path.join(dataDir, "employees.json");
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

export function saveEmployeesFile(dataDir, data) {
  fs.writeFileSync(path.join(dataDir, "employees.json"), JSON.stringify(data, null, 2));
}

export function registrationPath(dataDir) {
  return path.join(dataDir, QUEUE_FILE);
}

export function loadRegistration(dataDir) {
  const f = registrationPath(dataDir);
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return { active: false, index: 0, awaitingPhoto: false };
  }
}

export function saveRegistration(dataDir, reg) {
  fs.writeFileSync(registrationPath(dataDir), JSON.stringify(reg, null, 2));
}

/** Ro'yxat tartibi — faceRegistered bo'lmaganlar */
export function pendingQueue(dataDir) {
  const { staff } = loadEmployeesFile(dataDir);
  return Object.entries(staff)
    .filter(([, s]) => !s.faceRegistered)
    .map(([key, s]) => ({
      key,
      name: `${s.firstName} ${s.lastName}`,
      telegramId: s.telegramId,
      deviceName: s.deviceName,
    }));
}

export function currentEmployee(dataDir) {
  const reg = loadRegistration(dataDir);
  if (!reg.active) return null;
  const q = pendingQueue(dataDir);
  return q[0] || null;
}

export function startWizard(dataDir) {
  const q = pendingQueue(dataDir);
  if (!q.length) return { done: true, text: "✅ Barcha hodimlar ro'yxatdan o'tgan." };
  const total = Object.keys(loadEmployeesFile(dataDir).staff).length;
  const done = total - q.length;
  saveRegistration(dataDir, { active: true, awaitingPhoto: true, total, done });
  return { done: false, text: askMessage(q[0], done + 1, total) };
}

export function askMessage(emp, num, total) {
  return (
    `📸 <b>Hodim ${num}/${total}: ${emp.name}</b>\n\n` +
    `Shu hodimning <b>rasm</b>ini yuboring (yuz aniq ko'rinsin).\n` +
    `Telegram ID tekshiruvi: <code>${emp.telegramId}</code>`
  );
}

export function afterPhoto(dataDir, photoSaved) {
  const reg = loadRegistration(dataDir);
  const emp = currentEmployee(dataDir);
  if (!emp) return { done: true, text: "✅ Tayyor." };

  const data = loadEmployeesFile(dataDir);
  data.staff[emp.key].faceRegistered = true;
  data.staff[emp.key].photoFile = photoSaved;
  saveEmployeesFile(dataDir, data);

  const done = (reg.done || 0) + 1;
  const total = reg.total || done;
  const remaining = pendingQueue(dataDir);

  if (!remaining.length) {
    saveRegistration(dataDir, { active: false, awaitingPhoto: false });
    return {
      done: true,
      text:
        `✅ <b>${emp.name}</b> saqlandi.\n` +
        `TG ID: <code>${emp.telegramId}</code> ✓\n\n` +
        `🎉 Barcha hodimlar ro'yxatdan o'tdi!`,
    };
  }

  saveRegistration(dataDir, { active: true, awaitingPhoto: true, total, done });
  return {
    done: false,
    text:
      `✅ <b>${emp.name}</b> saqlandi (TG: <code>${emp.telegramId}</code>)\n\n` +
      askMessage(remaining[0], done + 1, total),
  };
}
