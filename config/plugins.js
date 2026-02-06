module.exports = ({ env }) => {
  const config = {
    'collaborative-editing': {
      enabled: true,
      resolve: './src/plugins/collaborative-editing',
    },
  };

  // Only add email config if SMTP credentials are provided
  if (env('SMTP_USER') && env('SMTP_PASS')) {
    config.email = {
      config: {
        provider: 'nodemailer',
        providerOptions: {
          host: env('SMTP_HOST', 'smtp.gmail.com'),
          port: env.int('SMTP_PORT', 587),
          secure: false,
          auth: {
            user: env('SMTP_USER'),
            pass: env('SMTP_PASS'),
          },
        },
        settings: {
          defaultFrom: env('EMAIL_FROM', env('SMTP_USER')),
          defaultReplyTo: env('EMAIL_REPLY_TO', env('SMTP_USER')),
        },
      },
    };
  }

  return config;
};
