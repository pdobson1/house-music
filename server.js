const { openDb } = require('./src/db');
const { createMailer } = require('./src/mail');
const { createApp } = require('./src/app');

try { process.loadEnvFile(); } catch { /* no .env file, use the real environment */ }

const port = Number(process.env.PORT) || 3000;
// RENDER_EXTERNAL_URL is set automatically on Render, so BASE_URL is optional there.
const baseUrl = (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/$/, '');
const smtpUrl = process.env.SMTP_URL || '';
const brevoApiKey = process.env.BREVO_API_KEY || '';

if (process.env.NODE_ENV === 'production' && !smtpUrl && !brevoApiKey) {
  console.error('BREVO_API_KEY or SMTP_URL is required in production so verification emails can be sent.');
  process.exit(1);
}

const mailer = createMailer({
  smtpUrl,
  brevoApiKey,
  from: process.env.MAIL_FROM || 'House Music <hello@example.com>',
});

async function main() {
  // DATABASE_URL points at a hosted database (libsql://...); without it a local file is used.
  const db = await openDb({
    url: process.env.DATABASE_URL || `file:${process.env.DB_PATH || './data/house-music.db'}`,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  const app = createApp({ db, mailer, baseUrl, trustProxy: Boolean(process.env.TRUST_PROXY) });

  // Clear out expired sessions once an hour.
  setInterval(() => {
    db.run('DELETE FROM sessions WHERE expires < ?', Date.now()).catch((err) => console.error(err));
  }, 60 * 60 * 1000).unref();

  app.listen(port, () => {
    console.log(`House Music running at ${baseUrl}`);
    if (!mailer.live) console.log('No email provider set: verification links are printed here and shown on screen.');
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
