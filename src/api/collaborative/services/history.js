'use strict';

module.exports = {
  /**
   * Get paginated history for a report with filtering
   */
  async getHistory(reportId, { page = 1, pageSize = 50, userId, fieldPath, dateFrom, dateTo } = {}) {
    const where = { report_document_id: reportId };

    if (userId) where.user_id = parseInt(userId);
    if (fieldPath) where.field_path = { $contains: fieldPath };
    if (dateFrom || dateTo) {
      where.timestamp = {};
      if (dateFrom) where.timestamp.$gte = new Date(dateFrom);
      if (dateTo) where.timestamp.$lte = new Date(dateTo);
    }

    const [operations, total] = await Promise.all([
      strapi.db.query('api::edit-operation.edit-operation').findMany({
        where,
        orderBy: { timestamp: 'desc' },
        offset: (page - 1) * pageSize,
        limit: pageSize,
      }),
      strapi.db.query('api::edit-operation.edit-operation').count({ where }),
    ]);

    // Get unique users for filter dropdown
    const allOperations = await strapi.db.query('api::edit-operation.edit-operation').findMany({
      where: { report_document_id: reportId },
      select: ['user_id', 'user_name'],
    });

    const usersMap = new Map();
    allOperations.forEach(op => {
      if (!usersMap.has(op.user_id)) {
        usersMap.set(op.user_id, { id: op.user_id, name: op.user_name });
      }
    });
    const users = Array.from(usersMap.values());

    return {
      operations,
      users,
      pagination: {
        page,
        pageSize,
        pageCount: Math.ceil(total / pageSize),
        total,
      },
    };
  },

  /**
   * Get history for a specific field
   */
  async getFieldHistory(reportId, fieldPath, limit = 20) {
    return strapi.db.query('api::edit-operation.edit-operation').findMany({
      where: {
        report_document_id: reportId,
        field_path: fieldPath,
      },
      orderBy: { timestamp: 'desc' },
      limit,
    });
  },

  /**
   * Rollback a specific change
   */
  async rollbackChange(operationId, userId, userName) {
    const operation = await strapi.db.query('api::edit-operation.edit-operation').findOne({
      where: { id: operationId },
    });

    if (!operation) {
      throw new Error('Operation not found');
    }

    // Get the report
    const report = await strapi.db.query('api::report.report').findOne({
      where: { documentId: operation.report_document_id },
      populate: ['content_blocks'],
    });

    if (!report) {
      throw new Error('Report not found');
    }

    const fieldPath = operation.field_path;
    const oldValue = operation.old_value;
    const currentValue = operation.new_value;

    // Update the report field based on path
    await this.updateReportField(report, fieldPath, oldValue);

    // Record the rollback as a new operation
    const collaborativeService = strapi.service('api::collaborative.collaborative');
    if (collaborativeService?.recordOperation) {
      await collaborativeService.recordOperation(
        operation.report_document_id,
        userId,
        userName,
        'update',
        fieldPath,
        currentValue,
        oldValue
      );
    }

    strapi.log.info(`[History] Rolled back operation ${operationId} by ${userName}`);

    return {
      success: true,
      restoredValue: oldValue,
      fieldPath,
      reportDocumentId: operation.report_document_id,
    };
  },

  /**
   * Update a nested field in the report
   */
  async updateReportField(report, fieldPath, value) {
    const pathParts = fieldPath.split('.');

    if (pathParts.length === 1) {
      // Simple field update (title, dateFrom, dateTo)
      await strapi.db.query('api::report.report').update({
        where: { id: report.id },
        data: { [fieldPath]: value },
      });
    } else if (pathParts[0] === 'content_blocks') {
      // Dynamic zone field update: content_blocks.0.title
      const blockIndex = parseInt(pathParts[1]);
      const fieldName = pathParts.slice(2).join('.');

      if (!isNaN(blockIndex) && report.content_blocks && report.content_blocks[blockIndex]) {
        const contentBlocks = JSON.parse(JSON.stringify(report.content_blocks));

        if (fieldName) {
          // Navigate to nested field
          const nestedParts = fieldName.split('.');
          let target = contentBlocks[blockIndex];
          for (let i = 0; i < nestedParts.length - 1; i++) {
            if (target[nestedParts[i]] === undefined) {
              target[nestedParts[i]] = {};
            }
            target = target[nestedParts[i]];
          }
          target[nestedParts[nestedParts.length - 1]] = value;
        } else {
          contentBlocks[blockIndex] = value;
        }

        await strapi.db.query('api::report.report').update({
          where: { id: report.id },
          data: { content_blocks: contentBlocks },
        });
      }
    }
  },
};
