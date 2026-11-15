// Sends email over SMTP when SMTP_URL is set. Without it, messages are logged
// to the console and kept in `outbox` (used by dev mode and the tests).
function createMailer({ smtpUrl, from, quiet = false }) {
  const outbox = [];
  let transport = null;
  if (smtpUrl) transport = require('nodemailer').createTransport(smtpUrl);

  async function send({ to, subject, text }) {
    if (transport) {
      await transport.sendMail({ from, to, subject, text });
      return;
    }
    outbox.push({ to, subject, text });
    if (!quiet) console.log(`\n--- email (not sent, no SMTP_URL) ---\nTo: ${to}\nSubject: ${subject}\n\n${text}\n---\n`);
  }

  return { send, outbox, live: Boolean(transport) };
}

module.exports = { createMailer };
