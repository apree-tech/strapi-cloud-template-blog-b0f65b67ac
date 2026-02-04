'use strict';

const ANALYTICS_API_URL = process.env.ANALYTICS_API_URL || 'http://91.184.253.146:3010';

module.exports = {
  // Get revenue by model name directly
  async getModelRevenue(ctx) {
    const { name, month, year } = ctx.query;

    if (!name) {
      return ctx.badRequest('Model name is required');
    }

    try {
      const params = new URLSearchParams({ name });
      if (month !== undefined) params.append('month', month);
      if (year !== undefined) params.append('year', year);

      const response = await fetch(`${ANALYTICS_API_URL}/api/revenue/model?${params}`);

      if (!response.ok) {
        strapi.log.error(`[Revenue Proxy] Analytics API error: ${response.status}`);
        return ctx.internalServerError('Analytics API unavailable');
      }

      const data = await response.json();
      return data;

    } catch (error) {
      strapi.log.error('[Revenue Proxy] Error:', error);
      return ctx.internalServerError('Failed to fetch revenue data');
    }
  },

  // Get revenue by report documentId (auto-detect model from report)
  async getReportRevenue(ctx) {
    const { documentId } = ctx.params;
    const { month, year } = ctx.query;

    if (!documentId) {
      return ctx.badRequest('Report documentId is required');
    }

    try {
      // Get report with model relation
      const reports = await strapi.entityService.findMany('api::report.report', {
        filters: { documentId },
        populate: ['model'],
        limit: 1,
      });

      const report = reports[0];

      if (!report) {
        return ctx.notFound('Report not found');
      }

      if (!report.model) {
        return { success: false, error: 'Модель не выбрана в отчёте' };
      }

      const modelName = report.model.name;
      strapi.log.info(`[Revenue Proxy] Found model "${modelName}" for report ${documentId}`);

      // Determine month/year from report's dateFrom or query params
      let targetMonth = month;
      let targetYear = year;

      if (targetMonth === undefined || targetYear === undefined) {
        if (report.dateFrom) {
          const date = new Date(report.dateFrom);
          targetMonth = date.getMonth();
          targetYear = date.getFullYear();
        } else {
          // Default to previous month
          const now = new Date();
          targetMonth = now.getMonth() - 1;
          targetYear = now.getFullYear();
          if (targetMonth < 0) {
            targetMonth = 11;
            targetYear -= 1;
          }
        }
      }

      // Fetch from analytics API
      const params = new URLSearchParams({
        name: modelName,
        month: targetMonth.toString(),
        year: targetYear.toString(),
      });

      const response = await fetch(`${ANALYTICS_API_URL}/api/revenue/model?${params}`);

      if (!response.ok) {
        strapi.log.error(`[Revenue Proxy] Analytics API error: ${response.status}`);
        return ctx.internalServerError('Analytics API unavailable');
      }

      const data = await response.json();
      return data;

    } catch (error) {
      strapi.log.error('[Revenue Proxy] Error:', error);
      return ctx.internalServerError('Failed to fetch revenue data');
    }
  },
};
