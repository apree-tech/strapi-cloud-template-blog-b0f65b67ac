module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/migrate-table-data',
      handler: 'migrate-table-data.migrate',
      config: {
        auth: false, // Uses secret key instead
      },
    },
  ],
};
