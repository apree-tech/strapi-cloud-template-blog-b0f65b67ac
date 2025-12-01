'use strict';

/**
 * account controller
 */

const { createCoreController } = require('@strapi/strapi').factories;
const bcryptjs = require('bcryptjs');

module.exports = createCoreController('api::account.account', ({ strapi }) => ({
  async find(ctx) {
    // Call the default find method
    return await super.find(ctx);
  },

  async authenticate(ctx) {
    const { password } = ctx.request.body;

    if (!password) {
      ctx.status = 400;
      return { error: 'Password is required' };
    }

    try {
      // Fetch all accounts
      const accounts = await strapi.entityService.findMany('api::account.account', {
        fields: ['id', 'documentId', 'name', 'password', 'isAdmin'],
      });

      // Try to find a matching account
      for (const account of accounts) {
        const accountPassword = account.password;

        // Compare plaintext password with hashed password
        if (accountPassword && await bcryptjs.compare(password, accountPassword)) {
          ctx.status = 200;
          return {
            id: account.documentId || account.id,
            name: account.name,
            type: 'user',
            isAdmin: account.isAdmin || false,
          };
        }
      }

      ctx.status = 401;
      return { error: 'Invalid password' };
    } catch (error) {
      strapi.log.error('Authentication error:', error);
      ctx.status = 500;
      return { error: 'Authentication failed' };
    }
  }
}));
