'use strict';

const { verifyToken } = require('../../middlewares/jwt');

module.exports = {
  async getUserReports(ctx) {
    const token = ctx.request.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return ctx.unauthorized('No token provided');
    }

    const user = verifyToken(token);

    if (!user) {
      return ctx.unauthorized('Invalid token');
    }

    const { userId } = ctx.request.body;

    if (!userId) {
      return ctx.badRequest('userId is required');
    }

    // Verify user can only access their own reports (unless admin)
    if (user.type === 'user' && !user.isAdmin && user.id !== userId) {
      return ctx.forbidden('Cannot access other users reports');
    }

    try {
      // Fetch all reports (both published and drafts) for this user
      const reports = await strapi.db.query('api::report.report').findMany({
        where: {
          accounts: {
            document_id: userId,
          },
        },
        populate: {
          model: {
            select: ['id', 'documentId', 'name']
          },
          accounts: {
            select: ['id', 'documentId', 'name']
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return reports;
    } catch (error) {
      console.error('Error fetching user reports:', error);
      return ctx.internalServerError('Failed to fetch reports');
    }
  },
};
