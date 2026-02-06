'use strict';

const telegramService = require('../../../../services/telegram');

/**
 * Calculate change percentage
 */
const calculateChangePercent = (prevValue, currentValue) => {
  const prev = Number(prevValue) || 0;
  const current = Number(currentValue) || 0;

  if (prev === 0) {
    return current > 0 ? 100 : 0;
  }

  const change = ((current - prev) / prev) * 100;
  return Math.round(change * 10) / 10; // Round to 1 decimal
};

/**
 * Get change indicator emoji
 */
const getChangeIndicator = (changePercent) => {
  if (changePercent > 0) return '📈';
  if (changePercent < 0) return '📉';
  return '➡️';
};

/**
 * Process social media stats in content_blocks
 */
const processSocialMediaStats = (data) => {
  if (!data.content_blocks || !Array.isArray(data.content_blocks)) {
    return data;
  }

  data.content_blocks = data.content_blocks.map((block) => {
    // Check if this is a social-media-stats component
    if (block.__component === 'report-components.social-media-stats' && block.metrics) {
      const metrics = Array.isArray(block.metrics) ? block.metrics : block.metrics.metrics;
      if (Array.isArray(metrics)) {
        const processedMetrics = metrics.map((metric) => {
          const changePercent = calculateChangePercent(metric.prev_value, metric.current_value);
          return {
            ...metric,
            change_percent: changePercent,
            change_indicator: getChangeIndicator(changePercent),
          };
        });

        // Preserve structure
        if (block.metrics.platform) {
          block.metrics = {
            platform: block.metrics.platform,
            metrics: processedMetrics,
          };
        } else {
          block.metrics = processedMetrics;
        }
      }
    }
    return block;
  });

  return data;
};

/**
 * Get previous month date from a given date
 */
const getPreviousMonthDate = (dateFrom) => {
  const date = new Date(dateFrom);
  date.setMonth(date.getMonth() - 1);
  return date;
};

/**
 * Find previous report for the same model
 */
const findPreviousReport = async (strapi, modelId, dateFrom) => {
  if (!modelId || !dateFrom) {
    return null;
  }

  const prevMonthDate = getPreviousMonthDate(dateFrom);
  const prevYear = prevMonthDate.getFullYear();
  const prevMonth = prevMonthDate.getMonth(); // 0-indexed

  // Find reports for the same model in the previous month
  const reports = await strapi.entityService.findMany('api::report.report', {
    filters: {
      model: modelId,
    },
    populate: ['content_blocks'],
  });

  // Filter to find report from previous month
  const previousReport = reports.find((report) => {
    if (!report.dateFrom) return false;
    const reportDate = new Date(report.dateFrom);
    return (
      reportDate.getFullYear() === prevYear &&
      reportDate.getMonth() === prevMonth
    );
  });

  return previousReport || null;
};

/**
 * Copy current values to prev values for social-media-stats
 */
const copySocialMediaStats = (sourceBlock) => {
  if (!sourceBlock.metrics) return null;

  const sourceMetrics = Array.isArray(sourceBlock.metrics)
    ? sourceBlock.metrics
    : sourceBlock.metrics.metrics;

  if (!Array.isArray(sourceMetrics)) return null;

  const copiedMetrics = sourceMetrics.map((metric) => ({
    metric_name: metric.metric_name,
    prev_value: metric.current_value || 0, // Copy current → prev
    current_value: 0, // Clear current for new data
    change_percent: 0,
    change_indicator: '➡️',
  }));

  // Preserve platform structure
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
};

/**
 * Copy table-data with shifted columns (current → prev)
 * Assumes structure: [Metric, PrevMonth, CurrentMonth, Change]
 */
const copyTableData = (sourceBlock, newDateFrom) => {
  if (!sourceBlock.headers || !sourceBlock.rows) return null;

  const headers = [...sourceBlock.headers];
  const rows = sourceBlock.rows.map((row) => [...row]);
  const totals = sourceBlock.totals
    ? sourceBlock.totals.map((row) => [...row])
    : null;

  // If table has 4 columns: [Name, Prev, Current, Change]
  // Shift: Current → Prev, clear Current and Change
  if (headers.length === 4) {
    // Update header names with new month names
    const newDate = new Date(newDateFrom);
    const prevMonthDate = getPreviousMonthDate(newDateFrom);

    const currentMonthName = newDate.toLocaleDateString('ru-RU', { month: 'long' });
    const prevMonthName = prevMonthDate.toLocaleDateString('ru-RU', { month: 'long' });

    // Capitalize first letter
    const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

    headers[1] = capitalize(prevMonthName);
    headers[2] = capitalize(currentMonthName);
    // headers[3] stays as "Изменение" or similar

    // Shift row values: column[2] → column[1], clear column[2] and column[3]
    const newRows = rows.map((row) => {
      const newRow = [...row];
      newRow[1] = row[2] || ''; // Current → Prev
      newRow[2] = ''; // Clear current
      newRow[3] = ''; // Clear change
      return newRow;
    });

    // Same for totals
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

  // For other column structures, just copy as-is
  return {
    __component: 'report-components.table-data',
    title: sourceBlock.title,
    headers: sourceBlock.headers,
    rows: sourceBlock.rows,
    totals: sourceBlock.totals,
    contentWidth: sourceBlock.contentWidth || 'w100',
  };
};

/**
 * Copy content blocks from previous report
 */
const copyContentBlocksFromPrevious = (previousReport, newDateFrom) => {
  if (!previousReport.content_blocks || !Array.isArray(previousReport.content_blocks)) {
    return [];
  }

  const copiedBlocks = [];

  for (const block of previousReport.content_blocks) {
    if (block.__component === 'report-components.social-media-stats') {
      const copied = copySocialMediaStats(block);
      if (copied) copiedBlocks.push(copied);
    } else if (block.__component === 'report-components.table-data') {
      const copied = copyTableData(block, newDateFrom);
      if (copied) copiedBlocks.push(copied);
    }
    // Other block types are not copied (text, images, etc.)
  }

  return copiedBlocks;
};

module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;

    // Process social media stats calculations
    event.params.data = processSocialMediaStats(data);

    // Auto-copy from previous report if no content_blocks provided
    const hasContentBlocks = data.content_blocks && data.content_blocks.length > 0;

    if (!hasContentBlocks && data.model && data.dateFrom) {
      try {
        const modelId = typeof data.model === 'object' ? data.model.id : data.model;
        const previousReport = await findPreviousReport(strapi, modelId, data.dateFrom);

        if (previousReport) {
          const copiedBlocks = copyContentBlocksFromPrevious(previousReport, data.dateFrom);

          if (copiedBlocks.length > 0) {
            event.params.data.content_blocks = copiedBlocks;

            // Store reference to source report for notification
            event.state = event.state || {};
            event.state.copiedFromReport = {
              id: previousReport.id,
              title: previousReport.title,
              dateFrom: previousReport.dateFrom,
            };

            strapi.log.info(
              `Auto-copied ${copiedBlocks.length} blocks from report "${previousReport.title}" (ID: ${previousReport.id})`
            );
          }
        } else {
          strapi.log.info(
            `No previous report found for model ${modelId} before ${data.dateFrom}`
          );
        }
      } catch (error) {
        strapi.log.error('Error auto-copying from previous report:', error);
      }
    }
  },

  async afterCreate(event) {
    const { result } = event;

    // Log notification about copied data
    if (event.state?.copiedFromReport) {
      const source = event.state.copiedFromReport;
      const sourceDate = new Date(source.dateFrom);
      const monthName = sourceDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

      strapi.log.info(
        `📋 Данные прошлого месяца скопированы из отчёта за ${monthName}`
      );
    }

    // Send notification if created as published
    if (result.publishedAt && !result.telegram_notified) {
      strapi.log.info(`[Telegram] afterCreate: report created as published, checking model...`);
      try {
        const report = await strapi.entityService.findOne(
          'api::report.report',
          result.id,
          { populate: ['model'] }
        );

        if (report?.model?.telegram) {
          strapi.log.info(`[Telegram] Sending notification from afterCreate for model: ${report.model.name}`);
          const sent = await telegramService.notifyModelAboutReport(report.model, {
            title: result.title,
            dateFrom: result.dateFrom,
            uuid: result.uuid,
          });

          if (sent) {
            await strapi.entityService.update('api::report.report', result.id, {
              data: { telegram_notified: true },
            });
          }
        }
      } catch (error) {
        strapi.log.error('[Telegram] afterCreate error:', error);
      }
    }
  },

  async beforeUpdate(event) {
    const { data, where } = event.params;
    event.params.data = processSocialMediaStats(data);

    // Check if report is being published
    if (data.publishedAt) {
      try {
        const currentReport = await strapi.entityService.findOne(
          'api::report.report',
          where.id,
          { populate: ['model'] }
        );

        strapi.log.info(`[Telegram] beforeUpdate: publishedAt=${data.publishedAt}, telegram_notified=${currentReport?.telegram_notified}, model=${currentReport?.model?.name}`);

        // Send notification if not already sent
        if (currentReport && !currentReport.telegram_notified && currentReport.model) {
          event.state = event.state || {};
          event.state.isBeingPublished = true;
          event.state.model = currentReport.model;
          event.state.reportTitle = currentReport.title || data.title;
          event.state.reportDateFrom = currentReport.dateFrom || data.dateFrom;
          strapi.log.info(`[Telegram] Will send notification for model: ${currentReport.model.name}`);
        }
      } catch (error) {
        strapi.log.error('Error checking publication state:', error);
      }
    }
  },

  async afterUpdate(event) {
    const { result, params } = event;

    // Create version on manual save (not on publish-only updates)
    // Skip if this is just a telegram_notified flag update
    if (result.documentId && !params.data?.telegram_notified) {
      try {
        const versionService = strapi.service('api::report-version.report-version');
        if (versionService) {
          // Get user info from context if available
          const userId = strapi.requestContext?.get()?.state?.user?.id || 0;
          const userName = strapi.requestContext?.get()?.state?.user?.firstname || 'System';

          const version = await versionService.createVersion(
            result.documentId,
            [userId],
            userName,
            false // isAutoSave = false for manual saves
          );

          if (version) {
            strapi.log.info(`[Version] Created manual version ${version.version_number} for report ${result.documentId}`);
          }
        }
      } catch (error) {
        strapi.log.error('[Version] Error creating version on save:', error);
      }
    }

    // Send Telegram notification if report was just published
    // First check if beforeUpdate set the state
    let model = event.state?.model;
    let shouldNotify = event.state?.isBeingPublished;

    // Fallback: check directly if published and notification not sent
    if (!shouldNotify && result.publishedAt && !result.telegram_notified && !params.data?.telegram_notified) {
      strapi.log.info(`[Telegram] afterUpdate fallback check: publishedAt=${result.publishedAt}`);
      try {
        const report = await strapi.entityService.findOne(
          'api::report.report',
          result.id,
          { populate: ['model'] }
        );
        if (report?.model?.telegram) {
          model = report.model;
          shouldNotify = true;
          strapi.log.info(`[Telegram] Fallback: found model ${model.name} with telegram ${model.telegram}`);
        }
      } catch (err) {
        strapi.log.error('[Telegram] Fallback check error:', err);
      }
    }

    if (shouldNotify && model) {
      strapi.log.info(
        `[Telegram] Sending notification: "${result.title}" for model "${model.name}"`
      );

      // Send Telegram notification
      try {
        const sent = await telegramService.notifyModelAboutReport(model, {
          title: result.title,
          dateFrom: result.dateFrom,
          uuid: result.uuid,
        });

        // Mark as notified to prevent duplicate notifications
        if (sent) {
          await strapi.entityService.update('api::report.report', result.id, {
            data: { telegram_notified: true },
          });
          strapi.log.info(`Marked report ${result.id} as telegram_notified`);
        }
      } catch (error) {
        strapi.log.error('Failed to send Telegram notification:', error);
      }
    }
  },
};
