module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/head-pm/stats',
      handler: 'head-pm-stats.getStats',
      config: {
        auth: false, // Protected by JWT in production
      },
    },
  ],
};
