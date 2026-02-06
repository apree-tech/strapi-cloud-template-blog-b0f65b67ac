'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/report-versions/:reportId',
      handler: 'report-version.getVersions',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/report-versions/version/:versionId',
      handler: 'report-version.getVersion',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/report-versions/restore',
      handler: 'report-version.restoreVersion',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/report-versions/:reportId/diff/:versionId',
      handler: 'report-version.getDiffWithCurrent',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/report-versions/compare/:versionId1/:versionId2',
      handler: 'report-version.compareTwoVersions',
      config: {
        auth: false,
        policies: [],
      },
    },
  ],
};
