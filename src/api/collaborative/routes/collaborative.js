'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/collaborative/editors/:reportId',
      handler: 'collaborative.getEditors',
      config: {
        auth: false, // TODO: Add proper authentication
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/collaborative/join',
      handler: 'collaborative.joinSession',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/collaborative/leave',
      handler: 'collaborative.leaveSession',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/collaborative/operation',
      handler: 'collaborative.submitOperation',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/collaborative/operations/:reportId',
      handler: 'collaborative.getOperations',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/collaborative/focus',
      handler: 'collaborative.updateFocus',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/collaborative/cleanup',
      handler: 'collaborative.cleanup',
      config: {
        auth: false,
        policies: [],
      },
    },
  ],
};
