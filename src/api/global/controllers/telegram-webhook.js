'use strict';

/**
 * Telegram webhook controller
 * Receives updates from Telegram Bot API and links usernames to chat IDs
 */

module.exports = {
  async handleUpdate(ctx) {
    const update = ctx.request.body;

    // Verify webhook secret if configured
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (webhookSecret) {
      const providedSecret = ctx.request.headers['x-telegram-bot-api-secret-token'];
      if (providedSecret !== webhookSecret) {
        strapi.log.warn('Telegram webhook: invalid secret token');
        return ctx.unauthorized();
      }
    }

    try {
      // Handle /start command
      if (update.message?.text?.startsWith('/start')) {
        const chatId = update.message.chat.id;
        const username = update.message.from.username;
        const firstName = update.message.from.first_name;

        strapi.log.info(`Telegram /start from @${username} (chat_id: ${chatId})`);

        if (username) {
          // Find model by telegram username (without @)
          const models = await strapi.entityService.findMany('api::model.model', {
            filters: {
              telegram: username,
            },
          });

          if (models.length > 0) {
            const model = models[0];

            // Update telegram field with numeric chat_id
            await strapi.entityService.update('api::model.model', model.id, {
              data: { telegram: String(chatId) },
            });

            strapi.log.info(`Linked @${username} to chat_id ${chatId} for model "${model.name}"`);

            // Send confirmation message
            await sendTelegramMessage(chatId,
              `✅ Привет, ${firstName}!\n\nТеперь ты будешь получать уведомления о новых отчётах.`
            );
          } else {
            strapi.log.info(`No model found with telegram @${username}`);

            // Send message that they're not registered
            await sendTelegramMessage(chatId,
              `👋 Привет, ${firstName}!\n\nТвой аккаунт @${username} пока не привязан к системе отчётов. Обратись к менеджеру для настройки.`
            );
          }
        } else {
          // User has no username
          await sendTelegramMessage(chatId,
            `👋 Привет!\n\nУ тебя не установлен username в Telegram. Установи его в настройках Telegram, а затем попробуй снова.`
          );
        }
      }

      return { ok: true };
    } catch (error) {
      strapi.log.error('Telegram webhook error:', error);
      return { ok: true }; // Always return 200 to Telegram
    }
  },
};

/**
 * Send message via Telegram Bot API
 */
async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
  } catch (error) {
    strapi.log.error('Failed to send Telegram message:', error);
  }
}
