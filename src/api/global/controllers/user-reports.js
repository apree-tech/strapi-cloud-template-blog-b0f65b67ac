'use strict';

module.exports = {
  async getUserReports(ctx) {
    // SECURITY: This endpoint is vulnerable - userId comes from request body
    // Anyone can request any user's reports. Needs session/JWT authentication.
    return ctx.forbidden('This endpoint requires proper authentication');

    try {
      const { userId } = ctx.request.body;

      if (!userId) {
        return ctx.badRequest('userId is required');
      }

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
