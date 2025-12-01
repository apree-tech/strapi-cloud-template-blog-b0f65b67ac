module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/verify-report-access',
      handler: 'verify-report-access.verifyAccess',
      config: {
        auth: false,
      },
    },
  ],
};
