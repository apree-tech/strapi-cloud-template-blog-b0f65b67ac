'use strict';

module.exports = {
  register({ strapi }) {
    strapi.log.info('[Collaborative Editing] Plugin registered');
  },

  bootstrap({ strapi }) {
    strapi.log.info('[Collaborative Editing] Plugin bootstrapped');

    // Set up periodic cleanup of stale sessions
    setInterval(async () => {
      try {
        const collaborativeService = strapi.service('api::collaborative.collaborative');
        if (collaborativeService) {
          const cleaned = await collaborativeService.cleanupStaleSessions();
          if (cleaned > 0) {
            strapi.log.info(`[Collaborative Editing] Cleaned up ${cleaned} stale sessions`);
          }
        }
      } catch (error) {
        strapi.log.error('[Collaborative Editing] Error during session cleanup:', error);
      }
    }, 60000); // Every minute
  },
};
