const BASE = (token) => `https://api.telegram.org/bot${token}`;

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
    answer: (id, text = "") => tgCall(token, "answerCallbackQuery", { callback_query_id: id, text }),
    getUpdates: (offset, timeout = 25) =>
      tgCall(token, "getUpdates", {
        offset,
        timeout,
        allowed_updates: ["message", "callback_query"],
      }),
  };
}
