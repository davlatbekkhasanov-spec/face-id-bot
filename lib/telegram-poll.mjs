import { makeTelegram } from "./telegram-api.mjs";
import { handleCallbackQuery, handleMessage } from "./bot-handlers.mjs";
import { parseAdminIds } from "./access.mjs";

export function startTelegramPoll(ctx) {
  const tg = makeTelegram(ctx.botToken);
  const pending = new Map();
  let offset = 0;

  const pollCtx = {
    ...ctx,
    pending,
    tgSend: (chatId, text, extra) => tg.send(chatId, text, extra),
    tgSendPhoto: (chatId, buffer, caption, extra) => tg.sendPhoto(chatId, buffer, caption, extra),
    tgSendDocument: (chatId, buffer, filename, caption, extra) =>
      tg.sendDocument(chatId, buffer, filename, caption, extra),
    tgAnswer: (id, text) => tg.answer(id, text).catch(() => {}),
  };

  console.log("Telegram admin poll: yoqildi");

  (async function loop() {
    for (;;) {
      try {
        const updates = await tg.getUpdates(offset);
        for (const u of updates) {
          offset = u.update_id + 1;
          if (u.callback_query) {
            handleCallbackQuery(u.callback_query, pollCtx).catch((e) =>
              console.warn("callback:", e.message)
            );
          }
          if (u.message) {
            handleMessage(u.message, pollCtx).catch((e) => console.warn("message:", e.message));
          }
        }
      } catch (e) {
        console.warn("poll:", e.message);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  })();
}

export { parseAdminIds };
