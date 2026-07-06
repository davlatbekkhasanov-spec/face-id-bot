/**
 * BOT-MARKET / bot-konstruktor webhookini o'chirish — reklamalar shu yerda keladi.
 * Faqat bizning polling ishlashi uchun webhook bo'lmasligi kerak.
 */
export async function ensureTelegramPolling(botToken) {
  const token = String(botToken || "").trim();
  if (!token) return { ok: false, reason: "no_token" };

  const api = async (method, body = {}) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.description || method);
    return data.result;
  };

  const me = await api("getMe");
  const wh = await api("getWebhookInfo");
  const hadWebhook = Boolean(wh?.url);
  if (hadWebhook) {
    await api("deleteWebhook", { drop_pending_updates: true });
    console.warn(
      `Telegram webhook o'chirildi (@${me.username}): ${wh.url} — BOT-MARKET/konstruktor bloklandi`
    );
  } else {
    console.log(`Telegram polling: @${me.username} (webhook yo'q)`);
  }
  return { ok: true, username: me.username, hadWebhook, webhookUrl: wh?.url || "" };
}
