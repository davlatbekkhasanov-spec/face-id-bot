import { canUseBot, staffKeyByTelegramId, isRegisteredEmployee, isGroupChat } from "./access.mjs";
import { buildManualCard } from "./manual-attendance.mjs";
import { sendManualAndStore } from "./process-event.mjs";
import { shiftStartFor, shiftEndFor, shiftHoursFor, formatShiftLabel, hasShiftTracking } from "./shifts.mjs";
import { fmtDuration } from "./period.mjs";
import {
  adminMainKeyboard,
  employeePickKeyboard,
  actionKeyboard,
  manualTimeKeyboard,
  employeeMenuKeyboard,
  adminStaffReplyKeyboard,
  adminActionReplyKeyboard,
  adminReportsReplyKeyboard,
  removeReplyKeyboard,
  staffKeyByReplyLabel,
  staffReplyLabel,
} from "./admin-ui.mjs";
import { REPORT_BUTTONS, buildAdminReportPhoto, buildAdminReportText, reportsMenuIntro } from "./admin-reports.mjs";
import { buildTimesheetForRange } from "./timesheet-report.mjs";
import {
  buildMonthPickKeyboard,
  buildDayPickKeyboard,
  monthPickLabel,
  startTabelPickMessage,
  pickReplyMarkup,
} from "./timesheet-pick.mjs";
import { dayKeyFromParts } from "./period.mjs";
import {
  buildDaysListPhoto,
  buildDaysListText,
  buildDeleteDayKeyboard,
  deleteConfirmKeyboard,
  dayPickLabel,
  listDataDays,
  performDayDelete,
} from "./admin-data-manage.mjs";
import {
  buildStaffResetDayKeyboard,
  listStaffDataDays,
  performStaffDayReset,
  staffResetConfirmKeyboard,
  staffResetConfirmText,
  staffResetDayLabel,
  startStaffResetIntro,
} from "./admin-staff-reset.mjs";
import { pushFaceIdToHub } from "./yordamchi-push.mjs";
import { fmtDayHuman } from "./admin-report-data.mjs";
import { getStaffState } from "./db.mjs";
import { displayName } from "./attendance-core.mjs";
function isAdmin(uid, adminIds) {
  return adminIds.has(Number(uid));
}

async function sendManual(ctx, chatId, key, intent, clockHHMM = null) {
  const { dataDir, botToken, employees, tgSend } = ctx;
  const r = buildManualCard(key, employees, intent, clockHHMM);
  if (r.error) {
    await tgSend(chatId, `⚠️ ${r.error}`);
    return false;
  }
  await sendManualAndStore(dataDir, botToken, ctx, r.card, employees);
  const when = clockHHMM ? ` · ${clockHHMM}` : "";
  await tgSend(chatId, `✅ Yuborildi: <b>${r.card.staffName}</b>${when}`, {
    reply_markup: adminStaffReplyKeyboard(employees),
  });
  ctx.pending?.delete(chatId);
  return true;
}

function startTabelPick(ctx, uid, chatId, tgSend) {
  try {
    const pick = buildMonthPickKeyboard();
    ctx.pending?.set(uid, { mode: "tabel_month", monthMap: pick.monthMap });
    return tgSend(chatId, startTabelPickMessage(), { reply_markup: pickReplyMarkup(pick) });
  } catch (e) {
    console.warn("tabel pick:", e.message);
    return tgSend(chatId, `⚠️ Tabel ochilmadi: ${e.message}`, {
      reply_markup: adminReportsReplyKeyboard(),
    });
  }
}

async function sendTabelForRange(ctx, chatId, tgSend, employees, fromKey, toKey, uid) {
  try {
    const report = await buildTimesheetForRange(employees, fromKey, toKey);
    ctx.pending?.delete(uid);
    if (!report.excel?.buffer) {
      return tgSend(chatId, report.emptyMessage || "Ma'lumot yo'q.", {
        reply_markup: adminReportsReplyKeyboard(),
      });
    }
    return ctx.tgSendDocument(
      chatId,
      report.excel.buffer,
      report.excel.filename,
      report.caption,
      { reply_markup: adminReportsReplyKeyboard() }
    );
  } catch (e) {
    console.warn("timesheet:", e.message);
    return tgSend(chatId, `⚠️ Tabel xatosi: ${e.message}`, {
      reply_markup: adminReportsReplyKeyboard(),
    });
  }
}

function showReportsMenu(ctx, uid, chatId, tgSend) {
  ctx.pending?.delete(uid);
  return tgSend(chatId, reportsMenuIntro(), {
    reply_markup: adminReportsReplyKeyboard(),
  });
}

async function sendDaysListReport(ctx, chatId) {
  try {
    const result = await buildDaysListPhoto();
    if (result?.png) {
      return ctx.tgSendPhoto(chatId, result.png, result.caption, {
        reply_markup: adminReportsReplyKeyboard(),
      });
    }
  } catch (e) {
    console.warn("days list png:", e.message);
  }
  return ctx.tgSend(chatId, buildDaysListText(), {
    reply_markup: adminReportsReplyKeyboard(),
  });
}

function startDeleteDayPick(ctx, uid, chatId, tgSend) {
  const days = listDataDays(20);
  if (!days.length) {
    return tgSend(chatId, "📭 O'chirish uchun saqlangan kun yo'q.", {
      reply_markup: adminReportsReplyKeyboard(),
    });
  }
  const dayMap = {};
  for (const d of days) dayMap[dayPickLabel(d)] = d.day_key;
  ctx.pending?.set(uid, { mode: "delete_pick", dayMap });
  return tgSend(
    chatId,
    "🗑 <b>Ma'lumot o'chirish</b>\n\nO'chirmoqchi bo'lgan kunningizni tanlang:",
    { reply_markup: buildDeleteDayKeyboard(days) }
  );
}

function showStaffList(ctx, uid, chatId, tgSend) {
  ctx.pending?.set(uid, { mode: "staff_list" });
  return tgSend(chatId, "👤 Hodimni tanlang:", {
    reply_markup: adminStaffReplyKeyboard(ctx.employees),
  });
}

function showStaffActions(ctx, uid, chatId, tgSend, staffKey) {
  const s = ctx.employees.staff?.[staffKey];
  if (!s) return tgSend(chatId, "Hodim topilmadi.");
  const name = staffReplyLabel(s);
  const shift = hasShiftTracking(s) ? formatShiftLabel(s, staffKey) : "Smena yo'q";
  ctx.pending?.set(uid, { mode: "action", staffKey });
  return tgSend(chatId, `😊 <b>${name}</b>\n📋 ${shift}`, {
    reply_markup: adminActionReplyKeyboard(),
  });
}

function startStaffTestReset(ctx, uid, chatId, tgSend, staffKey) {
  const days = listStaffDataDays(staffKey, 12);
  if (!days.length) {
    return tgSend(chatId, "📭 Bu hodim uchun o'chirish mumkin bo'lgan kun yo'q.", {
      reply_markup: adminActionReplyKeyboard(),
    });
  }
  const dayMap = {};
  for (const d of days) dayMap[staffResetDayLabel(d)] = d.day_key;
  ctx.pending?.set(uid, { mode: "reset_staff_pick", staffKey, dayMap });
  return tgSend(chatId, startStaffResetIntro(staffKey, ctx.employees), {
    reply_markup: buildStaffResetDayKeyboard(days),
  });
}

function parseTimeCallback(data, prefix) {
  const rest = data.slice(prefix.length);
  const i = rest.indexOf(":");
  if (i < 0) return null;
  const key = rest.slice(0, i);
  const compact = rest.slice(i + 1);
  if (!/^\d{3,4}$/.test(compact)) return null;
  const hhmm =
    compact.length === 3
      ? `${compact[0]}:${compact.slice(1)}`
      : `${compact.slice(0, 2)}:${compact.slice(2)}`;
  return { key, hhmm };
}

export async function handleCallbackQuery(q, ctx) {
  const { employees, adminIds, tgAnswer, tgSend } = ctx;
  const uid = q.from?.id;
  const chatId = q.message?.chat?.id;
  const data = q.data || "";

  await tgAnswer(q.id);

  if (!isAdmin(uid, adminIds)) {
    return tgSend(chatId, "⛔ Faqat admin.");
  }

  if (data === "adm:menu") {
    ctx.pending?.delete(uid);
    return tgSend(chatId, adminWelcome(), { reply_markup: adminMainKeyboard() });
  }

  if (data === "adm:pick") {
    ctx.pending?.delete(uid);
    return showStaffList(ctx, uid, chatId, tgSend);
  }

  if (data.startsWith("adm:emp:")) {
    ctx.pending?.delete(uid);
    const key = data.slice(8);
    const s = employees.staff?.[key];
    if (!s) return tgSend(chatId, "Hodim topilmadi.");
    const name = displayName(key, {}, employees);
    const shift = hasShiftTracking(s) ? formatShiftLabel(s, key) : "Smena yo'q";
    return tgSend(chatId, `😊 <b>${name}</b>\n📋 ${shift}`, { reply_markup: actionKeyboard(key) });
  }

  if (data.startsWith("adm:wt:")) {
    const key = data.slice(7);
    if (!employees.staff?.[key]) return tgSend(chatId, "Hodim topilmadi.");
    ctx.pending?.set(uid, { staffKey: key, mode: "time" });
    const name = displayName(key, {}, employees);
    return tgSend(
      chatId,
      `🕐 <b>${name}</b>\nVaqt yuboring: <code>14:30</code> (HH:MM)`
    );
  }

  if (data.startsWith("adm:in:")) {
    const key = data.slice(7);
    return sendManual(ctx, chatId, key, "in");
  }

  if (data.startsWith("adm:out:")) {
    const key = data.slice(8);
    return sendManual(ctx, chatId, key, "out");
  }

  if (data.startsWith("adm:win:")) {
    const p = parseTimeCallback(data, "adm:win:");
    if (!p) return tgSend(chatId, "Vaqt xato.");
    ctx.pending?.delete(uid);
    return sendManual(ctx, chatId, p.key, "in", p.hhmm);
  }

  if (data.startsWith("adm:wout:")) {
    const p = parseTimeCallback(data, "adm:wout:");
    if (!p) return tgSend(chatId, "Vaqt xato.");
    ctx.pending?.delete(uid);
    return sendManual(ctx, chatId, p.key, "out", p.hhmm);
  }
}

function adminInbox(ctx, uid, chatId) {
  if (ctx.adminChatId) return ctx.adminChatId;
  return chatId;
}

export async function handleMessage(msg, ctx) {
  const { employees, adminIds, tgSend } = ctx;
  const uid = msg.from?.id;
  const chatId = msg.chat?.id;
  const text = (msg.text || "").trim();
  const adminChat = adminInbox(ctx, uid, chatId);

  if (!text || !chatId) return;

  if (isAdmin(uid, adminIds)) {
    if (/^\/(start|panel|admin|qo?lda)(@\w+)?$/i.test(text) || text === "🎛 Admin") {
      ctx.pending?.delete(uid);
      return tgSend(chatId, adminWelcome(), {
        reply_markup: adminStaffReplyKeyboard(employees),
      });
    }

    if (text === "📊 Hisobotlar") {
      return showReportsMenu(ctx, uid, adminChat, tgSend);
    }

    if (text === "📆 Ma'lumot kunlari") {
      return sendDaysListReport(ctx, adminChat);
    }

    if (text === "🗑 Ma'lumot o'chirish") {
      return startDeleteDayPick(ctx, uid, adminChat, tgSend);
    }

    if (text === "◀️ Hisobotlar") {
      return showReportsMenu(ctx, uid, adminChat, tgSend);
    }

    if (text === "✖️ Yopish") {
      ctx.pending?.delete(uid);
      return tgSend(chatId, "Yopildi.", { reply_markup: removeReplyKeyboard() });
    }

    if (text === "📋 Tabel" || /tabel/i.test(text)) {
      return startTabelPick(ctx, uid, chatId, tgSend);
    }

    if (REPORT_BUTTONS[text]) {
      const kind = REPORT_BUTTONS[text];
      try {
        const result = await buildAdminReportPhoto(kind, employees);
        if (result?.png) {
          return ctx.tgSendPhoto(adminChat, result.png, result.caption, {
            reply_markup: adminReportsReplyKeyboard(),
          });
        }
      } catch (e) {
        console.warn("report png:", e.message);
      }
      const fallback = buildAdminReportText(kind, employees);
      if (fallback) {
        return tgSend(adminChat, fallback, { reply_markup: adminReportsReplyKeyboard() });
      }
    }

    if (text === "◀️ Hodimlar") {
      ctx.pending?.delete(uid);
      return showStaffList(ctx, uid, adminChat, tgSend);
    }

    const pending = ctx.pending?.get(uid);

    if (pending?.mode === "tabel_month") {
      if (text === "❌ Bekor") return showReportsMenu(ctx, uid, adminChat, tgSend);
      const ym = pending.monthMap?.[text];
      if (!ym) return;
      const pick = buildDayPickKeyboard(ym, { fromDay: 1 });
      ctx.pending.set(uid, { mode: "tabel_from", ym, dayMap: pick.dayMap });
      return tgSend(chatId, `📋 <b>TABEL</b>\n\n📅 ${monthPickLabel(ym)}\n\n2️⃣ <b>Boshlanish kunini</b> tanlang:`, {
        reply_markup: pickReplyMarkup(pick),
      });
    }

    if (pending?.mode === "tabel_from") {
      if (text === "❌ Bekor") return showReportsMenu(ctx, uid, adminChat, tgSend);
      const fromDay = pending.dayMap?.[text];
      if (!fromDay) return;
      const pick = buildDayPickKeyboard(pending.ym, { fromDay });
      ctx.pending.set(uid, { mode: "tabel_to", ym: pending.ym, fromDay, dayMap: pick.dayMap });
      return tgSend(
        chatId,
        `📋 <b>TABEL</b>\n\n📅 ${monthPickLabel(pending.ym)}\n▶️ Boshlanish: <b>${fromDay}</b>\n\n3️⃣ <b>Tugash kunini</b> tanlang:`,
        { reply_markup: pickReplyMarkup(pick) }
      );
    }

    if (pending?.mode === "tabel_to") {
      if (text === "❌ Bekor") return showReportsMenu(ctx, uid, adminChat, tgSend);
      const toDay = pending.dayMap?.[text];
      if (!toDay) return;
      const fromKey = dayKeyFromParts(pending.ym, pending.fromDay);
      const toKey = dayKeyFromParts(pending.ym, toDay);
      await tgSend(chatId, "⏳ Tabel tayyorlanmoqda...");
      return sendTabelForRange(ctx, chatId, tgSend, employees, fromKey, toKey, uid);
    }

    if (pending?.mode === "delete_confirm") {
      if (text === "✅ Ha, o'chirish") {
        const dk = pending.dayKey;
        const r = performDayDelete(dk, employees);
        ctx.pending?.delete(uid);
        return tgSend(
          adminChat,
          `✅ <b>O'chirildi</b>\n📅 ${fmtDayHuman(dk)}\n` +
            `Kunlik yozuv: ${r.dailyRows} · Holat: ${r.staffRows}`,
          { reply_markup: adminReportsReplyKeyboard() }
        );
      }
      if (text === "❌ Bekor") {
        return showReportsMenu(ctx, uid, adminChat, tgSend);
      }
    }

    if (pending?.mode === "delete_pick") {
      const dk = pending.dayMap?.[text];
      if (dk) {
        ctx.pending?.set(uid, { mode: "delete_confirm", dayKey: dk });
        return tgSend(
          adminChat,
          `⚠️ <b>Tasdiqlang</b>\n\n📅 ${fmtDayHuman(dk)} kunidagi barcha ma'lumot o'chiriladi.\nDavom etasizmi?`,
          { reply_markup: deleteConfirmKeyboard() }
        );
      }
    }

    if (pending?.mode === "reset_staff_confirm") {
      if (text === "✅ Ha, tozalash") {
        const { staffKey, dayKey } = pending;
        const r = performStaffDayReset(staffKey, dayKey, employees);
        const tg = employees.staff?.[staffKey]?.telegramId;
        if (tg) {
          await pushFaceIdToHub({
            telegramId: tg,
            dayKey,
            breakdown: { day_total: 0, late_penalty: 0, debt_penalty: 0, overtime_bonus: 0 },
          });
        }
        ctx.pending?.set(uid, { mode: "action", staffKey });
        return tgSend(
          chatId,
          `✅ <b>Tozalandi</b>\n👤 ${r.staffName}\n📅 ${fmtDayHuman(dayKey)}\n` +
            `Kunlik: ${r.dailyRows} · Ball: ${r.pointsRows} · Holat: ${r.stateReset ? "1" : "0"}`,
          { reply_markup: adminActionReplyKeyboard() }
        );
      }
      if (text === "❌ Bekor" && pending.staffKey) {
        return showStaffActions(ctx, uid, chatId, tgSend, pending.staffKey);
      }
    }

    if (pending?.mode === "reset_staff_pick") {
      if (text === "❌ Bekor" && pending.staffKey) {
        return showStaffActions(ctx, uid, chatId, tgSend, pending.staffKey);
      }
      const dk = pending.dayMap?.[text];
      if (dk && pending.staffKey) {
        ctx.pending?.set(uid, {
          mode: "reset_staff_confirm",
          staffKey: pending.staffKey,
          dayKey: dk,
        });
        return tgSend(chatId, staffResetConfirmText(pending.staffKey, dk, employees), {
          reply_markup: staffResetConfirmKeyboard(),
        });
      }
    }

    if (text === "🧪 Test tozalash" && pending?.staffKey) {
      return startStaffTestReset(ctx, uid, chatId, tgSend, pending.staffKey);
    }

    if (text === "▶️ Keldi" && pending?.staffKey) {
      return sendManual(ctx, chatId, pending.staffKey, "in");
    }
    if (text === "⏹ Ketdi" && pending?.staffKey) {
      return sendManual(ctx, chatId, pending.staffKey, "out");
    }
    if (text === "🕐 Vaqt kiritish" && pending?.staffKey) {
      ctx.pending?.set(uid, { staffKey: pending.staffKey, mode: "time" });
      const name = staffReplyLabel(employees.staff[pending.staffKey]);
      return tgSend(chatId, `🕐 <b>${name}</b>\nVaqt yuboring: <code>14:30</code> (HH:MM)`, {
        reply_markup: adminActionReplyKeyboard(),
      });
    }

    const staffKey = staffKeyByReplyLabel(text, employees);
    if (staffKey) {
      return showStaffActions(ctx, uid, chatId, tgSend, staffKey);
    }

    if (pending?.mode === "time" && pending?.staffKey) {
      const m = text.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) {
        return tgSend(chatId, "⚠️ Format: <code>14:30</code>");
      }
      const hhmm = `${Number(m[1])}:${m[2]}`;
      const name = displayName(pending.staffKey, {}, employees);
      ctx.pending.set(uid, { staffKey: pending.staffKey, mode: "confirm", hhmm });
      return tgSend(
        chatId,
        `👤 <b>${name}</b> · 🕐 <b>${hhmm}</b>\nAmalni tanlang:`,
        { reply_markup: manualTimeKeyboard(pending.staffKey, hhmm) }
      );
    }
    return;
  }

  if (!canUseBot(uid, employees, adminIds)) {
    if (isGroupChat(msg)) return;
    return tgSend(chatId, accessDeniedMessage());
  }

  if (text === "📋 Mening smenam" || /^\/smenam/i.test(text)) {
    const info = employeeShiftInfo(uid, employees);
    if (!info) return tgSend(chatId, accessDeniedMessage());
    return tgSend(chatId, info, { reply_markup: employeeMenuKeyboard() });
  }

  if (/^\/start/i.test(text) && canUseBot(uid, employees, adminIds)) {
    const key = staffKeyByTelegramId(uid, employees);
    if (!key) return;
    const name = displayName(key, {}, employees);
    return tgSend(chatId, employeeWelcome(name), { reply_markup: employeeMenuKeyboard() });
  }
}

export function employeeShiftInfo(uid, employees) {
  const key = staffKeyByTelegramId(uid, employees);
  if (!key) return null;
  const s = employees.staff[key];
  const st = getStaffState(key);
  const start = shiftStartFor(s, key);
  const end = shiftEndFor(s, key);
  const norm = fmtDuration(shiftHoursFor(s) * 60 * 60 * 1000);
  const worked = st ? fmtDuration(st.day_worked_ms || 0) : "0 дақиқа";
  const name = displayName(key, {}, employees);
  if (!hasShiftTracking(s)) {
    return `📋 <b>${name}</b>\n📊 Bugun: <b>${worked}</b>`;
  }
  return `📋 <b>${name}</b>\n🕐 Smena: <b>${start} — ${end}</b>\n⏱ Me'yor: <b>${norm}</b>\n📊 Bugun: <b>${worked}</b>`;
}

export function accessDeniedMessage() {
  return "⛔ Bu bot faqat ro'yxatdan o'tgan hodimlar uchun.";
}

export function adminWelcome() {
  return (
    "🎛 <b>Admin panel</b>\n\n" +
    "👤 Hodim — qo'lda keldi/ketdi\n" +
    "🧪 Test tozalash — faqat shu hodimning kunini o'chirish\n" +
    "📊 Hisobotlar — kim ishda, qarz, ma'lumot boshqaruvi"
  );
}

export function reportsWelcome() {
  return reportsMenuIntro();
}

export function employeeWelcome(name) {
  return `👋 Salom, <b>${name}</b>!\n\n📋 Mening smenam — smena vaqtingizni ko'ring.`;
}

export { canUseBot, isRegisteredEmployee, adminMainKeyboard, employeeMenuKeyboard, employeePickKeyboard };
