'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/reports/:id/copy-from-previous',
      handler: 'report.copyFromPrevious',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/reports/:id/available-sources',
      handler: 'report.getAvailableSources',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/reports/:id/duplicate',
      handler: 'report.duplicateReport',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
