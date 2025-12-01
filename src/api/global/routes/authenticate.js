'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/authenticate',
      handler: 'authenticate.authenticate',
      config: {
        auth: false,
      }
    }
  ]
};
