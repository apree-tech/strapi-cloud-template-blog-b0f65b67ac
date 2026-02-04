'use strict';

/**
 * Report Comment Controller
 */

const { verifyToken } = require('../../../middlewares/jwt');

/**
 * Get user from either custom JWT or Strapi Admin session
 * Supports both external API calls and admin panel calls
 */
const getAuthUser = async (ctx) => {
  // First try custom JWT token
  const token = ctx.request.headers.authorization?.replace('Bearer ', '');
  if (token) {
    const jwtUser = verifyToken(token);
    if (jwtUser) {
      return jwtUser;
    }
  }

  // Then try Strapi Admin session (from admin panel)
  // The admin panel sends its token in the Authorization header
  if (ctx.state?.admin) {
    const adminUser = ctx.state.admin;
    return {
      id: adminUser.id,
      name: adminUser.firstname
        ? `${adminUser.firstname}${adminUser.lastname ? ' ' + adminUser.lastname : ''}`
        : adminUser.username || adminUser.email,
      email: adminUser.email,
      type: 'admin',
      isAdmin: true,
    };
  }

  // Try to verify the Bearer token as Strapi admin JWT
  if (token) {
    try {
      // Use Strapi's internal admin token service
      const tokenService = strapi.service('admin::token');
      if (tokenService?.decodeJwtToken) {
        const { payload, isValid } = tokenService.decodeJwtToken(token);
        if (isValid && payload?.id) {
          const fullAdminUser = await strapi.db.query('admin::user').findOne({
            where: { id: payload.id },
            select: ['id', 'firstname', 'lastname', 'username', 'email'],
          });
          if (fullAdminUser) {
            return {
              id: fullAdminUser.id,
              name: fullAdminUser.firstname
                ? `${fullAdminUser.firstname}${fullAdminUser.lastname ? ' ' + fullAdminUser.lastname : ''}`
                : fullAdminUser.username || fullAdminUser.email,
              email: fullAdminUser.email,
              type: 'admin',
              isAdmin: true,
            };
          }
        }
      }
    } catch (e) {
      // Not a valid Strapi admin token
      strapi.log.debug('[Comments] Admin token verification failed:', e.message);
    }
  }

  return null;
};

module.exports = {
  // GET /api/report-comments?reportId=xxx&fieldPath=xxx
  async find(ctx) {
    const user = await getAuthUser(ctx);

    if (!user) {
      return ctx.unauthorized('Invalid token');
    }

    const { reportId, fieldPath } = ctx.query;

    if (!reportId) {
      return ctx.badRequest('reportId is required');
    }

    try {
      const comments = await strapi.service('api::report-comment.report-comment')
        .getComments(reportId, fieldPath);
      return { data: comments };
    } catch (error) {
      strapi.log.error('[Report Comment] Error fetching comments:', error);
      return ctx.internalServerError('Failed to fetch comments');
    }
  },

  // POST /api/report-comments
  async create(ctx) {
    const user = await getAuthUser(ctx);

    if (!user) {
      return ctx.unauthorized('Invalid token');
    }

    const { reportId, fieldPath, content, parentCommentId } = ctx.request.body;

    if (!reportId || !content) {
      return ctx.badRequest('reportId and content are required');
    }

    try {
      const comment = await strapi.service('api::report-comment.report-comment')
        .createComment({ reportId, fieldPath, content, parentCommentId }, user);
      return { data: comment };
    } catch (error) {
      strapi.log.error('[Report Comment] Error creating comment:', error);
      return ctx.internalServerError('Failed to create comment');
    }
  },

  // PUT /api/report-comments/:id
  async update(ctx) {
    const user = await getAuthUser(ctx);

    if (!user) {
      return ctx.unauthorized('Invalid token');
    }

    const { id } = ctx.params;
    const { content } = ctx.request.body;

    if (!content) {
      return ctx.badRequest('content is required');
    }

    try {
      const comment = await strapi.service('api::report-comment.report-comment')
        .updateComment(parseInt(id), content, user.id);
      return { data: comment };
    } catch (error) {
      if (error.message === 'Comment not found') {
        return ctx.notFound('Comment not found');
      }
      if (error.message === 'Cannot edit other user comments') {
        return ctx.forbidden('Cannot edit other user comments');
      }
      strapi.log.error('[Report Comment] Error updating comment:', error);
      return ctx.internalServerError('Failed to update comment');
    }
  },

  // PUT /api/report-comments/:id/resolve
  async resolve(ctx) {
    const user = await getAuthUser(ctx);

    if (!user) {
      return ctx.unauthorized('Invalid token');
    }

    const { id } = ctx.params;

    try {
      const comment = await strapi.service('api::report-comment.report-comment')
        .resolveComment(parseInt(id), user.id);

      if (!comment) {
        return ctx.notFound('Comment not found');
      }

      return { data: comment };
    } catch (error) {
      strapi.log.error('[Report Comment] Error resolving comment:', error);
      return ctx.internalServerError('Failed to resolve comment');
    }
  },

  // PUT /api/report-comments/:id/unresolve
  async unresolve(ctx) {
    const user = await getAuthUser(ctx);

    if (!user) {
      return ctx.unauthorized('Invalid token');
    }

    const { id } = ctx.params;

    try {
      const comment = await strapi.service('api::report-comment.report-comment')
        .unresolveComment(parseInt(id));

      if (!comment) {
        return ctx.notFound('Comment not found');
      }

      return { data: comment };
    } catch (error) {
      strapi.log.error('[Report Comment] Error unresolving comment:', error);
      return ctx.internalServerError('Failed to unresolve comment');
    }
  },

  // DELETE /api/report-comments/:id
  async delete(ctx) {
    const user = await getAuthUser(ctx);

    if (!user) {
      return ctx.unauthorized('Invalid token');
    }

    const { id } = ctx.params;

    try {
      // Check if user can delete
      const comment = await strapi.db.query('api::report-comment.report-comment')
        .findOne({ where: { id: parseInt(id) } });

      if (!comment) {
        return ctx.notFound('Comment not found');
      }

      // Only owner, admin, or head_pm can delete
      if (comment.user_id !== user.id && !user.isAdmin && user.type !== 'head_pm') {
        return ctx.forbidden('Cannot delete other user comments');
      }

      await strapi.service('api::report-comment.report-comment').deleteComment(parseInt(id));

      return { success: true };
    } catch (error) {
      strapi.log.error('[Report Comment] Error deleting comment:', error);
      return ctx.internalServerError('Failed to delete comment');
    }
  },

  // GET /api/report-comments/count?reportId=xxx
  async count(ctx) {
    const user = await getAuthUser(ctx);

    if (!user) {
      return ctx.unauthorized('Invalid token');
    }

    const { reportId, fieldPath } = ctx.query;

    if (!reportId) {
      return ctx.badRequest('reportId is required');
    }

    try {
      const total = await strapi.service('api::report-comment.report-comment')
        .getCommentCount(reportId, fieldPath);
      const unresolved = await strapi.service('api::report-comment.report-comment')
        .getUnresolvedCount(reportId);

      return { data: { total, unresolved } };
    } catch (error) {
      strapi.log.error('[Report Comment] Error counting comments:', error);
      return ctx.internalServerError('Failed to count comments');
    }
  },

  // GET /api/report-comments/users?search=xxx
  // Returns admin users for @mention autocomplete
  async users(ctx) {
    const user = await getAuthUser(ctx);

    if (!user) {
      return ctx.unauthorized('Invalid token');
    }

    const { search } = ctx.query;

    try {
      const where = search
        ? {
            $or: [
              { firstname: { $containsi: search } },
              { lastname: { $containsi: search } },
              { username: { $containsi: search } },
              { email: { $containsi: search } },
            ],
          }
        : {};

      const adminUsers = await strapi.db.query('admin::user').findMany({
        where,
        select: ['id', 'firstname', 'lastname', 'username', 'email'],
        limit: 10,
      });

      const users = adminUsers.map((u) => ({
        id: u.id,
        name: u.firstname
          ? `${u.firstname}${u.lastname ? ' ' + u.lastname : ''}`
          : u.username || u.email,
        email: u.email,
      }));

      return { data: users };
    } catch (error) {
      strapi.log.error('[Report Comment] Error fetching users:', error);
      return ctx.internalServerError('Failed to fetch users');
    }
  },
};
