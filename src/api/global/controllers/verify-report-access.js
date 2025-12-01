'use strict';

const { verifyToken } = require('../../middlewares/jwt');

module.exports = {
  async verifyAccess(ctx) {
    const token = ctx.request.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return ctx.unauthorized('No token provided');
    }

    const user = verifyToken(token);

    if (!user) {
      return ctx.unauthorized('Invalid token');
    }

    try {
      const { reportId } = ctx.request.body;

      if (!reportId) {
        return ctx.badRequest('reportId is required');
      }

      // For admins, check if report exists
      if (user.isAdmin && user.type === 'user') {
        const report = await strapi.db.query('api::report.report').findOne({
          where: {
            uuid: reportId,
          },
        });

        return { hasAccess: !!report, isAdmin: true };
      }

      // For regular users, check if they are in the report's accounts
      if (user.type === 'user') {
        const report = await strapi.db.query('api::report.report').findOne({
          where: {
            uuid: reportId,
            accounts: {
              document_id: user.id,
            },
          },
          populate: {
            accounts: {
              select: ['id', 'documentId']
            }
          }
        });

        return { hasAccess: !!report };
      }

      // For models, check if report belongs to them and is published
      if (user.type === 'model') {
        const report = await strapi.db.query('api::report.report').findOne({
          where: {
            uuid: reportId,
            model: {
              document_id: user.id,
            },
            publishedAt: {
              $ne: null,
            },
          },
        });

        return { hasAccess: !!report };
      }

      return { hasAccess: false };
    } catch (error) {
      console.error('Error verifying report access:', error);
      return ctx.internalServerError('Failed to verify report access');
    }
  },
};
