'use strict';

/**
 * Migration script: Copy table-data from old format (headers, rows, totals)
 * to new format (tableContent)
 *
 * Old data is preserved - this only copies, not moves.
 *
 * Usage: node scripts/migrate-table-data.js
 */

const { createStrapi } = require('@strapi/strapi');

async function migrate() {
  console.log('Starting table-data migration...');

  const strapi = await createStrapi().load();

  try {
    // Find all reports
    const reports = await strapi.db.query('api::report.report').findMany({
      populate: {
        content_blocks: true,
      },
    });

    console.log(`Found ${reports.length} reports`);

    let migratedCount = 0;
    let skippedCount = 0;

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

        // Skip if already has tableContent
        if (block.tableContent && block.tableContent.headers && block.tableContent.headers.length > 0) {
          skippedCount++;
          return block;
        }

        // Skip if no old data
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
          autoTotals: false, // Don't auto-calculate for migrated data
        };

        console.log(`  Migrating table-data in report "${report.title}" (ID: ${report.id})`);
        console.log(`    - Headers: ${tableContent.headers.join(', ')}`);
        console.log(`    - Rows: ${tableContent.rows.length}`);

        needsUpdate = true;
        migratedCount++;

        return {
          ...block,
          tableContent: tableContent,
        };
      });

      if (needsUpdate) {
        await strapi.db.query('api::report.report').update({
          where: { id: report.id },
          data: {
            content_blocks: updatedBlocks,
          },
        });
        console.log(`  Updated report "${report.title}"`);
      }
    }

    console.log('\n--- Migration Complete ---');
    console.log(`Migrated: ${migratedCount} table-data blocks`);
    console.log(`Skipped (already migrated): ${skippedCount} blocks`);
    console.log('\nOld data (headers, rows, totals) was preserved.');

  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await strapi.destroy();
  }
}

migrate();
