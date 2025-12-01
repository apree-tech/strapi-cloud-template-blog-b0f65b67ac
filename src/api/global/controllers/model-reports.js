'use strict';

const { verifyToken } = require('../../../middlewares/jwt');

module.exports = {
  async getModelReports(ctx) {
    const token = ctx.request.headers.authorization?.replace('Bearer ', '');

    console.log('[model-reports] Authorization header:', ctx.request.headers.authorization?.substring(0, 50) + '...');
    console.log('[model-reports] Token extracted:', token?.substring(0, 50) + '...');

    if (!token) {
      console.log('[model-reports] No token provided');
      return ctx.unauthorized('No token provided');
    }

    const user = verifyToken(token);

    console.log('[model-reports] Verified user:', user);

    if (!user) {
      console.log('[model-reports] Token verification failed');
      return ctx.unauthorized('Invalid token');
    }

    // Only models can call this endpoint
    if (user.type !== 'model') {
      return ctx.forbidden('This endpoint is only for models');
    }

    try {
      const { modelId } = ctx.request.body;

      if (!modelId) {
        return ctx.badRequest('modelId is required');
      }

      // Verify the modelId matches the authenticated user
      if (user.id !== modelId) {
        return ctx.forbidden('You can only view your own reports');
      }

      // Fetch all published reports for this model
      const reports = await strapi.db.query('api::report.report').findMany({
        where: {
          model: {
            documentId: modelId
          },
          publishedAt: {
            $ne: null,
          }
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
      console.error('Error fetching model reports:', error);
      return ctx.internalServerError('Failed to fetch model reports');
    }
  },
};
