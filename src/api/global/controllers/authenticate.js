'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { generateToken } = require('../../../middlewares/jwt');

// Rate limiting storage
const loginAttempts = new Map();

const getSessionId = (ctx) => {
  const ip = ctx.request.ip || ctx.ip;
  const userAgent = ctx.request.headers['user-agent'] || '';
  return crypto.createHash('sha256').update(ip + userAgent).digest('hex');
};

const checkRateLimit = (sessionId) => {
  const now = Date.now();
  const attempts = loginAttempts.get(sessionId) || [];

  // Remove attempts older than 2 minutes
  const recentAttempts = attempts.filter(time => now - time < 2 * 60 * 1000);

  if (recentAttempts.length >= 6) {
    throw new Error('blocked');
  }

  return recentAttempts;
};

const recordFailedAttempt = (sessionId, recentAttempts) => {
  recentAttempts.push(Date.now());
  loginAttempts.set(sessionId, recentAttempts);
  return recentAttempts.length;
};

const clearAttempts = (sessionId) => {
  loginAttempts.delete(sessionId);
};

module.exports = {
  async authenticate(ctx) {
    const { password } = ctx.request.body;

    if (!password) {
      return ctx.badRequest('Password is required');
    }

    const sessionId = getSessionId(ctx);

    // Check rate limit
    let recentAttempts;
    try {
      recentAttempts = checkRateLimit(sessionId);
    } catch (error) {
      if (error.message === 'blocked') {
        return ctx.tooManyRequests('Too many login attempts. Please try again later.');
      }
      throw error;
    }

    try {
      // Try to authenticate with accounts first
      const accounts = await strapi.entityService.findMany('api::account.account', {
        fields: ['id', 'documentId', 'name', 'role', 'password', 'isAdmin'],
      });

      for (const account of accounts) {
        const accountPassword = account.password;
        if (accountPassword && await bcrypt.compare(password, accountPassword)) {
          // Clear attempts on successful login
          clearAttempts(sessionId);

          // Determine user type based on role
          const role = account.role || '';
          const isHeadPM = role.toLowerCase().includes('head pm') || role.toLowerCase().includes('head of production');
          const userType = isHeadPM ? 'head_pm' : 'user';

          strapi.log.info(`[Auth] User "${account.name}" logged in. Role: "${role}", Type: "${userType}", isHeadPM: ${isHeadPM}`);

          const payload = {
            id: account.documentId || account.id,
            name: account.name,
            role: account.role,
            type: userType,
            isAdmin: account.isAdmin || false,
          };

          const token = generateToken(payload);

          return {
            ...payload,
            token,
          };
        }
      }

      // Try to authenticate with models
      const models = await strapi.entityService.findMany('api::model.model', {
        fields: ['id', 'documentId', 'name', 'password'],
      });

      for (const model of models) {
        const modelPassword = model.password;
        if (modelPassword && await bcrypt.compare(password, modelPassword)) {
          // Clear attempts on successful login
          clearAttempts(sessionId);

          const payload = {
            id: model.documentId || model.id,
            name: model.name,
            type: 'model',
          };

          const token = generateToken(payload);

          return {
            ...payload,
            token,
          };
        }
      }

      // Record failed attempt and get total count
      const attemptsCount = recordFailedAttempt(sessionId, recentAttempts);
      const remainingAttempts = 6 - attemptsCount;

      // Return error with remaining attempts info only when 2 or 1 attempts left
      if (remainingAttempts === 2 || remainingAttempts === 1) {
        ctx.status = 401;
        return ctx.body = {
          error: 'Invalid password',
          remainingAttempts
        };
      }

      return ctx.unauthorized('Invalid password');
    } catch (error) {
      console.error('Authentication error:', error);
      return ctx.internalServerError('Authentication failed');
    }
  },
};
