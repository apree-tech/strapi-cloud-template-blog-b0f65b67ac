'use strict';

const { verifyToken } = require('../../../middlewares/jwt');

module.exports = {
  async getReport(ctx) {
    const token = ctx.request.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return ctx.unauthorized('No token provided');
    }

    const user = verifyToken(token);

    if (!user) {
      return ctx.unauthorized('Invalid token');
    }

    try {
      const { uuid } = ctx.request.body;

      if (!uuid) {
        return ctx.badRequest('uuid is required');
      }

      // Build the where clause
      const whereClause = {
        uuid: uuid,
      };

      // Models can only see published reports
      if (user.type === 'model') {
        whereClause.publishedAt = {
          $ne: null,
        };
      }

      // Fetch report by UUID with all content blocks and images
      const report = await strapi.db.query('api::report.report').findOne({
        where: whereClause,
        populate: {
          content_blocks: {
            populate: {
              images: {
                populate: {
                  image: true
                }
              }
            }
          },
          model: {
            select: ['id', 'documentId', 'name']
          },
          accounts: {
            select: ['id', 'documentId', 'name']
          }
        },
      });

      if (!report) {
        return ctx.notFound('Report not found');
      }

      return report;
    } catch (error) {
      console.error('Error fetching report:', error);
      return ctx.internalServerError('Failed to fetch report');
    }
  },
};
