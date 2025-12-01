'use strict';

module.exports = {
  async verifyAccess(ctx) {
    // SECURITY: userId, userType, isAdmin all come from request body
    // Anyone can claim to be admin. Needs session/JWT authentication.
    return ctx.forbidden('This endpoint requires proper authentication');

    try {
      const { reportId, userId, userType, isAdmin } = ctx.request.body;

      if (!reportId || !userId || !userType) {
        return ctx.badRequest('reportId, userId, and userType are required');
      }

      // For admins, check if report exists
      if (isAdmin && userType === 'user') {
        const report = await strapi.db.query('api::report.report').findOne({
          where: {
            uuid: reportId,
          },
        });

        return { hasAccess: !!report };
      }

      // For regular users, check if they are in the report's accounts
      if (userType === 'user') {
        const report = await strapi.db.query('api::report.report').findOne({
          where: {
            uuid: reportId,
            accounts: {
              document_id: userId,
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
      if (userType === 'model') {
        const report = await strapi.db.query('api::report.report').findOne({
          where: {
            uuid: reportId,
            model: {
              document_id: userId,
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
