'use strict';

module.exports = {
  /**
   * GET /api/collaborative/history/:reportId
   * Get paginated history with filtering
   */
  async getHistory(ctx) {
    try {
      const { reportId } = ctx.params;
      const { page, pageSize, userId, fieldPath, dateFrom, dateTo } = ctx.query;

      const historyService = strapi.service('api::collaborative.history');
      const result = await historyService.getHistory(reportId, {
        page: parseInt(page) || 1,
        pageSize: parseInt(pageSize) || 50,
        userId: userId || undefined,
        fieldPath: fieldPath || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });

      ctx.body = {
        success: true,
        ...result,
      };
    } catch (error) {
      strapi.log.error('[History] Error getting history:', error);
      ctx.throw(500, 'Failed to get history');
    }
  },

  /**
   * GET /api/collaborative/history/:reportId/field/:fieldPath
   * Get history for a specific field
   */
  async getFieldHistory(ctx) {
    try {
      const { reportId, fieldPath } = ctx.params;
      const { limit } = ctx.query;

      const historyService = strapi.service('api::collaborative.history');
      const operations = await historyService.getFieldHistory(
        reportId,
        decodeURIComponent(fieldPath),
        parseInt(limit) || 20
      );

      ctx.body = {
        success: true,
        operations,
      };
    } catch (error) {
      strapi.log.error('[History] Error getting field history:', error);
      ctx.throw(500, 'Failed to get field history');
    }
  },

  /**
   * POST /api/collaborative/rollback
   * Rollback a specific change
   */
  async rollbackChange(ctx) {
    try {
      const { operationId, userId, userName } = ctx.request.body;

      if (!operationId || !userId || !userName) {
        ctx.throw(400, 'Missing required fields: operationId, userId, userName');
      }

      const historyService = strapi.service('api::collaborative.history');
      const result = await historyService.rollbackChange(
        parseInt(operationId),
        userId,
        userName
      );

      // Broadcast rollback to connected clients
      const io = strapi.io;
      if (io && result.reportDocumentId) {
        io.to(`report:${result.reportDocumentId}`).emit('field-rollback', {
          fieldPath: result.fieldPath,
          restoredValue: result.restoredValue,
          userId,
          userName,
        });
      }

      ctx.body = {
        success: true,
        restoredValue: result.restoredValue,
        fieldPath: result.fieldPath,
      };
    } catch (error) {
      strapi.log.error('[History] Error rolling back change:', error);
      ctx.throw(error.status || 500, error.message || 'Failed to rollback change');
    }
  },
};
