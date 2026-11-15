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
  app.use((req, res, next) => {
    const token = auth.readCookie(req, auth.SESSION_COOKIE);
    req.user = null;
    if (token) {
      req.user = db.prepare(
        `SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires > ?`
      ).get(auth.hashToken(token), Date.now()) || null;
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
    db.prepare('UPDATE users SET verify_token_hash = ?, verify_expires = ? WHERE id = ?')
      .run(auth.hashToken(token), Date.now() + auth.VERIFY_TTL_MS, user.id);
    const link = `${baseUrl}/verify?token=${token}`;
    await mailer.send({
      to: user.email,
      subject: 'Confirm your email for House Music',
      text: `Hi ${user.name},\n\nConfirm your email to start hosting and attending listening parties:\n\n${link}\n\nThis link expires in 24 hours. If you didn't sign up, ignore this email.`,
    });
    return link;
  }

  function startSession(res, userId) {
    const token = auth.newToken();
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)')
      .run(auth.hashToken(token), userId, Date.now() + auth.SESSION_TTL_MS);
    res.cookie(auth.SESSION_COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: auth.SESSION_TTL_MS, path: '/',
    });
  }

  const partySelect = `
    SELECT p.*, u.name AS host_name,
           (SELECT COUNT(*) FROM rsvps r WHERE r.party_id = p.id) AS going
    FROM parties p JOIN users u ON u.id = p.host_id`;

  // ---------- Browse ----------

  app.get('/', (req, res) => {
    const parties = db.prepare(`${partySelect} WHERE p.starts_at >= ? ORDER BY p.starts_at LIMIT 200`).all(cutoff());
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
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!existing) {
      const info = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
        .run(name, email, await auth.hashPassword(password));
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

  app.get('/verify', (req, res) => {
    const token = String(req.query.token || '');
    const user = token && db.prepare('SELECT * FROM users WHERE verify_token_hash = ? AND verify_expires > ?')
      .get(auth.hashToken(token), Date.now());
    if (!user) {
      return res.status(400).render('message', {
        title: 'Link expired',
        body: 'That confirmation link is invalid or has expired. Sign in to get a fresh one.',
        action: { href: '/login', label: 'Sign in' },
      });
    }
    db.prepare(`UPDATE users SET verified_at = datetime('now'), verify_token_hash = NULL, verify_expires = NULL WHERE id = ?`)
      .run(user.id);
    startSession(res, user.id);
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
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
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
    startSession(res, user.id);
    res.redirect(next);
  });

  app.post('/logout', (req, res) => {
    const token = auth.readCookie(req, auth.SESSION_COOKIE);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(auth.hashToken(token));
    res.clearCookie(auth.SESSION_COOKIE, { path: '/' });
    res.redirect('/');
  });

  // ---------- Hosting ----------

  app.get('/parties/new', requireUser, (req, res) => {
    res.render('party-form', { title: 'Host a party', error: null, values: { capacity: 8 }, minDate: cutoff() });
  });

  app.post('/parties', requireUser, (req, res) => {
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
    else if (!v.city) error = 'Add a neighbourhood or city so guests know roughly where you are.';
    else if (!v.address) error = 'Add your address. Only guests who sign up will see it.';
    else if (!(v.capacity >= 1 && v.capacity <= 200)) error = 'Guest limit must be between 1 and 200.';
    if (error) return res.status(400).render('party-form', { title: 'Host a party', error, values: v, minDate: cutoff() });

    const info = db.prepare(
      `INSERT INTO parties (host_id, album, artist, cocktail, starts_at, city, address, capacity, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(req.user.id, v.album, v.artist, v.cocktail, v.starts_at, v.city, v.address, v.capacity, v.notes);
    res.redirect(`/parties/${info.lastInsertRowid}`);
  });

  function loadParty(req, res, next) {
    const id = Number(req.params.id);
    const party = Number.isInteger(id) ? db.prepare(`${partySelect} WHERE p.id = ?`).get(id) : null;
    if (!party) return res.status(404).render('message', { title: 'Not found', body: 'That party doesn’t exist, or the host cancelled it.', action: { href: '/', label: 'Browse parties' } });
    req.party = party;
    next();
  }

  app.get('/parties/:id', loadParty, (req, res) => {
    const party = req.party;
    const isHost = Boolean(req.user && req.user.id === party.host_id);
    const isGoing = Boolean(req.user && db.prepare('SELECT 1 FROM rsvps WHERE party_id = ? AND user_id = ?').get(party.id, req.user.id));
    // The street address and the guest list are private to the host and confirmed guests.
    const insider = isHost || isGoing;
    const guests = insider
      ? db.prepare('SELECT u.name FROM rsvps r JOIN users u ON u.id = r.user_id WHERE r.party_id = ? ORDER BY r.created_at').all(party.id)
      : [];
    res.render('party', {
      title: `${party.album} at ${party.host_name}’s`,
      party: { ...party, address: insider ? party.address : null },
      isHost, isGoing, guests,
      past: party.starts_at < cutoff(),
      error: req.query.full ? 'Sorry, the last spot just went.' : null,
    });
  });

  app.post('/parties/:id/rsvp', requireUser, loadParty, (req, res) => {
    const party = req.party;
    if (party.host_id === req.user.id || party.starts_at < cutoff()) return res.redirect(`/parties/${party.id}`);
    // Only take the spot if there is still room; done in one statement so two people can't both get the last one.
    const info = db.prepare(
      `INSERT OR IGNORE INTO rsvps (party_id, user_id)
       SELECT ?, ? WHERE (SELECT COUNT(*) FROM rsvps WHERE party_id = ?) < ?`
    ).run(party.id, req.user.id, party.id, party.capacity);
    const already = db.prepare('SELECT 1 FROM rsvps WHERE party_id = ? AND user_id = ?').get(party.id, req.user.id);
    res.redirect(`/parties/${party.id}${info.changes || already ? '' : '?full=1'}`);
  });

  app.post('/parties/:id/leave', requireUser, loadParty, (req, res) => {
    db.prepare('DELETE FROM rsvps WHERE party_id = ? AND user_id = ?').run(req.party.id, req.user.id);
    res.redirect(`/parties/${req.party.id}`);
  });

  app.post('/parties/:id/cancel', requireUser, loadParty, async (req, res) => {
    const party = req.party;
    if (party.host_id !== req.user.id) return res.status(403).render('message', { title: 'Not allowed', body: 'Only the host can cancel a party.' });
    const guests = db.prepare('SELECT u.name, u.email FROM rsvps r JOIN users u ON u.id = r.user_id WHERE r.party_id = ?').all(party.id);
    db.prepare('DELETE FROM parties WHERE id = ?').run(party.id);
    // Let guests know so nobody turns up at a closed door.
    for (const g of guests) {
      try {
        await mailer.send({
          to: g.email,
          subject: `Cancelled: ${party.album} at ${party.host_name}’s`,
          text: `Hi ${g.name},\n\n${party.host_name} has cancelled the ${party.album} listening party on ${fmtDate(party.starts_at)}.\n\nFind another one: ${baseUrl}/`,
        });
      } catch (err) {
        console.error('Failed to send cancellation email:', err.message);
      }
    }
    res.redirect('/me');
  });

  app.get('/me', requireUser, (req, res) => {
    const hosting = db.prepare(`${partySelect} WHERE p.host_id = ? ORDER BY p.starts_at DESC`).all(req.user.id);
    const attending = db.prepare(
      `${partySelect} JOIN rsvps mine ON mine.party_id = p.id AND mine.user_id = ? ORDER BY p.starts_at DESC`
    ).all(req.user.id);
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
