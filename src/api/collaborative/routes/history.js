'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/collaborative/history/:reportId',
      handler: 'history.getHistory',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/collaborative/history/:reportId/field/:fieldPath',
      handler: 'history.getFieldHistory',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/collaborative/rollback',
      handler: 'history.rollbackChange',
      config: {
        auth: false,
        policies: [],
      },
    },
  ],
};
