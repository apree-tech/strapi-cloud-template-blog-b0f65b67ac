'use strict';

/**
 * Migration controller: Copy table-data from old format to new tableContent
 * Protected endpoint - requires secret key
 */

// Secret key for migration - change this or use env variable
const MIGRATION_SECRET = process.env.MIGRATION_SECRET || 'migrate-table-data-2024-secret';

module.exports = {
  async migrate(ctx) {
    // Check secret key from header or query
    const providedSecret = ctx.request.headers['x-migration-secret'] || ctx.query.secret;

    if (providedSecret !== MIGRATION_SECRET) {
      return ctx.forbidden('Invalid migration secret');
    }

    try {
      const results = {
        migrated: 0,
        skipped: 0,
        errors: [],
        details: [],
      };

      // Find all reports with content_blocks
      const reports = await strapi.db.query('api::report.report').findMany({
        populate: {
          content_blocks: true,
        },
      });

      strapi.log.info(`[Migration] Found ${reports.length} reports to check`);

      for (const report of reports) {
        if (!report.content_blocks || !Array.isArray(report.content_blocks)) {
          continue;
        }

        let needsUpdate = false;
        const updatedBlocks = report.content_blocks.map(block => {
          // Only process table-data blocks
          if (block.__component !== 'report-components.table-data') {
            return block;
          }

          // Skip if already has tableContent with data
          if (block.tableContent && block.tableContent.headers && block.tableContent.headers.length > 0) {
            results.skipped++;
            return block;
          }

          // Skip if no old data to migrate
          if (!block.headers || !Array.isArray(block.headers) || block.headers.length === 0) {
            return block;
          }

          // Copy old data to new format
          const tableContent = {
            headers: block.headers,
            rows: block.rows || [],
            totals: Array.isArray(block.totals) && block.totals.length > 0
              ? (Array.isArray(block.totals[0]) ? block.totals[0] : block.totals)
              : [],
            autoTotals: false, // Preserve original totals, don't auto-calculate
          };

          results.migrated++;
          results.details.push({
            reportId: report.id,
            reportTitle: report.title,
            headers: tableContent.headers.length,
            rows: tableContent.rows.length,
          });

          needsUpdate = true;

          return {
            ...block,
            tableContent: tableContent,
          };
        });

        if (needsUpdate) {
          try {
            await strapi.db.query('api::report.report').update({
              where: { id: report.id },
              data: {
                content_blocks: updatedBlocks,
              },
            });
            strapi.log.info(`[Migration] Updated report "${report.title}" (ID: ${report.id})`);
          } catch (updateError) {
            results.errors.push({
              reportId: report.id,
              reportTitle: report.title,
              error: updateError.message,
            });
          }
        }
      }

      strapi.log.info(`[Migration] Complete: ${results.migrated} migrated, ${results.skipped} skipped`);

      return {
        success: true,
        message: `Migration complete. Migrated: ${results.migrated}, Skipped: ${results.skipped}`,
        results,
      };

    } catch (error) {
      strapi.log.error('[Migration] Error:', error);
      return ctx.internalServerError('Migration failed: ' + error.message);
    }
  },
};
