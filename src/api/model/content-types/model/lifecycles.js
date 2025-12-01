const bcrypt = require('bcryptjs');

module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;

    if (data.password) {
      // Check password uniqueness across all models
      const allModels = await strapi.entityService.findMany('api::model.model', {
        fields: ['password'],
      });

      for (const model of allModels) {
        if (model.password && await bcrypt.compare(data.password, model.password)) {
          throw new Error('This password is already taken by another model');
        }
      }

      // Check password uniqueness across all accounts
      const allAccounts = await strapi.entityService.findMany('api::account.account', {
        fields: ['password'],
      });

      for (const account of allAccounts) {
        if (account.password && await bcrypt.compare(data.password, account.password)) {
          throw new Error('This password is already taken by another user');
        }
      }

      // Hash password before storing
      const salt = await bcrypt.genSalt(10);
      data.password = await bcrypt.hash(data.password, salt);
    }
  },

  async beforeUpdate(event) {
    const { data, where } = event.params;

    if (data.password) {
      // Check password uniqueness across all models (excluding current model)
      const allModels = await strapi.entityService.findMany('api::model.model', {
        fields: ['id', 'password'],
        filters: {
          id: { $ne: where.id },
        },
      });

      for (const model of allModels) {
        if (model.password && await bcrypt.compare(data.password, model.password)) {
          throw new Error('This password is already taken by another model');
        }
      }

      // Check password uniqueness across all accounts
      const allAccounts = await strapi.entityService.findMany('api::account.account', {
        fields: ['password'],
      });

      for (const account of allAccounts) {
        if (account.password && await bcrypt.compare(data.password, account.password)) {
          throw new Error('This password is already taken by another user');
        }
      }

      // Hash password before storing
      const salt = await bcrypt.genSalt(10);
      data.password = await bcrypt.hash(data.password, salt);
    }
  },
};
