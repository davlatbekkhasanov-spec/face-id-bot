const BASE = (token) => `https://api.telegram.org/bot${token}`;

async function tgCallForm(token, method, form) {
  const res = await fetch(`${BASE(token)}/${method}`, { method: "POST", body: form });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || `${method} xato`);
  return data.result;
}

async function tgCall(token, method, body) {
  const res = await fetch(`${BASE(token)}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || `${method} xato`);
  return data.result;
}

export function makeTelegram(token) {
  return {
    send: (chatId, text, extra = {}) =>
      tgCall(token, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra }),
    sendPhoto: async (chatId, buffer, caption = "", extra = {}) => {
      const form = new FormData();
      form.append("chat_id", String(chatId));
      if (caption) {
        form.append("caption", caption);
        form.append("parse_mode", "HTML");
      }
      form.append("photo", new Blob([buffer], { type: "image/png" }), "report.png");
      if (extra.reply_markup) form.append("reply_markup", JSON.stringify(extra.reply_markup));
      return tgCallForm(token, "sendPhoto", form);
    },
    sendDocument: async (chatId, buffer, filename, caption = "", extra = {}) => {
      const form = new FormData();
      form.append("chat_id", String(chatId));
      form.append(
        "document",
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        filename || "Tabel.xlsx"
      );
      if (caption) {
        form.append("caption", caption);
        form.append("parse_mode", "HTML");
      }
      if (extra.reply_markup) form.append("reply_markup", JSON.stringify(extra.reply_markup));
      return tgCallForm(token, "sendDocument", form);
    },
    answer: (id, text = "") => tgCall(token, "answerCallbackQuery", { callback_query_id: id, text }),
    getUpdates: (offset, timeout = 25) =>
      tgCall(token, "getUpdates", {
        offset,
        timeout,
        allowed_updates: ["message", "callback_query"],
      }),
    getFile: (fileId) => tgCall(token, "getFile", { file_id: fileId }),
    downloadFile: async (filePath) => {
      const res = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
      if (!res.ok) throw new Error(`file download ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}
