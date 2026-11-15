const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { createMailer } = require('../src/mail');
const { createApp } = require('../src/app');

async function start() {
  const db = await openDb({ url: ':memory:' });
  const mailer = createMailer({ smtpUrl: '', from: 'test@example.com', quiet: true });
  const server = createApp({ db, mailer, baseUrl: 'http://test.local' }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  // A tiny browser: keeps its own cookie, posts forms, doesn't follow redirects.
  function client() {
    let cookie = '';
    return async (path, form) => {
      const res = await fetch(base + path, {
        method: form ? 'POST' : 'GET',
        redirect: 'manual',
        headers: { cookie, ...(form && { 'content-type': 'application/x-www-form-urlencoded' }) },
        body: form ? new URLSearchParams(form) : undefined,
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      return { status: res.status, location: res.headers.get('location'), text: await res.text() };
    };
  }

  async function signUp(name, email) {
    const c = client();
    await c('/register', { name, email, password: 'correct horse' });
    const link = mailer.outbox.at(-1).text.match(/\/verify\?token=\w+/)[0];
    assert.equal((await c(link)).status, 200);
    return c;
  }

  return { db, mailer, server, client, signUp };
}

const future = () => new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 16);
const party = (extra = {}) => ({
  album: 'Blue Lines', artist: 'Massive Attack', cocktail: 'Negroni', starts_at: future(),
  city: 'Bristol', address: '12 Secret Street', capacity: '1', notes: '', ...extra,
});

test('cannot sign in until the email is verified', async (t) => {
  const { server, client, mailer } = await start();
  t.after(() => server.close());
  const c = client();

  const reg = await c('/register', { name: 'Ana', email: 'Ana@Example.com', password: 'correct horse' });
  assert.match(reg.text, /Check your email/);
  assert.equal(mailer.outbox.length, 1);
  assert.equal(mailer.outbox[0].to, 'ana@example.com');

  const early = await c('/login', { email: 'ana@example.com', password: 'correct horse' });
  assert.equal(early.status, 403);
  assert.equal((await c('/parties/new')).status, 302);

  assert.equal((await c('/login', { email: 'ana@example.com', password: 'wrong password' })).status, 401);

  // The login attempt issued a fresh link; the first one no longer works.
  const [first, second] = mailer.outbox.map((m) => m.text.match(/\/verify\?token=\w+/)[0]);
  assert.equal((await c(first)).status, 400);
  assert.equal((await c(second)).status, 200);
  assert.equal((await c('/parties/new')).status, 200);
  assert.equal((await c(second)).status, 400, 'links are single use');
});

test('host approves guests before they see the address', async (t) => {
  const { server, client, signUp, mailer, db } = await start();
  t.after(() => server.close());
  const host = await signUp('Hattie', 'host@example.com');
  const guest = await signUp('Gus', 'gus@example.com');
  const late = await signUp('Lou', 'lou@example.com');
  const id = async (email) => (await db.get('SELECT id FROM users WHERE email = ?', email)).id;
  const [gus, lou] = [await id('gus@example.com'), await id('lou@example.com')];

  assert.equal((await host('/parties', party({ starts_at: '2001-01-01T20:00' }))).status, 400);
  const created = await host('/parties', party());
  assert.equal(created.status, 302);
  const url = created.location;

  const listing = await client()('/');
  assert.match(listing.text, /Blue Lines/);
  assert.match(listing.text, /Negroni/);
  assert.doesNotMatch(listing.text, /Secret Street/);
  assert.doesNotMatch((await client()(url)).text, /Secret Street/);
  assert.match((await host(url)).text, /Secret Street/);

  // Asking for a spot emails the host but reveals nothing yet.
  await guest(`${url}/rsvp`, {});
  assert.equal(mailer.outbox.at(-1).to, 'host@example.com');
  const waiting = await guest(url);
  assert.match(waiting.text, /Request sent/);
  assert.doesNotMatch(waiting.text, /Secret Street/);
  assert.match((await host(url)).text, /Gus/);
  assert.match((await host('/me')).text, /1 request waiting/);

  // Guests can't approve themselves, or each other.
  await late(`${url}/rsvp`, {});
  assert.equal((await guest(`${url}/guests/${gus}/approve`, {})).status, 403);
  assert.equal((await late(`${url}/guests/${gus}/approve`, {})).status, 403);
  assert.doesNotMatch((await guest(url)).text, /Secret Street/);

  await host(`${url}/guests/${gus}/approve`, {});
  assert.equal(mailer.outbox.at(-1).to, 'gus@example.com');
  assert.doesNotMatch(mailer.outbox.at(-1).text, /Secret Street/);
  const going = await guest(url);
  assert.match(going.text, /Secret Street/);
  assert.match(going.text, /on the list/);

  // Capacity is 1, so a second approval is refused and Lou still can't see the address.
  assert.match((await host(`${url}/guests/${lou}/approve`, {})).location, /full=1/);
  assert.doesNotMatch((await late(url)).text, /Secret Street/);
  assert.match((await late('/me')).text, /Waiting for host/);

  // Gus gives up his spot, loses the address, and Lou can now be approved.
  await guest(`${url}/leave`, {});
  assert.doesNotMatch((await guest(url)).text, /Secret Street/);
  assert.doesNotMatch((await host(`${url}/guests/${lou}/approve`, {})).location, /full/);
  assert.match((await late(url)).text, /Secret Street/);

  // The host removes Lou: the address goes away and Lou can't simply ask again.
  await host(`${url}/guests/${lou}/decline`, {});
  assert.equal(mailer.outbox.at(-1).to, 'lou@example.com');
  await late(`${url}/rsvp`, {});
  await late(`${url}/leave`, {});
  await late(`${url}/rsvp`, {});
  const declined = await late(url);
  assert.doesNotMatch(declined.text, /Secret Street/);
  assert.match(declined.text, /isn’t able to offer you a spot/);
  assert.doesNotMatch((await host(url)).text, /Lou/);

  // Only the host can cancel; people still on the list are told, declined ones are not.
  await guest(`${url}/rsvp`, {});
  assert.equal((await guest(`${url}/cancel`, {})).status, 403);
  const before = mailer.outbox.length;
  await host(`${url}/cancel`, {});
  assert.equal((await host(url)).status, 404);
  assert.deepEqual(mailer.outbox.slice(before).map((m) => m.to), ['gus@example.com']);
});

test('databases from before host approval keep their guests', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hm-')), 'old.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE rsvps (party_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (party_id, user_id));
    INSERT INTO rsvps (party_id, user_id) VALUES (1, 1);`);
  old.close();
  const db = await openDb({ url: `file:${file}` });
  assert.equal((await db.get('SELECT status FROM rsvps')).status, 'approved');
  db.close();
});

test('user input is escaped and cross-site posts are refused', async (t) => {
  const { server, signUp } = await start();
  t.after(() => server.close());
  const host = await signUp('Hattie', 'host@example.com');
  const created = await host('/parties', party({ album: '<script>alert(1)</script>' }));
  const page = await host(created.location);
  assert.doesNotMatch(page.text, /<script>alert/);
  assert.match(page.text, /&lt;script&gt;/);

  const res = await fetch(`http://127.0.0.1:${server.address().port}/logout`, {
    method: 'POST', headers: { origin: 'https://evil.example' },
  });
  assert.equal(res.status, 403);
});

test('verification email goes through Brevo when a key is set', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return new Response('{}', { status: 201 });
  });
  const mailer = createMailer({ brevoApiKey: 'key-123', from: 'House Music <hello@example.com>' });
  assert.equal(mailer.live, true);
  await mailer.send({ to: 'ana@example.com', subject: 'Hi', text: 'Body' });
  assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(calls[0].init.headers['api-key'], 'key-123');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    sender: { name: 'House Music', email: 'hello@example.com' },
    to: [{ email: 'ana@example.com' }], subject: 'Hi', textContent: 'Body',
  });
});
