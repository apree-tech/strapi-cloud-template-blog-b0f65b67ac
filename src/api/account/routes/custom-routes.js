'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/accounts/authenticate',
      handler: 'account.authenticate',
      config: {
        auth: false,
      }
    }
  ]
};
