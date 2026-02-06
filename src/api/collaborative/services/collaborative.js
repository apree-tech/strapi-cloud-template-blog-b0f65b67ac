'use strict';

/**
 * Collaborative editing service
 * Manages real-time editing sessions, operations, and conflict resolution
 */

let sequenceCounter = 0;

module.exports = {
  /**
   * Join an editing session for a report
   */
  async joinSession(reportId, userId, userName, userRole, socketId) {
    const now = new Date();

    // Check if user already has a session for this report
    const existingSession = await strapi.db.query('api::edit-session.edit-session').findOne({
      where: {
        report_document_id: reportId,
        user_id: userId,
      },
    });

    if (existingSession) {
      // Update existing session
      await strapi.db.query('api::edit-session.edit-session').update({
        where: { id: existingSession.id },
        data: {
          socket_id: socketId,
          last_activity: now,
        },
      });
      strapi.log.info(`[Collaborative] User ${userName} rejoined session for report ${reportId}`);
      return existingSession;
    }

    // Create new session
    const session = await strapi.db.query('api::edit-session.edit-session').create({
      data: {
        report_document_id: reportId,
        user_id: userId,
        user_name: userName,
        user_role: userRole || 'editor',
        socket_id: socketId,
        connected_at: now,
        last_activity: now,
      },
    });

    strapi.log.info(`[Collaborative] User ${userName} joined session for report ${reportId}`);
    return session;
  },

  /**
   * Leave an editing session
   */
  async leaveSession(reportId, socketId) {
    const session = await strapi.db.query('api::edit-session.edit-session').findOne({
      where: { socket_id: socketId },
    });

    if (session) {
      await strapi.db.query('api::edit-session.edit-session').delete({
        where: { id: session.id },
      });
      strapi.log.info(`[Collaborative] User ${session.user_name} left session`);
      return session;
    }
    return null;
  },

  /**
   * Get all active editors for a report
   */
  async getActiveEditors(reportId) {
    const sessions = await strapi.db.query('api::edit-session.edit-session').findMany({
      where: { report_document_id: reportId },
      orderBy: { connected_at: 'asc' },
    });

    return sessions.map(s => ({
      userId: s.user_id,
      userName: s.user_name,
      userRole: s.user_role,
      currentField: s.current_field,
      cursorPosition: s.cursor_position,
      connectedAt: s.connected_at,
      lastActivity: s.last_activity,
    }));
  },

  /**
   * Update user's current field focus
   */
  async updateFieldFocus(reportId, socketId, fieldPath, cursorPosition) {
    const now = new Date();

    await strapi.db.query('api::edit-session.edit-session').updateMany({
      where: { socket_id: socketId },
      data: {
        current_field: fieldPath,
        cursor_position: cursorPosition,
        last_activity: now,
      },
    });
  },

  /**
   * Record an edit operation
   */
  async recordOperation(reportId, userId, userName, operationType, fieldPath, oldValue, newValue) {
    const now = new Date();
    sequenceCounter++;

    const operation = await strapi.db.query('api::edit-operation.edit-operation').create({
      data: {
        report_document_id: reportId,
        user_id: userId,
        user_name: userName,
        operation_type: operationType,
        field_path: fieldPath,
        old_value: oldValue,
        new_value: newValue,
        timestamp: now,
        sequence_number: sequenceCounter,
        applied: false,
        conflict_resolved: false,
      },
    });

    return operation;
  },

  /**
   * Get recent operations for a report (for syncing new users)
   */
  async getRecentOperations(reportId, sinceSequence = 0, limit = 100) {
    const operations = await strapi.db.query('api::edit-operation.edit-operation').findMany({
      where: {
        report_document_id: reportId,
        sequence_number: { $gt: sinceSequence },
        applied: true,
      },
      orderBy: { sequence_number: 'asc' },
      limit,
    });

    return operations;
  },

  /**
   * Clean up stale sessions (inactive for more than 5 minutes)
   */
  async cleanupStaleSessions() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const staleSessions = await strapi.db.query('api::edit-session.edit-session').findMany({
      where: {
        last_activity: { $lt: fiveMinutesAgo },
      },
    });

    for (const session of staleSessions) {
      await strapi.db.query('api::edit-session.edit-session').delete({
        where: { id: session.id },
      });
      strapi.log.info(`[Collaborative] Cleaned up stale session for user ${session.user_name}`);
    }

    return staleSessions.length;
  },

  /**
   * Get the current sequence number
   */
  getCurrentSequence() {
    return sequenceCounter;
  },
};
