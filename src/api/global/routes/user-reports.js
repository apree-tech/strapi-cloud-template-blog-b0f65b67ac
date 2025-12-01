module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/user-reports',
      handler: 'user-reports.getUserReports',
      config: {
        auth: false,
      },
    },
  ],
};
