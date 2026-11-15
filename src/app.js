const path = require('node:path');
const express = require('express');
const auth = require('./auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STARTS_AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function createApp({ db, mailer, baseUrl, trustProxy = false }) {
  const app = express();
  const secureCookies = baseUrl.startsWith('https://');
  // Only reveal verification links on screen when no real mail is being sent (local dev).
  const showDevLinks = !mailer.live && process.env.NODE_ENV !== 'production';

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  if (trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
    });
    next();
  });
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));

  // CSRF: session cookie is SameSite=Lax, and state-changing requests must come from our own origin.
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const origin = req.headers.origin;
    if (origin) {
      let host = null;
      try { host = new URL(origin).host; } catch { /* malformed */ }
      if (host !== req.headers.host) return res.status(403).send('Cross-site request blocked');
    }
    next();
  });

  // Load the signed-in user, if any.
  app.use(async (req, res, next) => {
    const token = auth.readCookie(req, auth.SESSION_COOKIE);
    req.user = null;
    if (token) {
      req.user = await db.get(`SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires > ?`, auth.hashToken(token), Date.now()) || null;
    }
    res.locals.user = req.user;
    res.locals.fmtDate = fmtDate;
    res.locals.hue = hue;
    next();
  });

  // Small in-memory limiter for the auth endpoints.
  const hits = new Map();
  function rateLimit(max, windowMs) {
    return (req, res, next) => {
      const key = `${req.ip}:${req.path}`;
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.reset < now) hits.set(key, { count: 1, reset: now + windowMs });
      else if (++entry.count > max) {
        return res.status(429).render('message', {
          title: 'Slow down',
          body: 'Too many attempts. Please wait a few minutes and try again.',
        });
      }
      next();
    };
  }
  const authLimit = rateLimit(20, 15 * 60 * 1000);

  function requireUser(req, res, next) {
    if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    next();
  }

  async function sendVerification(user) {
    const token = auth.newToken();
    await db.run('UPDATE users SET verify_token_hash = ?, verify_expires = ? WHERE id = ?', auth.hashToken(token), Date.now() + auth.VERIFY_TTL_MS, user.id);
    const link = `${baseUrl}/verify?token=${token}`;
    await mailer.send({
      to: user.email,
      subject: 'Confirm your email for House Music',
      text: `Hi ${user.name},\n\nConfirm your email to start hosting and attending listening parties:\n\n${link}\n\nThis link expires in 24 hours. If you didn't sign up, ignore this email.`,
    });
    return link;
  }

  async function notify(message) {
    try {
      await mailer.send(message);
    } catch (err) {
      console.error(`Failed to email "${message.subject}":`, err.message);
    }
  }

  async function startSession(res, userId) {
    const token = auth.newToken();
    await db.run('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)', auth.hashToken(token), userId, Date.now() + auth.SESSION_TTL_MS);
    res.cookie(auth.SESSION_COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: auth.SESSION_TTL_MS, path: '/',
    });
  }

  const partySelect = `
    SELECT p.*, u.name AS host_name,
           (SELECT COUNT(*) FROM rsvps r WHERE r.party_id = p.id AND r.status = 'approved') AS going,
           (SELECT COUNT(*) FROM rsvps r WHERE r.party_id = p.id AND r.status = 'pending') AS waiting
    FROM parties p JOIN users u ON u.id = p.host_id`;

  // Used by the host to check the app is up.
  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  // ---------- Browse ----------

  app.get('/', async (req, res) => {
    const parties = await db.all(`${partySelect} WHERE p.starts_at >= ? ORDER BY p.starts_at LIMIT 200`, cutoff());
    res.render('home', { title: 'Listening parties', parties });
  });

  // ---------- Sign up / verify / sign in ----------

  app.get('/register', (req, res) => {
    if (req.user) return res.redirect('/');
    res.render('register', { title: 'Sign up', error: null, values: {} });
  });

  app.post('/register', authLimit, async (req, res) => {
    const name = clean(req.body.name, 60);
    const email = clean(req.body.email, 254).toLowerCase();
    const password = String(req.body.password || '');
    let error = null;
    if (!name) error = 'Please tell us your name.';
    else if (!EMAIL_RE.test(email)) error = 'That email address doesn’t look right.';
    else if (password.length < 8) error = 'Use a password of at least 8 characters.';
    else if (password.length > 200) error = 'That password is too long.';
    if (error) return res.status(400).render('register', { title: 'Sign up', error, values: { name, email } });

    // Same response whether or not the address is already registered, so
    // the form can't be used to find out who has an account.
    let devLink = null;
    const existing = await db.get('SELECT * FROM users WHERE email = ?', email);
    if (!existing) {
      const info = await db.run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', name, email, await auth.hashPassword(password));
      devLink = await sendVerification({ id: info.lastInsertRowid, name, email });
    } else if (!existing.verified_at) {
      devLink = await sendVerification(existing);
    } else {
      await mailer.send({
        to: email,
        subject: 'You already have a House Music account',
        text: `Hi ${existing.name},\n\nSomeone tried to sign up with this email, but you already have an account. Sign in here:\n\n${baseUrl}/login`,
      });
    }
    res.render('check-email', { title: 'Check your email', email, devLink: showDevLinks ? devLink : null });
  });

  app.get('/verify', async (req, res) => {
    const token = String(req.query.token || '');
    const user = token && await db.get('SELECT * FROM users WHERE verify_token_hash = ? AND verify_expires > ?', auth.hashToken(token), Date.now());
    if (!user) {
      return res.status(400).render('message', {
        title: 'Link expired',
        body: 'That confirmation link is invalid or has expired. Sign in to get a fresh one.',
        action: { href: '/login', label: 'Sign in' },
      });
    }
    await db.run(`UPDATE users SET verified_at = datetime('now'), verify_token_hash = NULL, verify_expires = NULL WHERE id = ?`, user.id);
    await startSession(res, user.id);
    res.locals.user = user;
    res.render('message', {
      title: 'Email confirmed',
      body: `Welcome, ${user.name}. You can now host a listening party or grab a spot at someone else’s.`,
      action: { href: '/', label: 'Browse parties' },
    });
  });

  app.get('/login', (req, res) => {
    if (req.user) return res.redirect('/');
    res.render('login', { title: 'Sign in', error: null, unverified: null, devLink: null, email: '', next: safeNext(req.query.next) });
  });

  app.post('/login', authLimit, async (req, res) => {
    const email = clean(req.body.email, 254).toLowerCase();
    const password = String(req.body.password || '');
    const next = safeNext(req.body.next);
    const user = await db.get('SELECT * FROM users WHERE email = ?', email);
    const ok = user && password.length <= 200 && await auth.verifyPassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).render('login', {
        title: 'Sign in', error: 'Wrong email or password.', unverified: null, devLink: null, email, next,
      });
    }
    if (!user.verified_at) {
      // Password was correct, so it's safe to say the account exists and re-send the link.
      const link = await sendVerification(user);
      return res.status(403).render('login', {
        title: 'Sign in', error: null, unverified: email, devLink: showDevLinks ? link : null, email, next,
      });
    }
    await startSession(res, user.id);
    res.redirect(next);
  });

  app.post('/logout', async (req, res) => {
    const token = auth.readCookie(req, auth.SESSION_COOKIE);
    if (token) await db.run('DELETE FROM sessions WHERE token_hash = ?', auth.hashToken(token));
    res.clearCookie(auth.SESSION_COOKIE, { path: '/' });
    res.redirect('/');
  });

  // ---------- Hosting ----------

  app.get('/parties/new', requireUser, (req, res) => {
    res.render('party-form', { title: 'Host a party', error: null, values: { capacity: 8 }, minDate: cutoff() });
  });

  app.post('/parties', requireUser, async (req, res) => {
    const v = {
      album: clean(req.body.album, 120),
      artist: clean(req.body.artist, 120),
      cocktail: clean(req.body.cocktail, 120),
      starts_at: clean(req.body.starts_at, 16),
      city: clean(req.body.city, 80),
      address: clean(req.body.address, 200),
      capacity: Number.parseInt(req.body.capacity, 10),
      notes: clean(req.body.notes, 1000),
    };
    let error = null;
    if (!v.album || !v.artist) error = 'Which album are you playing, and who is it by?';
    else if (!v.cocktail) error = 'Pick the cocktail you’ll be serving.';
    else if (!STARTS_AT_RE.test(v.starts_at) || Number.isNaN(Date.parse(v.starts_at))) error = 'Choose a date and time.';
    else if (v.starts_at < cutoff()) error = 'That date is in the past.';
    else if (!v.city) error = 'Add your part of Lancaster so guests know roughly where you are.';
    else if (!v.address) error = 'Add your address. Only guests you approve will see it.';
    else if (!(v.capacity >= 1 && v.capacity <= 200)) error = 'Guest limit must be between 1 and 200.';
    if (error) return res.status(400).render('party-form', { title: 'Host a party', error, values: v, minDate: cutoff() });

    const info = await db.run(`INSERT INTO parties (host_id, album, artist, cocktail, starts_at, city, address, capacity, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, req.user.id, v.album, v.artist, v.cocktail, v.starts_at, v.city, v.address, v.capacity, v.notes);
    res.redirect(`/parties/${info.lastInsertRowid}`);
  });

  async function loadParty(req, res, next) {
    const id = Number(req.params.id);
    const party = Number.isInteger(id) ? await db.get(`${partySelect} WHERE p.id = ?`, id) : null;
    if (!party) return res.status(404).render('message', { title: 'Not found', body: 'That party doesn’t exist, or the host cancelled it.', action: { href: '/', label: 'Browse parties' } });
    req.party = party;
    next();
  }

  app.get('/parties/:id', loadParty, async (req, res) => {
    const party = req.party;
    const isHost = Boolean(req.user && req.user.id === party.host_id);
    const mine = req.user && await db.get('SELECT status FROM rsvps WHERE party_id = ? AND user_id = ?', party.id, req.user.id);
    const myStatus = mine ? mine.status : null;
    // The street address and the guest list are private to the host and guests the host has approved.
    const insider = isHost || myStatus === 'approved';
    const people = (status) => db.all('SELECT u.id, u.name FROM rsvps r JOIN users u ON u.id = r.user_id WHERE r.party_id = ? AND r.status = ? ORDER BY r.created_at', party.id, status);
    res.render('party', {
      title: `${party.album} at ${party.host_name}’s`,
      party: { ...party, address: insider ? party.address : null },
      isHost, myStatus,
      guests: insider ? await people('approved') : [],
      requests: isHost ? await people('pending') : [],
      past: party.starts_at < cutoff(),
      error: req.query.full ? 'The party is full, so nobody else can be approved.' : null,
    });
  });

  // A guest asks for a spot. The host has to approve before they see the address.
  app.post('/parties/:id/rsvp', requireUser, loadParty, async (req, res) => {
    const party = req.party;
    const open = party.host_id !== req.user.id && party.starts_at >= cutoff() && party.going < party.capacity;
    const info = open
      ? await db.run(`INSERT OR IGNORE INTO rsvps (party_id, user_id, status) VALUES (?, ?, 'pending')`, party.id, req.user.id)
      : { changes: 0 };
    if (info.changes) {
      const host = await db.get('SELECT name, email FROM users WHERE id = ?', party.host_id);
      await notify({
        to: host.email,
        subject: `${req.user.name} wants to come to your ${party.album} party`,
        text: `Hi ${host.name},\n\n${req.user.name} has asked for a spot at your ${party.album} listening party on ${fmtDate(party.starts_at)}.\n\nApprove or decline here: ${baseUrl}/parties/${party.id}`,
      });
    }
    res.redirect(`/parties/${party.id}`);
  });

  // A guest withdraws their request or gives up their spot. A decline stays on record so they can't re-request.
  app.post('/parties/:id/leave', requireUser, loadParty, async (req, res) => {
    await db.run(`DELETE FROM rsvps WHERE party_id = ? AND user_id = ? AND status != 'declined'`, req.party.id, req.user.id);
    res.redirect(`/parties/${req.party.id}`);
  });

  function requireHost(req, res, next) {
    if (req.party.host_id !== req.user.id) {
      return res.status(403).render('message', { title: 'Not allowed', body: 'Only the host can do that.' });
    }
    next();
  }

  app.post('/parties/:id/guests/:userId/approve', requireUser, loadParty, requireHost, async (req, res) => {
    const party = req.party;
    const guestId = Number(req.params.userId);
    // Only approve while there is room; one statement so the limit can't be overshot.
    const info = await db.run(`UPDATE rsvps SET status = 'approved'
       WHERE party_id = ? AND user_id = ? AND status = 'pending'
         AND (SELECT COUNT(*) FROM rsvps WHERE party_id = ? AND status = 'approved') < ?`, party.id, guestId, party.id, party.capacity);
    if (!info.changes) {
      const still = await db.get(`SELECT 1 FROM rsvps WHERE party_id = ? AND user_id = ? AND status = 'pending'`, party.id, guestId);
      return res.redirect(`/parties/${party.id}${still ? '?full=1' : ''}`);
    }
    const guest = await db.get('SELECT name, email FROM users WHERE id = ?', guestId);
    await notify({
      to: guest.email,
      subject: `You’re in: ${party.album} at ${party.host_name}’s`,
      text: `Hi ${guest.name},\n\n${party.host_name} has approved your spot at the ${party.album} listening party on ${fmtDate(party.starts_at)}.\n\nSign in to see the address: ${baseUrl}/parties/${party.id}`,
    });
    res.redirect(`/parties/${party.id}`);
  });

  // Declines a request, or removes a guest who was already approved.
  app.post('/parties/:id/guests/:userId/decline', requireUser, loadParty, requireHost, async (req, res) => {
    const party = req.party;
    const guestId = Number(req.params.userId);
    const info = await db.run(`UPDATE rsvps SET status = 'declined' WHERE party_id = ? AND user_id = ? AND status != 'declined'`, party.id, guestId);
    if (info.changes) {
      const guest = await db.get('SELECT name, email FROM users WHERE id = ?', guestId);
      await notify({
        to: guest.email,
        subject: `About the ${party.album} party at ${party.host_name}’s`,
        text: `Hi ${guest.name},\n\nSorry, ${party.host_name} isn’t able to offer you a spot at the ${party.album} listening party on ${fmtDate(party.starts_at)}.\n\nThere are other parties to try: ${baseUrl}/`,
      });
    }
    res.redirect(`/parties/${party.id}`);
  });

  app.post('/parties/:id/cancel', requireUser, loadParty, requireHost, async (req, res) => {
    const party = req.party;
    const guests = await db.all(`SELECT u.name, u.email FROM rsvps r JOIN users u ON u.id = r.user_id WHERE r.party_id = ? AND r.status != 'declined'`, party.id);
    await db.run('DELETE FROM rsvps WHERE party_id = ?', party.id);
    await db.run('DELETE FROM parties WHERE id = ?', party.id);
    // Let guests know so nobody turns up at a closed door.
    for (const g of guests) {
      await notify({
        to: g.email,
        subject: `Cancelled: ${party.album} at ${party.host_name}’s`,
        text: `Hi ${g.name},\n\n${party.host_name} has cancelled the ${party.album} listening party on ${fmtDate(party.starts_at)}.\n\nFind another one: ${baseUrl}/`,
      });
    }
    res.redirect('/me');
  });

  app.get('/me', requireUser, async (req, res) => {
    const hosting = await db.all(`${partySelect} WHERE p.host_id = ? ORDER BY p.starts_at DESC`, req.user.id);
    const attending = await db.all(`${partySelect.replace(' FROM parties p', ', mine.status AS my_status FROM parties p')}
       JOIN rsvps mine ON mine.party_id = p.id AND mine.user_id = ? AND mine.status != 'declined'
       ORDER BY p.starts_at DESC`, req.user.id);
    res.render('me', { title: 'My parties', hosting, attending });
  });

  app.use((req, res) => {
    res.status(404).render('message', { title: 'Not found', body: 'There’s nothing at this address.', action: { href: '/', label: 'Browse parties' } });
  });

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error(err);
    res.status(500).render('message', { title: 'Something went wrong', body: 'Please try again in a moment.' });
  });

  return app;
}

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

// Parties stay listed until a day after they start; times are wall-clock so this is deliberately lenient.
const cutoff = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 16);

// Only allow redirects back into this site.
const safeNext = (value) => (typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/');

function fmtDate(startsAt) {
  const d = new Date(`${startsAt}:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC',
  }).format(d);
}

// Stable colour per album, for the record sleeve.
function hue(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

module.exports = { createApp };
