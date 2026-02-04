'use strict';

/**
 * Report Comment Routes
 */

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/report-comments',
      handler: 'report-comment.find',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/report-comments/count',
      handler: 'report-comment.count',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/report-comments/users',
      handler: 'report-comment.users',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/report-comments',
      handler: 'report-comment.create',
      config: {
        auth: false,
      },
    },
    {
      method: 'PUT',
      path: '/report-comments/:id',
      handler: 'report-comment.update',
      config: {
        auth: false,
      },
    },
    {
      method: 'PUT',
      path: '/report-comments/:id/resolve',
      handler: 'report-comment.resolve',
      config: {
        auth: false,
      },
    },
    {
      method: 'PUT',
      path: '/report-comments/:id/unresolve',
      handler: 'report-comment.unresolve',
      config: {
        auth: false,
      },
    },
    {
      method: 'DELETE',
      path: '/report-comments/:id',
      handler: 'report-comment.delete',
      config: {
        auth: false,
      },
    },
  ],
};
