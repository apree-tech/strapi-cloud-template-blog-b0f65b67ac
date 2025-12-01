'use strict';

const bcrypt = require('bcryptjs');

module.exports = {
  async authenticate(ctx) {
    const { password } = ctx.request.body;

    if (!password) {
      return ctx.badRequest('Password is required');
    }

    try {
      // Try to authenticate with accounts first
      const accounts = await strapi.entityService.findMany('api::account.account', {
        fields: ['id', 'documentId', 'name', 'role', 'password', 'isAdmin'],
      });

      for (const account of accounts) {
        const accountPassword = account.password;
        if (accountPassword && await bcrypt.compare(password, accountPassword)) {
          return {
            id: account.documentId || account.id,
            name: account.name,
            role: account.role,
            type: 'user',
            isAdmin: account.isAdmin || false,
          };
        }
      }

      // Try to authenticate with models
      const models = await strapi.entityService.findMany('api::model.model', {
        fields: ['id', 'documentId', 'name', 'password'],
      });

      for (const model of models) {
        const modelPassword = model.password;
        if (modelPassword && await bcrypt.compare(password, modelPassword)) {
          return {
            id: model.documentId || model.id,
            name: model.name,
            type: 'model',
          };
        }
      }

      return ctx.unauthorized('Invalid password');
    } catch (error) {
      console.error('Authentication error:', error);
      return ctx.internalServerError('Authentication failed');
    }
  },
};
