'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/models/authenticate',
      handler: 'model.authenticate',
      config: {
        auth: false,
      }
    }
  ]
};
