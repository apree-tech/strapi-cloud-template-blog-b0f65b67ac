'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/telegram-webhook',
      handler: 'telegram-webhook.handleUpdate',
      config: {
        auth: false, // No authentication for Telegram webhook
      },
    },
  ],
};
