const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { createMailer } = require('../src/mail');
const { createApp } = require('../src/app');

async function start() {
  const db = openDb(':memory:');
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

test('hosting, signing up, capacity and address privacy', async (t) => {
  const { server, client, signUp, mailer } = await start();
  t.after(() => server.close());
  const host = await signUp('Hattie', 'host@example.com');
  const guest = await signUp('Gus', 'gus@example.com');
  const late = await signUp('Lou', 'lou@example.com');

  assert.equal((await host('/parties', party({ starts_at: '2001-01-01T20:00' }))).status, 400);
  const created = await host('/parties', party());
  assert.equal(created.status, 302);
  const url = created.location;

  const listing = await client()('/');
  assert.match(listing.text, /Blue Lines/);
  assert.match(listing.text, /Negroni/);
  assert.doesNotMatch(listing.text, /Secret Street/);

  assert.doesNotMatch((await client()(url)).text, /Secret Street/);
  assert.doesNotMatch((await guest(url)).text, /Secret Street/);
  assert.match((await host(url)).text, /Secret Street/);

  await guest(`${url}/rsvp`, {});
  const going = await guest(url);
  assert.match(going.text, /Secret Street/);
  assert.match(going.text, /on the list/);

  // Capacity is 1, so the next person is turned away and never sees the address.
  assert.match((await late(`${url}/rsvp`, {})).location, /full=1/);
  assert.doesNotMatch((await late(url)).text, /Secret Street/);

  // A spot frees up when a guest leaves.
  await guest(`${url}/leave`, {});
  assert.doesNotMatch((await guest(url)).text, /Secret Street/);
  assert.doesNotMatch((await late(`${url}/rsvp`, {})).location, /full/);
  assert.match((await late('/me')).text, /Blue Lines/);

  // Only the host can cancel, and guests are told.
  assert.equal((await guest(`${url}/cancel`, {})).status, 403);
  const before = mailer.outbox.length;
  await host(`${url}/cancel`, {});
  assert.equal((await host(url)).status, 404);
  assert.equal(mailer.outbox.length, before + 1);
  assert.equal(mailer.outbox.at(-1).to, 'lou@example.com');
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
