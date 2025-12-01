module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/get-report',
      handler: 'get-report.getReport',
      config: {
        auth: false,
      },
    },
  ],
};
