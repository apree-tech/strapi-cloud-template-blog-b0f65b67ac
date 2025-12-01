const bcrypt = require('bcryptjs');

module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;

    if (data.password) {
      // Hash password before storing
      const salt = await bcrypt.genSalt(10);
      data.password = await bcrypt.hash(data.password, salt);
    }
  },

  async beforeUpdate(event) {
    const { data } = event.params;

    if (data.password) {
      // Hash password before storing
      const salt = await bcrypt.genSalt(10);
      data.password = await bcrypt.hash(data.password, salt);
    }
  },
};
