'use strict';

/**
 * Head PM Stats Controller
 * Returns aggregated statistics for all models
 */

// Helper to extract social media growth from content blocks
const extractSocialStats = (contentBlocks, modelName = '') => {
  const socialStats = {
    twitter: null,
    reddit: null,
  };

  if (!contentBlocks || !Array.isArray(contentBlocks)) {
    return socialStats;
  }

  for (const block of contentBlocks) {
    // Check for social-media-stats component
    if (block.__component === 'report-components.social-media-stats' && block.metrics) {
      const metricsData = typeof block.metrics === 'string'
        ? JSON.parse(block.metrics)
        : block.metrics;

      const platform = (metricsData.platform || '').toLowerCase();
      const metrics = metricsData.metrics || [];

      // Find "Подписчики" metric - check both "metric_name" and "name" fields
      const followersMetric = metrics.find(m => {
        const metricName = (m.metric_name || m.name || '').toLowerCase();
        return metricName.includes('подписчик') || metricName.includes('follower');
      });

      if (followersMetric) {
        // Support both data formats:
        // 1. New format: prev_value, current_value
        // 2. Old format: month_values array
        let change = null;

        if (followersMetric.prev_value !== undefined && followersMetric.current_value !== undefined) {
          const current = Number(followersMetric.current_value) || 0;
          const prev = Number(followersMetric.prev_value) || 0;
          change = prev > 0 ? Math.round(((current - prev) / prev) * 1000) / 10 : 0;
        } else if (followersMetric.month_values && followersMetric.month_values.length >= 2) {
          const current = Number(followersMetric.month_values[0]) || 0;
          const prev = Number(followersMetric.month_values[1]) || 0;
          change = prev > 0 ? Math.round(((current - prev) / prev) * 1000) / 10 : 0;
        }

        if (change !== null) {
          if (platform === 'twitter' || platform === 'x') {
            socialStats.twitter = change;
          } else if (platform === 'reddit') {
            socialStats.reddit = change;
          }
        }
      }
    }
  }

  return socialStats;
};

// Helper to check if report falls within a month
const isReportInMonth = (report, targetMonth, targetYear) => {
  // Use dateTo as the primary date (end of report period)
  const reportDate = new Date(report.dateTo || report.createdAt);
  return reportDate.getMonth() === targetMonth && reportDate.getFullYear() === targetYear;
};

// Helper to get previous month
const getPreviousMonth = (month, year) => {
  if (month === 0) {
    return { month: 11, year: year - 1 };
  }
  return { month: month - 1, year: year };
};

// Helper to get next month
const getNextMonth = (month, year) => {
  if (month === 11) {
    return { month: 0, year: year + 1 };
  }
  return { month: month + 1, year: year };
};

// Get deadline date for a report period (8th of following month at 23:59:59)
const getDeadlineDate = (reportMonth, reportYear) => {
  const next = getNextMonth(reportMonth, reportYear);
  return new Date(next.year, next.month, 8, 23, 59, 59);
};

module.exports = {
  async getStats(ctx) {
    try {
      // Get query parameters for month filtering
      const { month: queryMonth, year: queryYear } = ctx.query;

      // Default to previous month
      const now = new Date();
      const defaultPrev = getPreviousMonth(now.getMonth(), now.getFullYear());

      const targetMonth = queryMonth !== undefined ? parseInt(queryMonth, 10) : defaultPrev.month;
      const targetYear = queryYear !== undefined ? parseInt(queryYear, 10) : defaultPrev.year;

      // Calculate previous month for comparison
      const prevPeriod = getPreviousMonth(targetMonth, targetYear);

      strapi.log.info(`[Head PM Stats] Fetching stats for ${targetMonth + 1}/${targetYear}, comparing with ${prevPeriod.month + 1}/${prevPeriod.year}`);

      // Get all models with their reports
      const models = await strapi.db.query('api::model.model').findMany({
        populate: {
          reports: {
            populate: {
              content_blocks: {
                populate: {
                  metrics: true,
                },
              },
            },
          },
        },
      });

      // Calculate stats
      let totalRevenue = 0;
      let prevTotalRevenue = 0;
      let totalModels = models.length;
      let activeModels = 0;
      let reportsPublished = 0;
      let reportsDraft = 0;
      let lateReportsCount = 0;
      const deadlineDate = getDeadlineDate(targetMonth, targetYear);
      const modelStats = [];

      for (const model of models) {
        let modelRevenue = 0;
        let modelPrevRevenue = 0;
        let targetReport = null; // Report for the selected month
        let hasReportsInPeriod = false;

        if (model.reports && model.reports.length > 0) {
          for (const report of model.reports) {
            const reportDate = new Date(report.dateTo || report.createdAt);
            const reportMonth = reportDate.getMonth();
            const reportYear = reportDate.getFullYear();

            // Check if report is in target month
            if (reportMonth === targetMonth && reportYear === targetYear) {
              hasReportsInPeriod = true;
              targetReport = report;

              // Count reports by status for target month
              if (report.publishedAt) {
                reportsPublished++;
                // Check if report was published after the deadline
                const publishedDate = new Date(report.publishedAt);
                if (publishedDate > deadlineDate) {
                  lateReportsCount++;
                }
              } else {
                reportsDraft++;
              }

              // Find revenue in content_blocks
              if (report.content_blocks && Array.isArray(report.content_blocks)) {
                for (const block of report.content_blocks) {
                  if (block.__component === 'report-components.metric-group' && block.metrics) {
                    for (const metric of block.metrics) {
                      const metricName = (metric.name || '').toLowerCase();
                      if (metricName.includes('оборот') || metricName.includes('revenue')) {
                        const value = metric.value_number || parseFloat(String(metric.value).replace(/\s/g, '').replace(',', '.')) || 0;
                        modelRevenue += value;
                      }
                    }
                  }
                }
              }
            }

            // Check if report is in previous month (for growth calculation)
            if (reportMonth === prevPeriod.month && reportYear === prevPeriod.year) {
              if (report.content_blocks && Array.isArray(report.content_blocks)) {
                for (const block of report.content_blocks) {
                  if (block.__component === 'report-components.metric-group' && block.metrics) {
                    for (const metric of block.metrics) {
                      const metricName = (metric.name || '').toLowerCase();
                      if (metricName.includes('оборот') || metricName.includes('revenue')) {
                        const value = metric.value_number || parseFloat(String(metric.value).replace(/\s/g, '').replace(',', '.')) || 0;
                        modelPrevRevenue += value;
                      }
                    }
                  }
                }
              }
            }
          }

          if (hasReportsInPeriod) {
            activeModels++;
          }
        }

        totalRevenue += modelRevenue;
        prevTotalRevenue += modelPrevRevenue;

        // Extract social media stats from target month report
        const socialStats = targetReport
          ? extractSocialStats(targetReport.content_blocks, model.name)
          : { twitter: null, reddit: null };

        // Determine report status for target month
        let reportStatus = 'none'; // no reports
        if (targetReport) {
          reportStatus = targetReport.publishedAt ? 'published' : 'draft';
        }

        const growth = modelPrevRevenue > 0
          ? ((modelRevenue - modelPrevRevenue) / modelPrevRevenue) * 100
          : 0;

        modelStats.push({
          id: model.id,
          documentId: model.documentId,
          name: model.name,
          revenue: modelRevenue,
          prevRevenue: modelPrevRevenue,
          growth: Math.round(growth * 10) / 10,
          reportsCount: model.reports ? model.reports.length : 0,
          reportStatus: reportStatus,
          reportDocumentId: targetReport ? targetReport.uuid : null,
          twitter: socialStats.twitter,
          reddit: socialStats.reddit,
        });
      }

      // Calculate overall revenue change
      const revenueChange = prevTotalRevenue > 0
        ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100
        : 0;

      // Calculate average growth
      const modelsWithGrowth = modelStats.filter(m => m.prevRevenue > 0);
      const avgGrowth = modelsWithGrowth.length > 0
        ? modelsWithGrowth.reduce((sum, m) => sum + m.growth, 0) / modelsWithGrowth.length
        : 0;

      // Sort models by revenue
      modelStats.sort((a, b) => b.revenue - a.revenue);

      // Get top 5 by growth and bottom 5 by decline
      const sortedByGrowth = [...modelStats].sort((a, b) => b.growth - a.growth);
      const topGrowth = sortedByGrowth.filter(m => m.growth > 0).slice(0, 5);
      const bottomGrowth = sortedByGrowth.filter(m => m.growth < 0).slice(-5).reverse();

      // Calculate late reports for past periods
      // Late = models without on-time published reports (includes: late published + drafts + no report)
      const isPastDeadline = now > deadlineDate;

      // Count reports that were published ON TIME (before deadline)
      let onTimeReports = 0;
      for (const model of models) {
        if (model.reports && model.reports.length > 0) {
          for (const report of model.reports) {
            const reportDate = new Date(report.dateTo || report.createdAt);
            if (reportDate.getMonth() === targetMonth && reportDate.getFullYear() === targetYear) {
              if (report.publishedAt) {
                const publishedDate = new Date(report.publishedAt);
                if (publishedDate <= deadlineDate) {
                  onTimeReports++;
                }
              }
              break; // Only count one report per model for target month
            }
          }
        }
      }

      // If past deadline: late = total models - on-time reports
      // If before deadline: late = 0 (still time to submit)
      const finalLateCount = isPastDeadline ? Math.max(0, totalModels - onTimeReports) : 0;

      return {
        period: {
          month: targetMonth,
          year: targetYear,
        },
        stats: {
          totalRevenue,
          prevTotalRevenue,
          revenueChange: Math.round(revenueChange * 10) / 10,
          totalModels,
          activeModels,
          avgGrowth: Math.round(avgGrowth * 10) / 10,
          reportsPublished,
          reportsDraft,
          lateReportsCount: finalLateCount,
        },
        models: modelStats,
        topGrowth,
        bottomGrowth,
      };

    } catch (error) {
      strapi.log.error('[Head PM Stats] Error:', error);
      return ctx.internalServerError('Failed to get stats: ' + error.message);
    }
  },
};
