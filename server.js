const { openDb } = require('./src/db');
const { createMailer } = require('./src/mail');
const { createApp } = require('./src/app');

try { process.loadEnvFile(); } catch { /* no .env file, use the real environment */ }

const port = Number(process.env.PORT) || 3000;
const baseUrl = (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');
const smtpUrl = process.env.SMTP_URL || '';

if (process.env.NODE_ENV === 'production' && !smtpUrl) {
  console.error('SMTP_URL is required in production so verification emails can be sent.');
  process.exit(1);
}

const db = openDb(process.env.DB_PATH || './data/house-music.db');
const mailer = createMailer({ smtpUrl, from: process.env.MAIL_FROM || 'House Music <hello@example.com>' });
const app = createApp({ db, mailer, baseUrl, trustProxy: Boolean(process.env.TRUST_PROXY) });

// Clear out expired sessions once an hour.
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()), 60 * 60 * 1000).unref();

app.listen(port, () => {
  console.log(`House Music running at ${baseUrl}`);
  if (!smtpUrl) console.log('No SMTP_URL set: verification links are printed here and shown on screen.');
});
