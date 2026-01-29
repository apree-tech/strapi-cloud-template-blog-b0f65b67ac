'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::report-version.report-version', ({ strapi }) => ({
  /**
   * GET /api/report-versions/:reportId
   * Get versions for a report (10 by default, up to 200)
   */
  async getVersions(ctx) {
    try {
      const { reportId } = ctx.params;
      const { limit = 10, offset = 0, dateFrom, dateTo, all } = ctx.query;

      const versionService = strapi.service('api::report-version.report-version');
      const result = await versionService.getVersions(reportId, {
        limit: all === 'true' ? 200 : Math.min(parseInt(limit) || 10, 200),
        offset: parseInt(offset) || 0,
        dateFrom,
        dateTo,
      });

      ctx.body = {
        success: true,
        versions: result.versions,
        total: result.total,
        hasMore: result.total > (parseInt(offset) || 0) + result.versions.length,
      };
    } catch (error) {
      strapi.log.error('[Version] Error getting versions:', error);
      ctx.throw(500, 'Failed to get versions');
    }
  },

  /**
   * GET /api/report-versions/version/:versionId
   * Get a specific version
   */
  async getVersion(ctx) {
    try {
      const { versionId } = ctx.params;

      const versionService = strapi.service('api::report-version.report-version');
      const version = await versionService.getVersion(parseInt(versionId));

      if (!version) {
        ctx.throw(404, 'Version not found');
      }

      ctx.body = {
        success: true,
        version,
      };
    } catch (error) {
      strapi.log.error('[Version] Error getting version:', error);
      ctx.throw(error.status || 500, error.message || 'Failed to get version');
    }
  },

  /**
   * POST /api/report-versions/restore
   * Restore a version
   */
  async restoreVersion(ctx) {
    try {
      const { versionId, userId, userName } = ctx.request.body;

      if (!versionId || !userId || !userName) {
        ctx.throw(400, 'Missing required fields: versionId, userId, userName');
      }

      const versionService = strapi.service('api::report-version.report-version');
      const result = await versionService.restoreVersion(parseInt(versionId), userId, userName);

      // Broadcast version restore to connected clients via Socket.IO
      const io = strapi.io;
      if (io) {
        const version = await versionService.getVersion(parseInt(versionId));
        if (version) {
          io.to(`report:${version.report_document_id}`).emit('version-restored', {
            versionNumber: result.restoredVersion,
            userId,
            userName,
          });
        }
      }

      ctx.body = {
        success: true,
        restoredVersion: result.restoredVersion,
      };
    } catch (error) {
      strapi.log.error('[Version] Error restoring version:', error);
      ctx.throw(error.status || 500, error.message || 'Failed to restore version');
    }
  },

  /**
   * GET /api/report-versions/:reportId/diff/:versionId
   * Get diff between a version and current document state
   */
  async getDiffWithCurrent(ctx) {
    try {
      const { reportId, versionId } = ctx.params;

      const versionService = strapi.service('api::report-version.report-version');
      const version = await versionService.getVersion(parseInt(versionId));

      if (!version) {
        ctx.throw(404, 'Version not found');
      }

      // Get current report data
      const report = await strapi.db.query('api::report.report').findOne({
        where: { documentId: reportId },
        populate: ['content_blocks'],
      });

      if (!report) {
        ctx.throw(404, 'Report not found');
      }

      const currentData = {
        title: report.title,
        dateFrom: report.dateFrom,
        dateTo: report.dateTo,
        content_blocks: report.content_blocks,
      };

      const diff = versionService.getDiff(version.snapshot_data, currentData);

      ctx.body = {
        success: true,
        diff,
        version: {
          id: version.id,
          version_number: version.version_number,
          version_label: version.version_label,
          user_names: version.user_names,
          created_at_snapshot: version.created_at_snapshot,
        },
      };
    } catch (error) {
      strapi.log.error('[Version] Error getting diff:', error);
      ctx.throw(error.status || 500, error.message || 'Failed to get diff');
    }
  },

  /**
   * GET /api/report-versions/compare/:versionId1/:versionId2
   * Get diff between two versions
   */
  async compareTwoVersions(ctx) {
    try {
      const { versionId1, versionId2 } = ctx.params;

      const versionService = strapi.service('api::report-version.report-version');

      const [version1, version2] = await Promise.all([
        versionService.getVersion(parseInt(versionId1)),
        versionService.getVersion(parseInt(versionId2)),
      ]);

      if (!version1 || !version2) {
        ctx.throw(404, 'One or both versions not found');
      }

      const diff = versionService.getDiff(version1.snapshot_data, version2.snapshot_data);

      ctx.body = {
        success: true,
        diff,
        version1: {
          id: version1.id,
          version_number: version1.version_number,
          version_label: version1.version_label,
        },
        version2: {
          id: version2.id,
          version_number: version2.version_number,
          version_label: version2.version_label,
        },
      };
    } catch (error) {
      strapi.log.error('[Version] Error comparing versions:', error);
      ctx.throw(error.status || 500, error.message || 'Failed to compare versions');
    }
  },
}));
