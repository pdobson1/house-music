// Sends email through Brevo's HTTP API (BREVO_API_KEY) or over SMTP (SMTP_URL).
// With neither set, messages are logged to the console and kept in `outbox`
// (used by local dev mode and the tests).
function createMailer({ smtpUrl, brevoApiKey, from, quiet = false }) {
  const outbox = [];
  const transport = smtpUrl ? require('nodemailer').createTransport(smtpUrl) : null;
  // "House Music <hello@example.com>" -> { name, email }
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  const sender = match ? { name: match[1] || undefined, email: match[2] } : { email: from.trim() };

  async function send({ to, subject, text }) {
    if (brevoApiKey) {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Brevo rejected the email (${res.status}): ${(await res.text()).slice(0, 200)}`);
      return;
    }
    if (transport) {
      await transport.sendMail({ from, to, subject, text });
      return;
    }
    outbox.push({ to, subject, text });
    if (!quiet) console.log(`\n--- email (not sent, no provider configured) ---\nTo: ${to}\nSubject: ${subject}\n\n${text}\n---\n`);
  }

  return { send, outbox, live: Boolean(brevoApiKey || transport) };
}

module.exports = { createMailer };
