const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

module.exports = () => {
  return async (ctx, next) => {
    const token = ctx.request.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return ctx.unauthorized('No token provided');
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      ctx.state.user = decoded;
      await next();
    } catch (error) {
      return ctx.unauthorized('Invalid token');
    }
  };
};

module.exports.verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

module.exports.generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
};
