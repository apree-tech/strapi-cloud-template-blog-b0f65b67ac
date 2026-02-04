'use strict';

/**
 * Telegram notification service
 * Sends messages to Telegram users via Bot API
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://reports.apree-tech.com';

/**
 * Send a message to a Telegram user
 * @param {string} chatId - Telegram chat ID (user ID)
 * @param {string} message - Message text (supports Markdown)
 * @param {object} options - Additional options
 * @returns {Promise<boolean>} - Success status
 */
async function sendMessage(chatId, message, options = {}) {
  if (!TELEGRAM_BOT_TOKEN) {
    strapi.log.warn('TELEGRAM_BOT_TOKEN not configured, skipping notification');
    return false;
  }

  if (!chatId) {
    strapi.log.warn('No Telegram chat ID provided, skipping notification');
    return false;
  }

  try {
    const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: options.parseMode || 'Markdown',
        disable_web_page_preview: options.disablePreview ?? true,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      strapi.log.error(`Telegram API error: ${data.description}`);
      return false;
    }

    strapi.log.info(`Telegram notification sent to ${chatId}`);
    return true;
  } catch (error) {
    strapi.log.error('Failed to send Telegram notification:', error);
    return false;
  }
}

/**
 * Notify model about new published report
 * @param {object} model - Model entity with telegram field
 * @param {object} report - Report entity
 * @returns {Promise<boolean>}
 */
async function notifyModelAboutReport(model, report) {
  if (!model.telegram) {
    strapi.log.info(`Model "${model.name}" has no Telegram ID configured`);
    return false;
  }

  const reportDate = report.dateFrom
    ? new Date(report.dateFrom).toLocaleDateString('ru-RU', {
        month: 'long',
        year: 'numeric',
      })
    : 'новый период';

  const reportUrl = report.uuid ? `${FRONTEND_URL}/${report.uuid}` : FRONTEND_URL;

  const message = `
📊 *Новый отчёт опубликован!*

Привет, ${model.name}! Твой отчёт за ${reportDate} готов.

[📄 ${report.title}](${reportUrl})
`.trim();

  return sendMessage(model.telegram, message, { disablePreview: false });
}

module.exports = {
  sendMessage,
  notifyModelAboutReport,
};
