// House Music: front-end only proof of concept.
// There is no server here. Everything lives in this browser's localStorage,
// no email is sent, and nothing is shared between visitors. The real app
// (server.js in the repository root) does all of this properly.
(function () {
  'use strict';

  const KEY = 'house-music-demo-v4'; // bump when the sample data changes, so returning visitors see it
  const $ = (id) => document.getElementById(id);

  // ---------- Data ----------

  const pad = (n) => String(n).padStart(2, '0');
  const localIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  function inDays(days, hour, minute) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, minute, 0, 0);
    return localIso(d);
  }

  // Sample people and parties so the demo isn't empty. Dates are relative to today.
  function seed() {
    const user = (id, name) => ({ id, name, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`, pass: null, verified: true, sample: true });
    return {
      nextId: 100,
      me: null,
      users: [user(1, 'Hattie'), user(2, 'Dev'), user(3, 'Priya'), user(4, 'Gus'), user(5, 'Lou'), user(6, 'Marta'), user(7, 'Gemma and Frank'), user(8, 'Paul')],
      parties: [
        { id: 10, hostId: 1, album: 'Blue Lines', artist: 'Massive Attack', cocktail: 'Negroni', startsAt: inDays(5, 19, 30), city: 'Bowerham', address: '12 Sample Street, Lancaster', capacity: 8, notes: 'Shoes off at the door. Vinyl copy, original pressing.' },
        { id: 13, hostId: 7, album: 'Timeless', artist: 'Goldie', cocktail: 'Whiskey Sour', startsAt: inDays(8, 20, 0), city: 'Freehold', address: '9 Demo Lane, Lancaster', capacity: 10, notes: 'Played loud, start to finish, all evening. Bring your dancing shoes.' },
        { id: 11, hostId: 2, album: 'Kind of Blue', artist: 'Miles Davis', cocktail: 'Old Fashioned', startsAt: inDays(12, 20, 0), city: 'Scotforth', address: '4 Example Road, Lancaster', capacity: 6, notes: '' },
        { id: 14, hostId: 8, album: 'Heaven or Las Vegas', artist: 'Cocteau Twins', cocktail: 'Flaming Dr Pepper', startsAt: inDays(15, 19, 30), city: 'Greaves', address: '3 Mock Avenue, Lancaster', capacity: 6, notes: 'Lights low, volume up.' },
        { id: 12, hostId: 3, album: 'Discovery', artist: 'Daft Punk', cocktail: 'French 75', startsAt: inDays(19, 19, 0), city: 'Moorlands', address: '27 Placeholder Terrace, Lancaster', capacity: 2, notes: 'Small flat, so just the two spots.' },
      ],
      rsvps: [
        { partyId: 10, userId: 4, status: 'approved' },
        { partyId: 10, userId: 6, status: 'approved' },
        { partyId: 10, userId: 5, status: 'pending' },
        { partyId: 10, userId: 2, status: 'pending' },
        { partyId: 13, userId: 3, status: 'approved' },
        { partyId: 13, userId: 5, status: 'pending' },
        { partyId: 14, userId: 1, status: 'approved' },
        { partyId: 14, userId: 4, status: 'pending' },
        { partyId: 12, userId: 4, status: 'approved' },
        { partyId: 12, userId: 6, status: 'approved' },
      ],
    };
  }

  let state = load();
  let flash = null; // one-off message shown on the next render

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && Array.isArray(saved.users) && Array.isArray(saved.parties) && Array.isArray(saved.rsvps)) return saved;
    } catch { /* storage blocked or corrupt: start fresh */ }
    return seed();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* demo still works for this visit */ }
  }

  const me = () => state.users.find((u) => u.id === state.me) || null;
  const userById = (id) => state.users.find((u) => u.id === id);
  const partyById = (id) => state.parties.find((p) => p.id === id);
  const rsvp = (partyId, userId) => state.rsvps.find((r) => r.partyId === partyId && r.userId === userId);
  const count = (partyId, status) => state.rsvps.filter((r) => r.partyId === partyId && r.status === status).length;
  const isPast = (p) => p.startsAt < localIso(new Date(Date.now() - 24 * 60 * 60 * 1000));

  async function hashPassword(email, password) {
    const bytes = new TextEncoder().encode(`${email}\n${password}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ---------- Rendering helpers ----------

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function fmtDate(startsAt) {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC',
    }).format(new Date(`${startsAt}:00Z`));
  }

  function hue(text) {
    let h = 0;
    for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) % 360;
    return h;
  }

  function card(p, badge) {
    const going = count(p.id, 'approved');
    const full = going >= p.capacity;
    return `
      <a class="card" href="#/party/${p.id}">
        <div class="sleeve" style="--h: ${hue(p.album + p.artist)}" aria-hidden="true"><span class="disc"></span></div>
        <div class="card-body">
          <p class="when">${esc(fmtDate(p.startsAt))}</p>
          <h3>${esc(p.album)}</h3>
          <p class="artist">${esc(p.artist)}</p>
          <p class="meta">🍸 ${esc(p.cocktail)}</p>
          <p class="meta">${esc(p.city)} · hosted by ${esc(userById(p.hostId).name)}</p>
          <p class="spots ${full ? 'full' : ''}">${full ? 'Full' : `${p.capacity - going} of ${p.capacity} spots left`}</p>
          ${badge || ''}
        </div>
      </a>`;
  }

  const panel = (title, body, action) => `
    <section class="panel">
      <h1>${esc(title)}</h1>
      <p>${body}</p>
      ${action ? `<a class="btn" href="${action.href}">${esc(action.label)}</a>` : ''}
    </section>`;

  const errorBox = (error) => (error ? `<p class="error" role="alert">${esc(error)}</p>` : '');

  // ---------- Pages ----------

  function homePage() {
    const user = me();
    const parties = state.parties.filter((p) => !isPast(p)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return `
      <section class="hero">
        <h1>One house. One album. On repeat.</h1>
        <p>Listening parties in Lancaster. Hosts pick a record, mix a cocktail and open their door for an evening. Ask for a spot, or host your own.</p>
        <a class="btn" href="${user ? '#/host' : '#/register'}">${user ? 'Host a party' : 'Sign up to join in'}</a>
      </section>
      <h2>Upcoming in Lancaster</h2>
      ${parties.length ? `<div class="grid">${parties.map((p) => card(p)).join('')}</div>` : '<p class="empty">Nothing on the calendar yet. Be the first to put a record on.</p>'}`;
  }

  function registerPage(error, values = {}) {
    return `
      <form class="panel" data-form="register">
        <h1>Sign up</h1>
        ${errorBox(error)}
        <label>Your name <input name="name" value="${esc(values.name)}" maxlength="60" autocomplete="name" required></label>
        <label>Email <input type="email" name="email" value="${esc(values.email)}" autocomplete="email" required></label>
        <label>Password <input type="password" name="password" minlength="8" autocomplete="new-password" required>
          <small>At least 8 characters. This is a demo: make one up, don’t reuse a real one.</small></label>
        <button class="btn">Create account</button>
        <p class="alt">Already have an account? <a href="#/login">Sign in</a></p>
      </form>`;
  }

  function checkEmailPage(userId) {
    const user = userById(userId);
    if (!user || user.verified) return homePage();
    return `
      <section class="panel">
        <h1>Check your email</h1>
        <p>We’ve sent a confirmation link to <strong>${esc(user.email)}</strong>. Click it to finish signing up.</p>
        <p class="dev">Demo: no email is really sent. <button class="link" data-action="verify" data-user="${user.id}">Confirm now</button></p>
      </section>`;
  }

  function loginPage(error, email = '') {
    return `
      <form class="panel" data-form="login">
        <h1>Sign in</h1>
        ${errorBox(error)}
        <label>Email <input type="email" name="email" value="${esc(email)}" autocomplete="email" required></label>
        <label>Password <input type="password" name="password" autocomplete="current-password" required></label>
        <button class="btn">Sign in</button>
        <p class="alt">New here? <a href="#/register">Sign up</a>. Or pick a sample person from “Try as” at the top.</p>
      </form>`;
  }

  function hostPage(error, v = { capacity: 8 }) {
    if (!me()) return loginPage('Sign in to host a party.');
    return `
      <form class="panel wide" data-form="party">
        <h1>Host a listening party</h1>
        <p class="lede">Pick one album. It plays on repeat for the whole evening. You approve each guest before they see your address.</p>
        ${errorBox(error)}
        <div class="row">
          <label>Album <input name="album" value="${esc(v.album)}" maxlength="120" required></label>
          <label>Artist <input name="artist" value="${esc(v.artist)}" maxlength="120" required></label>
        </div>
        <div class="row">
          <label>Cocktail you’ll serve <input name="cocktail" value="${esc(v.cocktail)}" maxlength="120" placeholder="Negroni" required></label>
          <label>Date and time <input type="datetime-local" name="startsAt" value="${esc(v.startsAt)}" min="${localIso(new Date())}" required></label>
        </div>
        <div class="row">
          <label>Part of Lancaster <input name="city" value="${esc(v.city)}" maxlength="80" placeholder="Bowerham" required>
            <small>Shown to everyone.</small></label>
          <label>Guest limit <input type="number" name="capacity" value="${esc(v.capacity)}" min="1" max="200" required></label>
        </div>
        <label>Address <input name="address" value="${esc(v.address)}" maxlength="200" required>
          <small>Only shown to guests you approve. This is a demo: use a made-up address.</small></label>
        <label><span>Anything guests should know <span class="opt">(optional)</span></span>
          <textarea name="notes" rows="3" maxlength="1000">${esc(v.notes)}</textarea></label>
        <button class="btn">Publish party</button>
      </form>`;
  }

  function partyPage(id) {
    const p = partyById(id);
    if (!p) return panel('Not found', 'That party doesn’t exist, or the host cancelled it.', { href: '#/', label: 'Browse parties' });
    const user = me();
    const host = userById(p.hostId);
    const isHost = Boolean(user && user.id === p.hostId);
    const mine = user && rsvp(p.id, user.id);
    const status = mine ? mine.status : null;
    const insider = isHost || status === 'approved';
    const going = count(p.id, 'approved');
    const past = isPast(p);
    const people = (s) => state.rsvps.filter((r) => r.partyId === p.id && r.status === s).map((r) => userById(r.userId));
    const act = (action, label, cls, userId) =>
      `<button class="btn ${cls}" data-action="${action}" data-party="${p.id}"${userId ? ` data-user="${userId}"` : ''}>${label}</button>`;

    let actions;
    if (isHost) {
      actions = `
        <p class="notice">You’re hosting this one.</p>
        <details class="confirm">
          <summary class="btn danger">Cancel party</summary>
          <div><p>This removes the party. In the real app, everyone who asked to come is emailed.</p>
          ${act('cancel', 'Yes, cancel it', 'danger')}</div>
        </details>`;
    } else if (status === 'approved') {
      actions = `<p class="notice">You’re on the list. See you there.</p>${act('leave', 'Give up my spot', 'ghost')}`;
    } else if (status === 'pending') {
      actions = `<p class="notice">Request sent. ${esc(host.name)} will get back to you. To see the host’s side, choose ${esc(host.name)} in “Try as” at the top.</p>${act('leave', 'Withdraw request', 'ghost')}`;
    } else if (status === 'declined') {
      actions = '<p class="notice">The host isn’t able to offer you a spot at this one.</p>';
    } else if (past) {
      actions = '<p class="notice">This party has already happened.</p>';
    } else if (going >= p.capacity) {
      actions = '<p class="notice">This party is full.</p>';
    } else if (user) {
      actions = `${act('ask', 'Ask for a spot', '')}<p><small>The host approves each guest.</small></p>`;
    } else {
      actions = '<a class="btn" href="#/login">Sign in to ask for a spot</a>';
    }

    let lists = '';
    if (isHost) {
      const requests = people('pending');
      lists += `<h2>Requests waiting for you</h2>${requests.length ? `<ul class="people">${requests.map((g) => `
        <li><span>${esc(g.name)}</span>${act('approve', 'Approve', 'small', g.id)}${act('decline', 'Decline', 'small ghost', g.id)}</li>`).join('')}</ul>` : '<p class="empty">No requests waiting.</p>'}`;
    }
    if (insider) {
      const guests = people('approved');
      lists += `<h2>Guest list</h2>${guests.length ? `<ul class="people">${guests.map((g) => `
        <li><span>${esc(g.name)}</span>${isHost ? act('decline', 'Remove', 'small ghost', g.id) : ''}</li>`).join('')}</ul>` : '<p class="empty">Nobody is confirmed yet.</p>'}`;
    }

    return `
      <article class="party">
        <div class="sleeve big" style="--h: ${hue(p.album + p.artist)}" aria-hidden="true"><span class="disc"></span></div>
        <div>
          <p class="when">${esc(fmtDate(p.startsAt))}${past ? ' · finished' : ''}</p>
          <h1>${esc(p.album)}</h1>
          <p class="artist">${esc(p.artist)} · on repeat all evening</p>
          <dl>
            <dt>Cocktail</dt><dd>🍸 ${esc(p.cocktail)}</dd>
            <dt>Host</dt><dd>${esc(host.name)}</dd>
            <dt>Where</dt>
            <dd>${esc(p.city)}<br>${insider ? `<strong>${esc(p.address)}</strong>` : '<small>The address is shared once the host approves you.</small>'}</dd>
            <dt>Spots</dt><dd>${going} of ${p.capacity} taken</dd>
          </dl>
          ${p.notes ? `<p class="notes">${esc(p.notes)}</p>` : ''}
          ${actions}
          ${lists}
        </div>
      </article>`;
  }

  function mePage() {
    const user = me();
    if (!user) return loginPage('Sign in to see your parties.');
    const byDate = (a, b) => b.startsAt.localeCompare(a.startsAt);
    const hosting = state.parties.filter((p) => p.hostId === user.id).sort(byDate);
    const attending = state.rsvps
      .filter((r) => r.userId === user.id && r.status !== 'declined' && partyById(r.partyId))
      .map((r) => ({ p: partyById(r.partyId), status: r.status }))
      .sort((a, b) => byDate(a.p, b.p));
    const waitingBadge = (p) => {
      const n = count(p.id, 'pending');
      return n ? `<p class="badge pending">${n} ${n === 1 ? 'request' : 'requests'} waiting</p>` : '';
    };
    return `
      <h1>My parties</h1>
      <h2>Hosting</h2>
      ${hosting.length ? `<div class="grid">${hosting.map((p) => card(p, waitingBadge(p))).join('')}</div>` : '<p class="empty">You’re not hosting anything yet. <a href="#/host">Host a party</a></p>'}
      <h2>Attending</h2>
      ${attending.length ? `<div class="grid">${attending.map(({ p, status }) => card(p, `<p class="badge ${status}">${status === 'approved' ? 'You’re going' : 'Waiting for host'}</p>`)).join('')}</div>` : '<p class="empty">You haven’t asked for a spot at any parties. <a href="#/">Browse what’s on</a></p>'}`;
  }

  // ---------- Shell ----------

  function renderShell() {
    const user = me();
    $('header').innerHTML = `
      <a class="brand" href="#/"><span class="dot" aria-hidden="true"></span>House Music</a>
      <nav>${user
        ? `<a href="#/host">Host a party</a><a href="#/me">My parties</a><button class="link" data-action="signout">Sign out</button>`
        : `<a href="#/login">Sign in</a><a class="btn small" href="#/register">Sign up</a>`}</nav>`;
    const options = state.users.filter((u) => u.verified).map((u) =>
      `<option value="${u.id}"${u.id === state.me ? ' selected' : ''}>${esc(u.name)}${u.sample ? ' (sample)' : ''}</option>`).join('');
    $('demo').innerHTML = `
      <p><strong>Proof of concept.</strong> Everything stays in this browser. No emails are sent and nothing is shared with other visitors.</p>
      <label>Try as <select id="try-as"><option value="">Visitor (signed out)</option>${options}</select></label>
      <button data-action="reset">Reset demo</button>`;
  }

  function render(override) {
    renderShell();
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    let html;
    if (override) html = override;
    else if (parts[0] === 'party') html = partyPage(Number(parts[1]));
    else if (parts[0] === 'register') html = me() ? homePage() : registerPage();
    else if (parts[0] === 'check-email') html = checkEmailPage(Number(parts[1]));
    else if (parts[0] === 'login') html = me() ? homePage() : loginPage();
    else if (parts[0] === 'host') html = hostPage();
    else if (parts[0] === 'me') html = mePage();
    else if (parts[0] === '') html = homePage();
    else html = panel('Not found', 'There’s nothing at this address.', { href: '#/', label: 'Browse parties' });
    $('main').innerHTML = (flash ? `<p class="notice" role="status">${esc(flash)}</p>` : '') + html;
    flash = null;
  }

  function go(hash, message) {
    flash = message || null;
    if (location.hash === hash) render();
    else location.hash = hash; // triggers hashchange -> render
  }

  // ---------- Actions ----------

  const clean = (value, max) => String(value ?? '').trim().slice(0, max);

  const forms = {
    async register(data) {
      const name = clean(data.get('name'), 60);
      const email = clean(data.get('email'), 254).toLowerCase();
      const password = String(data.get('password') || '');
      let error = null;
      if (!name) error = 'Please tell us your name.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = 'That email address doesn’t look right.';
      else if (password.length < 8) error = 'Use a password of at least 8 characters.';
      else if (state.users.some((u) => u.email === email)) error = 'That email already has an account in this demo. Sign in instead.';
      if (error) return render(registerPage(error, { name, email }));
      const user = { id: state.nextId++, name, email, pass: await hashPassword(email, password), verified: false };
      state.users.push(user);
      save();
      go(`#/check-email/${user.id}`);
    },

    async login(data) {
      const email = clean(data.get('email'), 254).toLowerCase();
      const user = state.users.find((u) => u.email === email);
      const ok = user && user.pass && user.pass === await hashPassword(email, String(data.get('password') || ''));
      if (!ok) return render(loginPage('Wrong email or password.', email));
      if (!user.verified) return go(`#/check-email/${user.id}`, 'You still need to confirm your email.');
      state.me = user.id;
      save();
      go('#/');
    },

    party(data) {
      const user = me();
      if (!user) return go('#/login');
      const v = {
        album: clean(data.get('album'), 120),
        artist: clean(data.get('artist'), 120),
        cocktail: clean(data.get('cocktail'), 120),
        startsAt: clean(data.get('startsAt'), 16),
        city: clean(data.get('city'), 80),
        address: clean(data.get('address'), 200),
        capacity: Number.parseInt(data.get('capacity'), 10),
        notes: clean(data.get('notes'), 1000),
      };
      let error = null;
      if (!v.album || !v.artist) error = 'Which album are you playing, and who is it by?';
      else if (!v.cocktail) error = 'Pick the cocktail you’ll be serving.';
      else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.startsAt)) error = 'Choose a date and time.';
      else if (v.startsAt < localIso(new Date())) error = 'That date is in the past.';
      else if (!v.city) error = 'Add your part of Lancaster so guests know roughly where you are.';
      else if (!v.address) error = 'Add your address. Only guests you approve will see it.';
      else if (!(v.capacity >= 1 && v.capacity <= 200)) error = 'Guest limit must be between 1 and 200.';
      if (error) return render(hostPage(error, v));
      const party = { id: state.nextId++, hostId: user.id, ...v };
      state.parties.push(party);
      save();
      go(`#/party/${party.id}`, 'Your party is published.');
    },
  };

  const actions = {
    verify({ user }) {
      const u = userById(user);
      if (!u) return go('#/');
      u.verified = true;
      state.me = u.id;
      save();
      go('#/', `Email confirmed. Welcome, ${u.name}.`);
    },
    signout() {
      state.me = null;
      save();
      go('#/');
    },
    reset() {
      state = seed();
      save();
      go('#/', 'Demo reset to the sample parties.');
    },
    ask({ party }) {
      const p = partyById(party);
      const user = me();
      if (!p || !user || user.id === p.hostId || isPast(p) || rsvp(p.id, user.id) || count(p.id, 'approved') >= p.capacity) return render();
      state.rsvps.push({ partyId: p.id, userId: user.id, status: 'pending' });
      save();
      render();
    },
    leave({ party }) {
      const user = me();
      if (!user) return render();
      // A decline stays on record so the guest can't simply ask again.
      state.rsvps = state.rsvps.filter((r) => !(r.partyId === party && r.userId === user.id && r.status !== 'declined'));
      save();
      render();
    },
    approve({ party, user }) {
      const p = partyById(party);
      const r = rsvp(party, user);
      if (!p || !me() || me().id !== p.hostId || !r || r.status !== 'pending') return render();
      if (count(p.id, 'approved') >= p.capacity) return go(location.hash, 'The party is full, so nobody else can be approved.');
      r.status = 'approved';
      save();
      go(location.hash, `${userById(user).name} is on the guest list. In the real app they get an email.`);
    },
    decline({ party, user }) {
      const p = partyById(party);
      const r = rsvp(party, user);
      if (!p || !me() || me().id !== p.hostId || !r) return render();
      r.status = 'declined';
      save();
      render();
    },
    cancel({ party }) {
      const p = partyById(party);
      if (!p || !me() || me().id !== p.hostId) return render();
      state.parties = state.parties.filter((x) => x.id !== party);
      state.rsvps = state.rsvps.filter((r) => r.partyId !== party);
      save();
      go('#/me', 'Party cancelled.');
    },
  };

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    forms[form.dataset.form](new FormData(form));
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    actions[button.dataset.action]({ party: Number(button.dataset.party), user: Number(button.dataset.user) });
  });

  document.addEventListener('change', (event) => {
    if (event.target.id !== 'try-as') return;
    state.me = Number(event.target.value) || null;
    save();
    render();
  });

  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  render();
})();
