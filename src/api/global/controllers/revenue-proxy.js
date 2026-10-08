'use strict';

const ANALYTICS_API_URL = process.env.ANALYTICS_API_URL || 'https://models-revenue.apree-tech.com';
// models-revenue-api now requires a shared internal key — set ANALYTICS_INTERNAL_KEY
// in the Strapi Cloud env (same value as CRM_INTERNAL_KEY on the other services).
const ANALYTICS_HEADERS = { 'X-Internal-Key': process.env.ANALYTICS_INTERNAL_KEY || '' };

module.exports = {
  // Get revenue by model name directly
  async getModelRevenue(ctx) {
    const { name, month, year, dateFrom, dateTo } = ctx.query;

    if (!name) {
      return ctx.badRequest('Model name is required');
    }

    try {
      const params = new URLSearchParams({ name });
      if (month !== undefined) params.append('month', month);
      if (year !== undefined) params.append('year', year);
      if (dateFrom !== undefined) params.append('dateFrom', dateFrom);
      if (dateTo !== undefined) params.append('dateTo', dateTo);

      const response = await fetch(`${ANALYTICS_API_URL}/api/revenue/model?${params}`, { headers: ANALYTICS_HEADERS });

      if (response.status === 400) {
        const data = await response.json();
        return ctx.badRequest(data.error || 'Некорректный период');
      }
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

    strapi.log.info(`[Revenue Proxy] === Request received for documentId: ${documentId} ===`);

    if (!documentId) {
      return ctx.badRequest('Report documentId is required');
    }

    try {
      strapi.log.info('[Revenue Proxy] Fetching report from DB...');
      // Get report with model relation
      const report = await strapi.documents('api::report.report').findOne({
        documentId,
        status: 'draft',
        populate: ['model'],
      });

      if (!report) {
        return ctx.notFound('Report not found');
      }

      if (!report.model) {
        return { success: false, error: 'Модель не выбрана в отчёте' };
      }

      const modelName = report.model.name;
      strapi.log.info(`[Revenue Proxy] Found model "${modelName}" for report ${documentId}`);

      // Live form dates override saved dates. Explicit month/year remains supported.
      const params = new URLSearchParams({ name: modelName });
      if (ctx.query.dateFrom !== undefined || ctx.query.dateTo !== undefined) {
        params.set('dateFrom', ctx.query.dateFrom || '');
        params.set('dateTo', ctx.query.dateTo || '');
      } else if (month !== undefined || year !== undefined) {
        if (month !== undefined) params.set('month', month);
        if (year !== undefined) params.set('year', year);
      } else if (report.dateFrom || report.dateTo) {
        params.set('dateFrom', report.dateFrom || '');
        params.set('dateTo', report.dateTo || '');
      }

      strapi.log.info(`[Revenue Proxy] Calling analytics API: ${ANALYTICS_API_URL}/api/revenue/model?${params}`);
      const response = await fetch(`${ANALYTICS_API_URL}/api/revenue/model?${params}`, { headers: ANALYTICS_HEADERS });

      if (response.status === 400) {
        const data = await response.json();
        return ctx.badRequest(data.error || 'Некорректный период');
      }
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
