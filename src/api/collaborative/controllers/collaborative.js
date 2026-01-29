'use strict';

/**
 * Collaborative editing controller
 * HTTP endpoints for collaborative editing features
 */

module.exports = {
  /**
   * Get active editors for a report
   * GET /api/collaborative/editors/:reportId
   */
  async getEditors(ctx) {
    try {
      const { reportId } = ctx.params;
      const collaborativeService = strapi.service('api::collaborative.collaborative');

      const editors = await collaborativeService.getActiveEditors(reportId);

      ctx.body = {
        success: true,
        editors,
        count: editors.length,
      };
    } catch (error) {
      strapi.log.error('[Collaborative] Error getting editors:', error);
      ctx.throw(500, 'Failed to get active editors');
    }
  },

  /**
   * Join editing session
   * POST /api/collaborative/join
   */
  async joinSession(ctx) {
    try {
      const { reportId, userId, userName, userRole, socketId } = ctx.request.body;

      if (!reportId || !userId || !userName || !socketId) {
        ctx.throw(400, 'Missing required fields: reportId, userId, userName, socketId');
      }

      const collaborativeService = strapi.service('api::collaborative.collaborative');
      const session = await collaborativeService.joinSession({
        reportId,
        userId,
        userName,
        userRole,
        socketId,
      });

      // Get all active editors to broadcast
      const editors = await collaborativeService.getActiveEditors(reportId);

      ctx.body = {
        success: true,
        session,
        editors,
      };
    } catch (error) {
      strapi.log.error('[Collaborative] Error joining session:', error);
      ctx.throw(500, 'Failed to join editing session');
    }
  },

  /**
   * Leave editing session
   * POST /api/collaborative/leave
   */
  async leaveSession(ctx) {
    try {
      const { socketId } = ctx.request.body;

      if (!socketId) {
        ctx.throw(400, 'Missing required field: socketId');
      }

      const collaborativeService = strapi.service('api::collaborative.collaborative');
      const session = await collaborativeService.leaveSession({ socketId });

      ctx.body = {
        success: true,
        session,
      };
    } catch (error) {
      strapi.log.error('[Collaborative] Error leaving session:', error);
      ctx.throw(500, 'Failed to leave editing session');
    }
  },

  /**
   * Submit an edit operation
   * POST /api/collaborative/operation
   */
  async submitOperation(ctx) {
    try {
      const { reportId, userId, userName, operationType, fieldPath, oldValue, newValue } = ctx.request.body;

      if (!reportId || !userId || !operationType || !fieldPath) {
        ctx.throw(400, 'Missing required fields');
      }

      const collaborativeService = strapi.service('api::collaborative.collaborative');

      // Record the operation
      const operation = await collaborativeService.recordOperation({
        reportId,
        userId,
        userName,
        operationType,
        fieldPath,
        oldValue,
        newValue,
      });

      // Apply the operation
      const result = await collaborativeService.applyOperation(operation.id);

      ctx.body = {
        success: result.success,
        operation,
        result,
        currentSequence: collaborativeService.getCurrentSequence(),
      };
    } catch (error) {
      strapi.log.error('[Collaborative] Error submitting operation:', error);
      ctx.throw(500, 'Failed to submit operation');
    }
  },

  /**
   * Get recent operations for syncing
   * GET /api/collaborative/operations/:reportId
   */
  async getOperations(ctx) {
    try {
      const { reportId } = ctx.params;
      const { sinceSequence = 0, limit = 100 } = ctx.query;

      const collaborativeService = strapi.service('api::collaborative.collaborative');
      const operations = await collaborativeService.getRecentOperations(
        reportId,
        parseInt(sinceSequence),
        parseInt(limit)
      );

      ctx.body = {
        success: true,
        operations,
        currentSequence: collaborativeService.getCurrentSequence(),
      };
    } catch (error) {
      strapi.log.error('[Collaborative] Error getting operations:', error);
      ctx.throw(500, 'Failed to get operations');
    }
  },

  /**
   * Update field focus
   * POST /api/collaborative/focus
   */
  async updateFocus(ctx) {
    try {
      const { socketId, fieldPath, cursorPosition } = ctx.request.body;

      if (!socketId) {
        ctx.throw(400, 'Missing required field: socketId');
      }

      const collaborativeService = strapi.service('api::collaborative.collaborative');
      await collaborativeService.updateFieldFocus({
        socketId,
        fieldPath,
        cursorPosition,
      });

      ctx.body = {
        success: true,
      };
    } catch (error) {
      strapi.log.error('[Collaborative] Error updating focus:', error);
      ctx.throw(500, 'Failed to update focus');
    }
  },

  /**
   * Manually cleanup stale sessions
   * POST /api/collaborative/cleanup
   */
  async cleanup(ctx) {
    try {
      const collaborativeService = strapi.service('api::collaborative.collaborative');
      const cleanedCount = await collaborativeService.cleanupStaleSessions();

      ctx.body = {
        success: true,
        cleanedSessions: cleanedCount,
      };
    } catch (error) {
      strapi.log.error('[Collaborative] Error cleaning up sessions:', error);
      ctx.throw(500, 'Failed to cleanup sessions');
    }
  },
};
