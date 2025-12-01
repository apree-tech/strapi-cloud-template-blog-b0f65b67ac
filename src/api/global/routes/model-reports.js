module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/model-reports',
      handler: 'model-reports.getModelReports',
      config: {
        auth: false,
      },
    },
  ],
};
