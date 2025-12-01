module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/all-reports',
      handler: 'all-reports.getAllReports',
      config: {
        auth: false,
      },
    },
  ],
};
