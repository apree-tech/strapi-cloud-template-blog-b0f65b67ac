'use strict';

const { verifyToken } = require('../../../middlewares/jwt');

module.exports = {
  async getAllReports(ctx) {
    const token = ctx.request.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return ctx.unauthorized('No token provided');
    }

    const user = verifyToken(token);

    // Allow admin users (type='user' with isAdmin=true) OR head_pm users
    if (!user || !(user.isAdmin || user.type === 'head_pm')) {
      return ctx.forbidden('Admin access required');
    }

    try{
      // Fetch all reports (both published and drafts) by querying the database directly
      // In Strapi 5, we need to get all versions including drafts and published
      const draftReports = await strapi.db.query('api::report.report').findMany({
        where: {
          publishedAt: null,
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

      const publishedReports = await strapi.db.query('api::report.report').findMany({
        where: {
          publishedAt: {
            $ne: null,
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

      // Combine both arrays
      const allReports = [...publishedReports, ...draftReports];

      return allReports;
    } catch (error) {
      console.error('Error fetching all reports:', error);
      return ctx.internalServerError('Failed to fetch reports');
    }
  },
};
