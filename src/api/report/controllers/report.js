'use strict';

/**
 *  report controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::report.report', ({ strapi }) => ({
  /**
   * Copy data from previous report to the current one
   * POST /api/reports/:id/copy-from-previous
   */
  async copyFromPrevious(ctx) {
    const { id: documentId } = ctx.params;
    const { sourceReportId } = ctx.request.body || {};

    try {
      // Get the target report by documentId
      const targetReports = await strapi.entityService.findMany('api::report.report', {
        filters: { documentId },
        populate: ['model', 'content_blocks'],
        limit: 1,
      });

      const targetReport = targetReports[0];

      if (!targetReport) {
        return ctx.notFound('Target report not found');
      }

      // Always use 2 months comparison
      const compareMonths = 2;
      const previousMonthsNeeded = 1;

      let sourceReports = [];

      if (sourceReportId) {
        // Use specified source report (sourceReportId is also documentId)
        const reports = await strapi.entityService.findMany('api::report.report', {
          filters: { documentId: sourceReportId },
          populate: ['content_blocks'],
          limit: 1,
        });
        if (reports[0]) sourceReports = [reports[0]];
      } else {
        // Find previous months' reports automatically
        sourceReports = await this.findPreviousReports(targetReport, previousMonthsNeeded);
      }

      if (sourceReports.length === 0) {
        return ctx.badRequest('No previous report found to copy from', {
          message: 'Предыдущий отчёт не найден',
        });
      }

      // Smart merge content blocks with multi-month support
      const mergedBlocks = this.mergeContentBlocksMultiMonth(
        targetReport.content_blocks || [],
        sourceReports,
        targetReport.dateFrom,
        compareMonths
      );

      if (mergedBlocks.length === 0) {
        return ctx.badRequest('No data to copy', {
          message: 'Нет данных для копирования',
        });
      }

      // Update the target report using its internal id
      const updatedReport = await strapi.entityService.update('api::report.report', targetReport.id, {
        data: {
          content_blocks: mergedBlocks,
        },
        populate: ['content_blocks'],
      });

      const sourceDate = new Date(sourceReports[0].dateFrom);
      const monthName = sourceDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
      const monthsMessage = sourceReports.length > 1
        ? `Данные скопированы из ${sourceReports.length} отчётов`
        : `Данные скопированы из отчёта за ${monthName}`;

      return {
        success: true,
        message: monthsMessage,
        copiedBlocksCount: mergedBlocks.length,
        sourceReports: sourceReports.map(r => ({
          id: r.documentId,
          title: r.title,
          dateFrom: r.dateFrom,
        })),
        data: updatedReport,
      };
    } catch (error) {
      strapi.log.error('Error copying from previous report:', error);
      return ctx.internalServerError('Failed to copy data', {
        message: 'Ошибка при копировании данных',
        error: error.message,
      });
    }
  },

  /**
   * Get available reports to copy from
   * GET /api/reports/:id/available-sources
   */
  async getAvailableSources(ctx) {
    const { id: documentId } = ctx.params;

    try {
      // Find by documentId
      const targetReports = await strapi.entityService.findMany('api::report.report', {
        filters: { documentId },
        populate: ['model'],
        limit: 1,
      });

      const targetReport = targetReports[0];

      if (!targetReport) {
        return ctx.notFound('Report not found');
      }

      if (!targetReport.model) {
        return { sources: [] };
      }

      const modelId = typeof targetReport.model === 'object' ? targetReport.model.id : targetReport.model;

      // Find all reports for this model
      const reports = await strapi.entityService.findMany('api::report.report', {
        filters: {
          model: modelId,
          documentId: { $ne: documentId }, // Exclude current report
        },
        sort: { dateFrom: 'desc' },
        limit: 12, // Last 12 months
      });

      const sources = reports.map((report) => {
        const date = new Date(report.dateFrom);
        return {
          id: report.documentId, // Return documentId for frontend
          title: report.title,
          dateFrom: report.dateFrom,
          monthName: date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
        };
      });

      return { sources };
    } catch (error) {
      strapi.log.error('Error getting available sources:', error);
      return ctx.internalServerError('Failed to get sources');
    }
  },

  /**
   * Find report from previous month for the same model
   */
  async findPreviousReport(targetReport) {
    if (!targetReport.model || !targetReport.dateFrom) {
      return null;
    }

    const modelId = typeof targetReport.model === 'object' ? targetReport.model.id : targetReport.model;
    const targetDate = new Date(targetReport.dateFrom);
    const prevMonthDate = new Date(targetDate);
    prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);

    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth();

    const reports = await strapi.entityService.findMany('api::report.report', {
      filters: { model: modelId },
      populate: ['content_blocks'],
    });

    return reports.find((report) => {
      if (!report.dateFrom) return false;
      const reportDate = new Date(report.dateFrom);
      return reportDate.getFullYear() === prevYear && reportDate.getMonth() === prevMonth;
    });
  },

  /**
   * Find multiple previous reports for multi-month comparison
   * @param {Object} targetReport - The target report
   * @param {number} count - Number of previous months to find
   * @returns {Array} Array of reports sorted by date (newest first)
   */
  async findPreviousReports(targetReport, count) {
    if (!targetReport.model || !targetReport.dateFrom) {
      return [];
    }

    const modelId = typeof targetReport.model === 'object' ? targetReport.model.id : targetReport.model;
    const targetDate = new Date(targetReport.dateFrom);

    const reports = await strapi.entityService.findMany('api::report.report', {
      filters: { model: modelId },
      populate: ['content_blocks'],
    });

    // Find reports for previous months
    const previousReports = [];
    for (let i = 1; i <= count; i++) {
      const prevMonthDate = new Date(targetDate);
      prevMonthDate.setMonth(prevMonthDate.getMonth() - i);
      const prevYear = prevMonthDate.getFullYear();
      const prevMonth = prevMonthDate.getMonth();

      const report = reports.find((r) => {
        if (!r.dateFrom) return false;
        const reportDate = new Date(r.dateFrom);
        return reportDate.getFullYear() === prevYear && reportDate.getMonth() === prevMonth;
      });

      if (report) {
        previousReports.push(report);
      }
    }

    return previousReports;
  },

  /**
   * Generate month headers based on date and count
   */
  generateMonthHeaders(dateFrom, count) {
    const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
    const headers = [];
    const date = new Date(dateFrom);

    for (let i = 0; i < count; i++) {
      const monthName = date.toLocaleDateString('ru-RU', { month: 'long' });
      headers.push(capitalize(monthName));
      date.setMonth(date.getMonth() - 1);
    }

    return headers;
  },

  /**
   * Multi-month merge: combines data from multiple previous reports
   * @param {Array} targetBlocks - Current report's blocks
   * @param {Array} sourceReports - Array of previous reports (newest first)
   * @param {string} targetDateFrom - Target report's date
   * @param {number} compareMonths - Number of months to compare (2-6)
   */
  mergeContentBlocksMultiMonth(targetBlocks, sourceReports, targetDateFrom, compareMonths) {
    if (!Array.isArray(sourceReports) || sourceReports.length === 0) {
      return targetBlocks;
    }

    const result = [...targetBlocks];
    const monthHeaders = this.generateMonthHeaders(targetDateFrom, compareMonths);

    // Collect all source blocks by type and identifier
    const allSourceBlocks = sourceReports.flatMap((r) => r.content_blocks || []);

    // Group source blocks by component type and identifier
    const sourceBlocksMap = new Map();
    for (const block of allSourceBlocks) {
      const key = this.getBlockKey(block);
      if (!sourceBlocksMap.has(key)) {
        sourceBlocksMap.set(key, []);
      }
      sourceBlocksMap.get(key).push(block);
    }

    // Process each unique source block
    for (const [key, blocks] of sourceBlocksMap.entries()) {
      const firstBlock = blocks[0];
      const componentType = firstBlock.__component;

      if (componentType === 'report-components.social-media-stats') {
        const platform = firstBlock.metrics?.platform;
        const existingIndex = result.findIndex(
          (b) => b.__component === componentType && b.metrics?.platform === platform
        );

        // Collect metrics from all source reports for this platform
        const sourceMetricsByReport = sourceReports.map((report) => {
          const block = (report.content_blocks || []).find(
            (b) => b.__component === componentType && b.metrics?.platform === platform
          );
          return block?.metrics?.metrics || block?.metrics || [];
        });

        if (existingIndex >= 0) {
          result[existingIndex] = this.mergeSocialMediaStatsMultiMonth(
            result[existingIndex],
            sourceMetricsByReport,
            monthHeaders
          );
        } else {
          const newBlock = this.createSocialMediaStatsMultiMonth(
            firstBlock,
            sourceMetricsByReport,
            monthHeaders
          );
          if (newBlock) result.push(newBlock);
        }
      } else if (componentType === 'report-components.table-data') {
        const existingIndex = result.findIndex(
          (b) => b.__component === componentType && b.title === firstBlock.title
        );

        // Collect rows from all source reports for this table
        const sourceRowsByReport = sourceReports.map((report) => {
          const block = (report.content_blocks || []).find(
            (b) => b.__component === componentType && b.title === firstBlock.title
          );
          return block?.rows || [];
        });

        if (existingIndex >= 0) {
          result[existingIndex] = this.mergeTableDataMultiMonth(
            result[existingIndex],
            firstBlock,
            sourceRowsByReport,
            monthHeaders
          );
        } else {
          const newBlock = this.createTableDataMultiMonth(
            firstBlock,
            sourceRowsByReport,
            monthHeaders
          );
          if (newBlock) result.push(newBlock);
        }
      } else {
        // Other blocks: add only if not exists
        const exists = result.some((b) => this.getBlockKey(b) === key);
        if (!exists) {
          const emptyBlock = this.copyBlockStructureEmpty(firstBlock);
          if (emptyBlock) result.push(emptyBlock);
        }
      }
    }

    return result;
  },

  /**
   * Get unique key for a block based on type and identifier
   */
  getBlockKey(block) {
    const type = block.__component;
    if (type === 'report-components.social-media-stats') {
      return `${type}:${block.metrics?.platform || 'unknown'}`;
    }
    if (block.title) {
      return `${type}:${block.title}`;
    }
    return `${type}:${block.id || Math.random()}`;
  },

  /**
   * Merge social media stats with multi-month support
   */
  mergeSocialMediaStatsMultiMonth(targetBlock, sourceMetricsByReport, monthHeaders) {
    const targetMetrics = Array.isArray(targetBlock.metrics)
      ? targetBlock.metrics
      : targetBlock.metrics?.metrics || [];

    // Build month_values for each metric
    const mergedMetrics = targetMetrics.map((metric) => {
      const monthValues = [metric.current_value || 0];

      // Add values from each source report
      for (const sourceMetrics of sourceMetricsByReport) {
        const metrics = Array.isArray(sourceMetrics) ? sourceMetrics : [];
        const sourceMetric = metrics.find((m) => m.metric_name === metric.metric_name);
        monthValues.push(sourceMetric?.current_value || 0);
      }

      return {
        ...metric,
        prev_value: monthValues[1] || 0,
        month_values: monthValues,
      };
    });

    // Add metrics from source that don't exist in target
    const allSourceMetrics = sourceMetricsByReport.flat();
    for (const sourceMetric of allSourceMetrics) {
      const exists = mergedMetrics.some((m) => m.metric_name === sourceMetric.metric_name);
      if (!exists && sourceMetric.metric_name) {
        const monthValues = [0];
        for (const sourceMetrics of sourceMetricsByReport) {
          const metrics = Array.isArray(sourceMetrics) ? sourceMetrics : [];
          const m = metrics.find((x) => x.metric_name === sourceMetric.metric_name);
          monthValues.push(m?.current_value || 0);
        }

        mergedMetrics.push({
          metric_name: sourceMetric.metric_name,
          prev_value: monthValues[1] || 0,
          current_value: 0,
          change_percent: '0',
          change_indicator: '➡️',
          month_values: monthValues,
        });
      }
    }

    return {
      ...targetBlock,
      metrics: {
        platform: targetBlock.metrics?.platform || 'unknown',
        metrics: mergedMetrics,
        month_headers: monthHeaders,
      },
    };
  },

  /**
   * Create new social media stats block with multi-month data
   */
  createSocialMediaStatsMultiMonth(sourceBlock, sourceMetricsByReport, monthHeaders) {
    if (!sourceBlock.metrics) return null;

    const firstSourceMetrics = sourceMetricsByReport[0] || [];
    const metrics = Array.isArray(firstSourceMetrics) ? firstSourceMetrics : [];

    const newMetrics = metrics.map((metric) => {
      const monthValues = [0]; // Current month is empty

      for (const sourceMetrics of sourceMetricsByReport) {
        const m = Array.isArray(sourceMetrics)
          ? sourceMetrics.find((x) => x.metric_name === metric.metric_name)
          : null;
        monthValues.push(m?.current_value || 0);
      }

      return {
        metric_name: metric.metric_name,
        prev_value: monthValues[1] || 0,
        current_value: 0,
        change_percent: '0',
        change_indicator: '➡️',
        month_values: monthValues,
      };
    });

    return {
      __component: 'report-components.social-media-stats',
      metrics: {
        platform: sourceBlock.metrics.platform || 'unknown',
        metrics: newMetrics,
        month_headers: monthHeaders,
      },
      contentWidth: sourceBlock.contentWidth || 'w100',
    };
  },

  /**
   * Merge table data with multi-month support
   */
  mergeTableDataMultiMonth(targetBlock, sourceBlock, sourceRowsByReport, monthHeaders) {
    if (!targetBlock.rows) return targetBlock;

    // Build new headers: Metric | Month1 | Month2 | ... | Change
    const newHeaders = ['Метрика', ...monthHeaders, 'Изменение'];

    // Build rows with values from all months
    const newRows = targetBlock.rows.map((row) => {
      const metricName = row[0];
      const currentValue = row[row.length - 2] || row[1] || '';
      const newRow = [metricName, currentValue];

      // Add values from each source report
      for (const sourceRows of sourceRowsByReport) {
        const sourceRow = sourceRows.find((sr) => sr[0] === metricName);
        // Get the "current" value from source (typically column 2 for 4-column tables)
        newRow.push(sourceRow?.[2] || sourceRow?.[1] || '');
      }

      // Add change column
      newRow.push(row[row.length - 1] || '');

      return newRow;
    });

    return {
      ...targetBlock,
      headers: newHeaders,
      rows: newRows,
    };
  },

  /**
   * Create new table data block with multi-month data
   */
  createTableDataMultiMonth(sourceBlock, sourceRowsByReport, monthHeaders) {
    if (!sourceBlock.headers || !sourceBlock.rows) return null;

    const newHeaders = ['Метрика', ...monthHeaders, 'Изменение'];

    const newRows = sourceBlock.rows.map((row) => {
      const metricName = row[0];
      const newRow = [metricName, '']; // Current month empty

      // Add values from each source report
      for (let i = 0; i < sourceRowsByReport.length; i++) {
        const sourceRows = sourceRowsByReport[i];
        const sourceRow = sourceRows.find((sr) => sr[0] === metricName);
        newRow.push(sourceRow?.[2] || sourceRow?.[1] || '');
      }

      newRow.push(''); // Change column empty

      return newRow;
    });

    return {
      __component: 'report-components.table-data',
      title: sourceBlock.title,
      headers: newHeaders,
      rows: newRows,
      totals: null,
      contentWidth: sourceBlock.contentWidth || 'w100',
    };
  },

  /**
   * Smart merge content blocks from source into target
   * - For blocks with prev/current: update prev from source's current
   * - For other blocks: add only if not exists
   */
  mergeContentBlocks(targetBlocks, sourceBlocks, targetDateFrom) {
    if (!Array.isArray(sourceBlocks) || sourceBlocks.length === 0) {
      return targetBlocks;
    }

    const result = [...targetBlocks];

    for (const sourceBlock of sourceBlocks) {
      const componentType = sourceBlock.__component;

      if (componentType === 'report-components.social-media-stats') {
        // Find matching block by platform
        const platform = sourceBlock.metrics?.platform;
        const existingIndex = result.findIndex(
          (b) => b.__component === componentType && b.metrics?.platform === platform
        );

        if (existingIndex >= 0) {
          // Update existing: merge prev values from source's current
          result[existingIndex] = this.mergeSocialMediaStats(result[existingIndex], sourceBlock);
        } else {
          // Create new block with prev from source's current
          const newBlock = this.copySocialMediaStats(sourceBlock);
          if (newBlock) result.push(newBlock);
        }
      } else if (componentType === 'report-components.table-data') {
        // Find matching block by title
        const existingIndex = result.findIndex(
          (b) => b.__component === componentType && b.title === sourceBlock.title
        );

        if (existingIndex >= 0) {
          // Update existing: merge prev values from source's current
          result[existingIndex] = this.mergeTableData(result[existingIndex], sourceBlock, targetDateFrom);
        } else {
          // Create new block with prev from source's current
          const newBlock = this.copyTableData(sourceBlock, targetDateFrom);
          if (newBlock) result.push(newBlock);
        }
      } else {
        // Other blocks: add only if not exists, copy structure but empty content
        const exists = result.some((b) => {
          if (b.__component !== componentType) return false;
          // Match by title if available
          if (sourceBlock.title && b.title) return b.title === sourceBlock.title;
          return false;
        });

        if (!exists) {
          const emptyBlock = this.copyBlockStructureEmpty(sourceBlock);
          if (emptyBlock) result.push(emptyBlock);
        }
      }
    }

    return result;
  },

  /**
   * Merge social media stats: update prev values from source's current
   */
  mergeSocialMediaStats(targetBlock, sourceBlock) {
    const targetMetrics = Array.isArray(targetBlock.metrics)
      ? targetBlock.metrics
      : targetBlock.metrics?.metrics || [];

    const sourceMetrics = Array.isArray(sourceBlock.metrics)
      ? sourceBlock.metrics
      : sourceBlock.metrics?.metrics || [];

    // Create a map of source metrics by name
    const sourceMap = new Map();
    sourceMetrics.forEach((m) => sourceMap.set(m.metric_name, m));

    // Update prev values in target metrics
    const mergedMetrics = targetMetrics.map((metric) => {
      const sourceMetric = sourceMap.get(metric.metric_name);
      if (sourceMetric) {
        return {
          ...metric,
          prev_value: sourceMetric.current_value || 0,
        };
      }
      return metric;
    });

    // Add metrics that exist in source but not in target
    sourceMetrics.forEach((sourceMetric) => {
      const exists = mergedMetrics.some((m) => m.metric_name === sourceMetric.metric_name);
      if (!exists) {
        mergedMetrics.push({
          metric_name: sourceMetric.metric_name,
          prev_value: sourceMetric.current_value || 0,
          current_value: 0,
          change_percent: 0,
          change_indicator: '➡️',
        });
      }
    });

    // Preserve structure
    if (targetBlock.metrics?.platform) {
      return {
        ...targetBlock,
        metrics: {
          platform: targetBlock.metrics.platform,
          metrics: mergedMetrics,
        },
      };
    }

    return {
      ...targetBlock,
      metrics: mergedMetrics,
    };
  },

  /**
   * Merge table data: update prev column from source's current column
   */
  mergeTableData(targetBlock, sourceBlock, targetDateFrom) {
    if (!targetBlock.rows || !sourceBlock.rows) return targetBlock;

    const targetRows = targetBlock.rows.map((row) => [...row]);
    const sourceRows = sourceBlock.rows;

    // For 4-column tables: update column 1 (prev) from source's column 2 (current)
    if (targetBlock.headers?.length === 4 && sourceBlock.headers?.length === 4) {
      // Match rows by first column (metric name)
      targetRows.forEach((row, i) => {
        const metricName = row[0];
        const sourceRow = sourceRows.find((sr) => sr[0] === metricName);
        if (sourceRow) {
          row[1] = sourceRow[2] || ''; // source current → target prev
        }
      });

      // Update headers with correct month names
      const newDate = new Date(targetDateFrom);
      const prevMonthDate = new Date(targetDateFrom);
      prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);

      const currentMonthName = newDate.toLocaleDateString('ru-RU', { month: 'long' });
      const prevMonthName = prevMonthDate.toLocaleDateString('ru-RU', { month: 'long' });
      const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

      const headers = [...targetBlock.headers];
      headers[1] = capitalize(prevMonthName);
      headers[2] = capitalize(currentMonthName);

      return {
        ...targetBlock,
        headers,
        rows: targetRows,
      };
    }

    return targetBlock;
  },

  /**
   * Copy block structure but empty the content (for text, images, etc.)
   */
  copyBlockStructureEmpty(sourceBlock) {
    const { id, ...blockWithoutId } = sourceBlock;
    const componentType = sourceBlock.__component;

    // Handle different block types
    if (componentType === 'report-components.text-block') {
      return {
        __component: componentType,
        title: sourceBlock.title || '',
        content: '', // Empty content
        contentWidth: sourceBlock.contentWidth || 'w100',
      };
    }

    if (componentType === 'report-components.image-section') {
      return {
        __component: componentType,
        title: sourceBlock.title || '',
        // Don't copy image/media - leave empty
        contentWidth: sourceBlock.contentWidth || 'w100',
      };
    }

    if (componentType === 'report-components.analysis-block') {
      return {
        __component: componentType,
        title: sourceBlock.title || '',
        content: '', // Empty content
        contentWidth: sourceBlock.contentWidth || 'w100',
      };
    }

    if (componentType === 'report-components.chart-block') {
      return {
        __component: componentType,
        title: sourceBlock.title || '',
        // Empty chart data
        contentWidth: sourceBlock.contentWidth || 'w100',
      };
    }

    if (componentType === 'report-components.section') {
      return {
        __component: componentType,
        title: sourceBlock.title || '',
        contentWidth: sourceBlock.contentWidth || 'w100',
      };
    }

    if (componentType === 'report-components.metric-group') {
      return {
        __component: componentType,
        title: sourceBlock.title || '',
        // Empty metrics
        contentWidth: sourceBlock.contentWidth || 'w100',
      };
    }

    // Generic fallback: copy only __component, title, and contentWidth
    return {
      __component: componentType,
      title: sourceBlock.title || '',
      contentWidth: sourceBlock.contentWidth || 'w100',
    };
  },

  /**
   * Copy content blocks from source (legacy method, kept for compatibility)
   */
  copyContentBlocks(sourceReport, targetDateFrom) {
    if (!sourceReport.content_blocks || !Array.isArray(sourceReport.content_blocks)) {
      return [];
    }

    const copiedBlocks = [];

    for (const block of sourceReport.content_blocks) {
      if (block.__component === 'report-components.social-media-stats') {
        const copied = this.copySocialMediaStats(block);
        if (copied) copiedBlocks.push(copied);
      } else if (block.__component === 'report-components.table-data') {
        const copied = this.copyTableData(block, targetDateFrom);
        if (copied) copiedBlocks.push(copied);
      } else {
        // Copy other block types as-is (text, images, etc.)
        const { id, ...blockWithoutId } = block;
        copiedBlocks.push(blockWithoutId);
      }
    }

    return copiedBlocks;
  },

  /**
   * Copy social media stats block
   */
  copySocialMediaStats(sourceBlock) {
    if (!sourceBlock.metrics) return null;

    const sourceMetrics = Array.isArray(sourceBlock.metrics)
      ? sourceBlock.metrics
      : sourceBlock.metrics.metrics;

    if (!Array.isArray(sourceMetrics)) return null;

    const copiedMetrics = sourceMetrics.map((metric) => ({
      metric_name: metric.metric_name,
      prev_value: metric.current_value || 0,
      current_value: 0,
      change_percent: 0,
      change_indicator: '➡️',
    }));

    if (sourceBlock.metrics.platform) {
      return {
        __component: 'report-components.social-media-stats',
        metrics: {
          platform: sourceBlock.metrics.platform,
          metrics: copiedMetrics,
        },
        contentWidth: sourceBlock.contentWidth || 'w100',
      };
    }

    return {
      __component: 'report-components.social-media-stats',
      metrics: copiedMetrics,
      contentWidth: sourceBlock.contentWidth || 'w100',
    };
  },

  /**
   * Copy table data block
   */
  copyTableData(sourceBlock, targetDateFrom) {
    if (!sourceBlock.headers || !sourceBlock.rows) return null;

    const headers = [...sourceBlock.headers];
    const rows = sourceBlock.rows.map((row) => [...row]);
    const totals = sourceBlock.totals ? sourceBlock.totals.map((row) => [...row]) : null;

    if (headers.length === 4) {
      const newDate = new Date(targetDateFrom);
      const prevMonthDate = new Date(targetDateFrom);
      prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);

      const currentMonthName = newDate.toLocaleDateString('ru-RU', { month: 'long' });
      const prevMonthName = prevMonthDate.toLocaleDateString('ru-RU', { month: 'long' });

      const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

      headers[1] = capitalize(prevMonthName);
      headers[2] = capitalize(currentMonthName);

      const newRows = rows.map((row) => {
        const newRow = [...row];
        newRow[1] = row[2] || '';
        newRow[2] = '';
        newRow[3] = '';
        return newRow;
      });

      let newTotals = null;
      if (totals && totals[0]) {
        newTotals = totals.map((row) => {
          const newRow = [...row];
          if (newRow.length >= 4) {
            newRow[1] = row[2] || '';
            newRow[2] = '';
            newRow[3] = '';
          }
          return newRow;
        });
      }

      return {
        __component: 'report-components.table-data',
        title: sourceBlock.title,
        headers,
        rows: newRows,
        totals: newTotals,
        contentWidth: sourceBlock.contentWidth || 'w100',
      };
    }

    return {
      __component: 'report-components.table-data',
      title: sourceBlock.title,
      headers: sourceBlock.headers,
      rows: sourceBlock.rows,
      totals: sourceBlock.totals,
      contentWidth: sourceBlock.contentWidth || 'w100',
    };
  },
}));
