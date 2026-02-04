'use strict';

/**
 * Report Comment Service
 * Handles comment operations with @mention support for Admin Panel Users
 */

// Parse @mentions with Cyrillic support
const parseMentions = (content) => {
  const mentionRegex = /@([а-яА-ЯёЁa-zA-Z0-9_\s]+?)(?=\s|$|[.,!?;:])/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1].trim());
  }
  return mentions;
};

// Send email notification to mentioned user
const sendMentionEmail = async (mentionedUser, comment, reportId, authorName) => {
  try {
    // Check if email plugin is available
    if (!strapi.plugins?.email?.services?.email) {
      strapi.log.warn('[Comments] Email plugin not configured, skipping notification');
      return;
    }

    // Get report info for email context
    const report = await strapi.db.query('api::report.report').findOne({
      where: { uuid: reportId },
      populate: { model: true },
    });

    const reportTitle = report?.title || 'Отчёт';
    const modelName = report?.model?.name || '';
    const reportUrl = `${process.env.STRAPI_ADMIN_URL || 'http://localhost:1337/admin'}/content-manager/collection-types/api::report.report/${report?.documentId}`;

    await strapi.plugins.email.services.email.send({
      to: mentionedUser.email,
      subject: `Вас упомянули в комментарии — ${reportTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4945FF;">Новое упоминание</h2>
          <p><strong>${authorName}</strong> упомянул вас в комментарии к отчёту:</p>

          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #4945FF;">
            <p style="margin: 0; white-space: pre-wrap;">${comment.content}</p>
          </div>

          <p style="color: #666;">
            <strong>Отчёт:</strong> ${reportTitle}<br/>
            ${modelName ? `<strong>Модель:</strong> ${modelName}<br/>` : ''}
          </p>

          <a href="${reportUrl}"
             style="display: inline-block; background: #4945FF; color: white; padding: 12px 24px;
                    text-decoration: none; border-radius: 4px; margin-top: 16px;">
            Открыть отчёт
          </a>

          <p style="color: #999; font-size: 12px; margin-top: 24px;">
            Это автоматическое уведомление. Не отвечайте на это письмо.
          </p>
        </div>
      `,
      text: `${authorName} упомянул вас в комментарии к отчёту "${reportTitle}": ${comment.content}`,
    });

    strapi.log.info(`[Comments] Email sent to ${mentionedUser.email} for mention in report ${reportId}`);
  } catch (error) {
    strapi.log.error(`[Comments] Failed to send email to ${mentionedUser.email}:`, error);
  }
};

module.exports = {
  // Get comments for a report
  async getComments(reportId, fieldPath = null) {
    const where = { report_document_id: reportId };
    if (fieldPath) {
      where.field_path = fieldPath;
    }
    return strapi.db.query('api::report-comment.report-comment').findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  },

  // Create a new comment
  async createComment(data, user) {
    const mentionNames = parseMentions(data.content);
    const mentions = await this.resolveMentions(mentionNames);

    const comment = await strapi.db.query('api::report-comment.report-comment').create({
      data: {
        report_document_id: data.reportId,
        field_path: data.fieldPath || 'general',
        content: data.content,
        user_id: user.id,
        user_name: user.name,
        user_type: user.type,
        mentions,
        parent_comment_id: data.parentCommentId || null,
      },
    });

    // Send Socket.IO notification
    if (strapi.io) {
      strapi.io.to(`report:${data.reportId}`).emit('comment-added', comment);

      // Notify mentioned users via Socket.IO
      for (const mention of mentions) {
        strapi.io.emit(`user-mentioned:${mention.id}`, {
          comment,
          reportId: data.reportId,
        });
      }
    }

    // Send email notifications to mentioned admin users
    for (const mention of mentions) {
      if (mention.email && mention.type === 'admin') {
        // Don't send email to yourself
        if (mention.id !== user.id) {
          sendMentionEmail(mention, comment, data.reportId, user.name);
        }
      }
    }

    return comment;
  },

  // Resolve @mentions to Admin Panel Users
  async resolveMentions(names) {
    const mentions = [];
    for (const name of names) {
      // Search in admin users by firstname, lastname, or username
      const adminUsers = await strapi.db.query('admin::user').findMany({
        where: {
          $or: [
            { firstname: { $containsi: name } },
            { lastname: { $containsi: name } },
            { username: { $containsi: name } },
            // Also try to match "Firstname Lastname" pattern
            {
              $and: [
                { firstname: { $containsi: name.split(' ')[0] } },
                { lastname: { $containsi: name.split(' ')[1] || '' } },
              ],
            },
          ],
        },
      });

      if (adminUsers && adminUsers.length > 0) {
        // Take the best match (exact match preferred)
        const exactMatch = adminUsers.find(u =>
          u.firstname?.toLowerCase() === name.toLowerCase() ||
          u.lastname?.toLowerCase() === name.toLowerCase() ||
          u.username?.toLowerCase() === name.toLowerCase() ||
          `${u.firstname} ${u.lastname}`.toLowerCase() === name.toLowerCase()
        );

        const user = exactMatch || adminUsers[0];
        const displayName = user.firstname
          ? `${user.firstname}${user.lastname ? ' ' + user.lastname : ''}`
          : user.username || user.email;

        mentions.push({
          id: user.id,
          name: displayName,
          email: user.email,
          type: 'admin',
        });
      }
    }
    return mentions;
  },

  // Update a comment
  async updateComment(commentId, content, userId) {
    const comment = await strapi.db.query('api::report-comment.report-comment').findOne({
      where: { id: commentId },
    });

    if (!comment) {
      throw new Error('Comment not found');
    }

    if (comment.user_id !== userId) {
      throw new Error('Cannot edit other user comments');
    }

    const mentionNames = parseMentions(content);
    const mentions = await this.resolveMentions(mentionNames);

    const updated = await strapi.db.query('api::report-comment.report-comment').update({
      where: { id: commentId },
      data: {
        content,
        mentions,
      },
    });

    if (strapi.io) {
      strapi.io.to(`report:${comment.report_document_id}`).emit('comment-updated', updated);
    }

    return updated;
  },

  // Mark comment as resolved
  async resolveComment(commentId, userId) {
    const updated = await strapi.db.query('api::report-comment.report-comment').update({
      where: { id: commentId },
      data: {
        is_resolved: true,
        resolved_by: userId,
        resolved_at: new Date(),
      },
    });

    if (strapi.io && updated) {
      strapi.io.to(`report:${updated.report_document_id}`).emit('comment-resolved', updated);
    }

    return updated;
  },

  // Unresolve comment
  async unresolveComment(commentId) {
    const updated = await strapi.db.query('api::report-comment.report-comment').update({
      where: { id: commentId },
      data: {
        is_resolved: false,
        resolved_by: null,
        resolved_at: null,
      },
    });

    if (strapi.io && updated) {
      strapi.io.to(`report:${updated.report_document_id}`).emit('comment-unresolved', updated);
    }

    return updated;
  },

  // Delete a comment
  async deleteComment(commentId) {
    const comment = await strapi.db.query('api::report-comment.report-comment').findOne({
      where: { id: commentId },
    });

    if (!comment) {
      return null;
    }

    await strapi.db.query('api::report-comment.report-comment').delete({
      where: { id: commentId },
    });

    if (strapi.io) {
      strapi.io.to(`report:${comment.report_document_id}`).emit('comment-deleted', { id: commentId });
    }

    return comment;
  },

  // Get comment count for a report
  async getCommentCount(reportId, fieldPath = null) {
    const where = { report_document_id: reportId };
    if (fieldPath) {
      where.field_path = fieldPath;
    }
    return strapi.db.query('api::report-comment.report-comment').count({ where });
  },

  // Get unresolved comment count
  async getUnresolvedCount(reportId) {
    return strapi.db.query('api::report-comment.report-comment').count({
      where: {
        report_document_id: reportId,
        is_resolved: false,
      },
    });
  },
};
