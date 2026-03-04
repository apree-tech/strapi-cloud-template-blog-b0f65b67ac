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
   * Returns null if there are no changes since the last version
   */
  async createVersion(reportDocumentId, userIds, userNames, isAutoSave = true) {
    // Get the current report data with deep populate for dynamic zone
    const reports = await strapi.entityService.findMany('api::report.report', {
      filters: { documentId: reportDocumentId },
      populate: {
        content_blocks: { populate: '*' },
        model: true,
        accounts: true,
      },
      limit: 1,
    });
    const report = reports?.[0] || null;

    if (!report) {
      strapi.log.warn(`[Version] Report not found: ${reportDocumentId}`);
      return null;
    }

    // Create snapshot of all report fields
    const snapshot = {
      title: report.title,
      dateFrom: report.dateFrom,
      dateTo: report.dateTo,
      content_blocks: report.content_blocks,
      uuid: report.uuid,
    };

    // Get the latest version
    const latestVersion = await strapi.db.query('api::report-version.report-version').findOne({
      where: { report_document_id: reportDocumentId },
      orderBy: { version_number: 'desc' },
    });

    // Generate change summary by comparing with previous version
    let changeSummary = 'Первая версия';
    if (latestVersion) {
      changeSummary = this.generateChangeSummary(latestVersion.snapshot_data, snapshot);

      // Skip creating version if no actual changes (for auto-save only)
      if (isAutoSave && changeSummary === 'Без изменений') {
        strapi.log.debug(`[Version] Skipping auto-version for ${reportDocumentId} - no changes`);
        return null;
      }
    }

    const newVersionNumber = (latestVersion?.version_number || 0) + 1;

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

    strapi.log.info(`[Version] Restoring v${version.version_number} for report ${version.report_document_id}`);

    // Create a backup version before restoring
    try {
      await this.createVersion(
        version.report_document_id,
        [userId],
        `${userName} (до восстановления)`,
        false
      );
    } catch (backupErr) {
      strapi.log.warn(`[Version] Backup version failed (continuing restore): ${backupErr.message}`);
    }

    // Recursively strip all 'id' fields from nested objects/arrays
    const stripIds = (obj) => {
      if (Array.isArray(obj)) return obj.map(stripIds);
      if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          if (key === 'id') continue;
          result[key] = stripIds(value);
        }
        return result;
      }
      return obj;
    };

    const cleanBlocks = stripIds(snapshotData.content_blocks || []);
    strapi.log.info(`[Version] Restoring ${cleanBlocks.length} blocks`);

    // Use Document Service API (Strapi v5) — properly handles dynamic zones
    await strapi.documents('api::report.report').update({
      documentId: version.report_document_id,
      data: {
        title: snapshotData.title,
        dateFrom: snapshotData.dateFrom,
        dateTo: snapshotData.dateTo,
        content_blocks: cleanBlocks,
      },
    });

    strapi.log.info(`[Version] Restored v${version.version_number} for report ${version.report_document_id} by ${userName}`);

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
