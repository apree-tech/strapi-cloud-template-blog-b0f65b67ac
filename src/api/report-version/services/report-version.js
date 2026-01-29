'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::report-version.report-version', ({ strapi }) => ({
  /**
   * Get versions for a report with pagination
   */
  async getVersions(reportId, { limit = 10, offset = 0, dateFrom, dateTo } = {}) {
    const where = { report_document_id: reportId };

    if (dateFrom || dateTo) {
      where.created_at_snapshot = {};
      if (dateFrom) where.created_at_snapshot.$gte = new Date(dateFrom);
      if (dateTo) where.created_at_snapshot.$lte = new Date(dateTo);
    }

    const [versions, total] = await Promise.all([
      strapi.db.query('api::report-version.report-version').findMany({
        where,
        orderBy: { version_number: 'desc' },
        offset,
        limit,
      }),
      strapi.db.query('api::report-version.report-version').count({ where }),
    ]);

    return { versions, total };
  },

  /**
   * Get a specific version by ID
   */
  async getVersion(versionId) {
    return strapi.db.query('api::report-version.report-version').findOne({
      where: { id: versionId },
    });
  },

  /**
   * Create a version snapshot
   */
  async createVersion(reportDocumentId, userIds, userNames, isAutoSave = true) {
    // Get the current report data
    const report = await strapi.db.query('api::report.report').findOne({
      where: { documentId: reportDocumentId },
      populate: ['content_blocks', 'model', 'accounts'],
    });

    if (!report) {
      strapi.log.warn(`[Version] Report not found: ${reportDocumentId}`);
      return null;
    }

    // Get the latest version number
    const latestVersion = await strapi.db.query('api::report-version.report-version').findOne({
      where: { report_document_id: reportDocumentId },
      orderBy: { version_number: 'desc' },
    });

    const newVersionNumber = (latestVersion?.version_number || 0) + 1;

    // Create snapshot of all report fields
    const snapshot = {
      title: report.title,
      dateFrom: report.dateFrom,
      dateTo: report.dateTo,
      content_blocks: report.content_blocks,
      uuid: report.uuid,
    };

    // Generate change summary by comparing with previous version
    let changeSummary = 'Первая версия';
    if (latestVersion) {
      changeSummary = this.generateChangeSummary(latestVersion.snapshot_data, snapshot);
    }

    const version = await strapi.db.query('api::report-version.report-version').create({
      data: {
        report_document_id: reportDocumentId,
        version_number: newVersionNumber,
        version_label: `Версия ${newVersionNumber}${isAutoSave ? ' (авто)' : ''}`,
        snapshot_data: snapshot,
        user_ids: userIds,
        user_names: userNames,
        created_at_snapshot: new Date(),
        change_summary: changeSummary,
        is_auto_save: isAutoSave,
      },
    });

    strapi.log.info(`[Version] Created version ${newVersionNumber} for report ${reportDocumentId} by ${userNames}`);
    return version;
  },

  /**
   * Restore a version
   */
  async restoreVersion(versionId, userId, userName) {
    const version = await this.getVersion(versionId);

    if (!version) {
      throw new Error('Version not found');
    }

    const snapshotData = version.snapshot_data;

    // Get current report
    const report = await strapi.db.query('api::report.report').findOne({
      where: { documentId: version.report_document_id },
    });

    if (!report) {
      throw new Error('Report not found');
    }

    // Create a backup version before restoring
    await this.createVersion(
      version.report_document_id,
      [userId],
      `${userName} (до восстановления)`,
      false
    );

    // Restore the report data from snapshot
    await strapi.db.query('api::report.report').update({
      where: { id: report.id },
      data: {
        title: snapshotData.title,
        dateFrom: snapshotData.dateFrom,
        dateTo: snapshotData.dateTo,
        content_blocks: snapshotData.content_blocks,
      },
    });

    strapi.log.info(`[Version] Restored version ${version.version_number} for report ${version.report_document_id} by ${userName}`);

    return { success: true, restoredVersion: version.version_number };
  },

  /**
   * Get diff between two versions or version and current
   */
  getDiff(oldData, newData) {
    const diff = require('diff');
    const result = {
      title: null,
      dateFrom: null,
      dateTo: null,
      content_blocks: [],
    };

    // Compare simple string fields
    if (oldData.title !== newData.title) {
      result.title = diff.diffWords(oldData.title || '', newData.title || '');
    }

    if (oldData.dateFrom !== newData.dateFrom) {
      result.dateFrom = { old: oldData.dateFrom, new: newData.dateFrom };
    }

    if (oldData.dateTo !== newData.dateTo) {
      result.dateTo = { old: oldData.dateTo, new: newData.dateTo };
    }

    // Compare content blocks
    const oldBlocks = oldData.content_blocks || [];
    const newBlocks = newData.content_blocks || [];
    const maxLength = Math.max(oldBlocks.length, newBlocks.length);

    for (let i = 0; i < maxLength; i++) {
      const oldBlock = oldBlocks[i];
      const newBlock = newBlocks[i];

      if (!oldBlock && newBlock) {
        result.content_blocks.push({
          index: i,
          type: 'added',
          component: newBlock.__component,
          block: newBlock,
        });
      } else if (oldBlock && !newBlock) {
        result.content_blocks.push({
          index: i,
          type: 'removed',
          component: oldBlock.__component,
          block: oldBlock,
        });
      } else if (oldBlock && newBlock) {
        const blockDiff = this.diffBlock(oldBlock, newBlock, diff);
        if (blockDiff.hasChanges) {
          result.content_blocks.push({
            index: i,
            type: 'modified',
            component: newBlock.__component,
            changes: blockDiff.changes,
          });
        }
      }
    }

    return result;
  },

  /**
   * Diff a single content block
   */
  diffBlock(oldBlock, newBlock, diff) {
    const result = { hasChanges: false, changes: {} };
    const keys = new Set([...Object.keys(oldBlock), ...Object.keys(newBlock)]);

    for (const key of keys) {
      if (key === '__component' || key === 'id') continue;

      const oldVal = oldBlock[key];
      const newVal = newBlock[key];

      if (typeof oldVal === 'string' && typeof newVal === 'string') {
        if (oldVal !== newVal) {
          result.hasChanges = true;
          result.changes[key] = diff.diffWords(oldVal, newVal);
        }
      } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        result.hasChanges = true;
        result.changes[key] = { old: oldVal, new: newVal };
      }
    }

    return result;
  },

  /**
   * Generate human-readable change summary
   */
  generateChangeSummary(oldData, newData) {
    const changes = [];

    if (oldData.title !== newData.title) {
      changes.push('Изменён заголовок');
    }

    if (oldData.dateFrom !== newData.dateFrom || oldData.dateTo !== newData.dateTo) {
      changes.push('Изменены даты');
    }

    const oldBlocks = oldData.content_blocks || [];
    const newBlocks = newData.content_blocks || [];

    if (JSON.stringify(oldBlocks) !== JSON.stringify(newBlocks)) {
      const added = newBlocks.length - oldBlocks.length;
      if (added > 0) {
        changes.push(`Добавлено блоков: ${added}`);
      } else if (added < 0) {
        changes.push(`Удалено блоков: ${Math.abs(added)}`);
      }

      // Count modified blocks
      const minLen = Math.min(oldBlocks.length, newBlocks.length);
      let modified = 0;
      for (let i = 0; i < minLen; i++) {
        if (JSON.stringify(oldBlocks[i]) !== JSON.stringify(newBlocks[i])) {
          modified++;
        }
      }
      if (modified > 0) {
        changes.push(`Изменено блоков: ${modified}`);
      }
    }

    return changes.length > 0 ? changes.join('; ') : 'Без изменений';
  },
}));
