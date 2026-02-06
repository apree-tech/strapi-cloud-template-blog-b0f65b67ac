module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/revenue/model',
      handler: 'revenue-proxy.getModelRevenue',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/revenue/report/:documentId',
      handler: 'revenue-proxy.getReportRevenue',
      config: {
        auth: false,
        policies: [],
      },
    },
  ],
};
