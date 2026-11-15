// House Music: front-end only proof of concept.
// There is no server here. Everything lives in this browser's localStorage,
// no email is sent, and nothing is shared between visitors. The real app
// (server.js in the repository root) does all of this properly.
(function () {
  'use strict';

  const KEY = 'house-music-demo-v12'; // bump when the sample data changes, so returning visitors see it
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

  // A night has three slots. Each house opens for one or more of them, so
  // guests can hop: happy hour at one house, 8pm at another, late at a third.
  // Each slot has its own guest limit, and nobody can be in two houses at once.
  const PRICE = 15; // pounds per slot
  const SLOTS = [
    { id: 'happy', time: '17:00', label: 'Happy hour', at: '5pm' },
    { id: 'early', time: '20:00', label: 'Early evening', at: '8pm' },
    { id: 'late', time: '22:00', label: 'Late', at: '10pm' },
  ];
  const slotById = (id) => SLOTS.find((x) => x.id === id);
  const money = (pounds) => `£${pounds}`;

  // The next Saturday at least three days away, for the sample crawl nights.
  function daysToSaturday() {
    const n = (6 - new Date().getDay() + 7) % 7;
    return n < 3 ? n + 7 : n;
  }

  // Sample people and parties so the demo isn't empty. Dates are relative to today.
  function seed() {
    const a = daysToSaturday(), b = a + 7; // two crawl nights, a week apart
    const night = (days, slot) => { const [h, m] = slotById(slot).time.split(':'); return inDays(days, Number(h), Number(m)); };
    const user = (id, name, bio) => ({ id, name, bio, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`, pass: null, verified: true, sample: true });
    return {
      nextId: 100,
      me: null,
      users: [
        user(1, 'Hattie', 'Trip-hop lifer. Owns too many turntables and not enough shelves.'),
        user(2, 'Dev', 'Jazz on Sundays, everything else the rest of the week.'),
        user(3, 'Priya', 'French house evangelist. Will dance in a small flat.'),
        user(4, 'Gus', 'Record shop regular. Ask me about B-sides.'),
        user(5, 'Lou', 'New to Lancaster and looking for good records and good company.'),
        user(6, 'Marta', 'Shoegaze, dream pop and a decent gin.'),
        user(7, 'Gemma and Frank', 'Drum and bass couple. The speakers are bigger than the sofa.'),
        user(8, 'Paul', 'Lights low, volume up.'),
        user(9, 'Sophie', 'London jazz, loud. Makes a mean mezcal martini.'),
        user(10, 'Tommack', 'a funghi-loving fun guy'),
        user(11, 'Kriss', 'Keeps it simple: a loud record and a cold pint.'),
      ],
      parties: [
        { id: 10, hostId: 1, album: 'Blue Lines', artist: 'Massive Attack', cocktail: 'Negroni', softDrink: 'Bitter orange spritz', slots: ['happy', 'early'], startsAt: night(a, 'happy'), city: 'Bowerham', address: '12 Sample Street, Lancaster', capacity: 8, notes: 'Shoes off at the door. Vinyl copy, original pressing.' },
        { id: 13, hostId: 7, album: 'Timeless', artist: 'Goldie', cocktail: 'Whiskey Sour', softDrink: 'Ginger and lime sour', slots: ['early', 'late'], startsAt: night(a, 'early'), city: 'Freehold', address: '9 Demo Lane, Lancaster', capacity: 10, notes: 'Played loud, start to finish, all evening. Bring your dancing shoes.' },
        { id: 11, hostId: 2, album: 'Kind of Blue', artist: 'Miles Davis', cocktail: 'Old Fashioned', softDrink: 'Cold brew tonic', slots: ['happy', 'late'], startsAt: night(a, 'happy'), city: 'Scotforth', address: '4 Example Road, Lancaster', capacity: 6, notes: '' },
        { id: 14, hostId: 8, album: 'Heaven or Las Vegas', artist: 'Cocteau Twins', cocktail: 'Flaming Dr Pepper', softDrink: 'Cherry vanilla soda', slots: ['happy', 'early'], startsAt: night(b, 'happy'), city: 'Greaves', address: '3 Mock Avenue, Lancaster', capacity: 6, notes: 'Lights low, volume up.' },
        { id: 12, hostId: 3, album: 'Discovery', artist: 'Daft Punk', cocktail: 'French 75', softDrink: 'Elderflower fizz', slots: ['early', 'late'], startsAt: night(b, 'early'), city: 'Moorlands', address: '27 Placeholder Terrace, Lancaster', capacity: 2, notes: 'Small flat, so just the two spots.' },
        { id: 15, hostId: 9, album: 'Your Queen Is a Reptile', artist: 'Sons of Kemet', cocktail: 'Mezcal Espresso Martini', softDrink: 'Espresso tonic', slots: ['happy', 'early', 'late'], startsAt: night(a, 'happy'), city: 'Skerton', address: '15 Trial Close, Lancaster', capacity: 8, notes: 'Saxophone, tuba and two drummers. Expect to move.' },
        { id: 16, hostId: 11, album: 'Dog Brainz', artist: 'Dog Brainz', cocktail: 'Lager & Lime', softDrink: 'Lime and soda', slots: ['early', 'late'], startsAt: night(b, 'early'), city: 'Marsh', address: '21 Pretend Row, Lancaster', capacity: 8, notes: 'No shaker required.' },
      ],
      // status: pending (asked) -> approved (host said yes, payment due) -> paid (confirmed); or declined
      rsvps: [
        // First night: Tommack and Gus are hopping between houses
        { partyId: 10, userId: 10, slots: ['happy'], status: 'paid' },
        { partyId: 15, userId: 10, slots: ['early'], status: 'paid' },
        { partyId: 13, userId: 10, slots: ['late'], status: 'paid' },
        { partyId: 10, userId: 4, slots: ['happy'], status: 'paid' },
        { partyId: 13, userId: 4, slots: ['early', 'late'], status: 'paid' },
        { partyId: 10, userId: 6, slots: ['early'], status: 'paid' },
        { partyId: 13, userId: 3, slots: ['early', 'late'], status: 'paid' },
        { partyId: 15, userId: 8, slots: ['early', 'late'], status: 'paid' },
        { partyId: 15, userId: 2, slots: ['early'], status: 'pending' },
        { partyId: 13, userId: 1, slots: ['late'], status: 'pending' },
        // Second night
        { partyId: 14, userId: 1, slots: ['early'], status: 'paid' },
        { partyId: 14, userId: 4, slots: ['happy'], status: 'approved' },
        { partyId: 14, userId: 5, slots: ['happy'], status: 'pending' },
        { partyId: 12, userId: 4, slots: ['early', 'late'], status: 'paid' },
        { partyId: 12, userId: 6, slots: ['early', 'late'], status: 'paid' },
        { partyId: 16, userId: 10, slots: ['early'], status: 'paid' },
        { partyId: 16, userId: 5, slots: ['late'], status: 'pending' },
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
  // Approved guests hold their spots while they pay.
  const holds = (r) => r.status === 'approved' || r.status === 'paid';
  const taken = (partyId, slot) => state.rsvps.filter((r) => r.partyId === partyId && holds(r) && r.slots.includes(slot)).length;
  const left = (p, slot) => Math.max(0, p.capacity - taken(p.id, slot));
  const offered = (p) => SLOTS.filter((x) => (p.slots || SLOTS.map((y) => y.id)).includes(x.id));
  const isFull = (p) => offered(p).every((x) => left(p, x.id) === 0);
  const dayOf = (p) => p.startsAt.slice(0, 10);
  // Where is this person during a slot on a date? Hosting, or booked (asked, approved or paid) at a house.
  function busyAt(userId, date, slot, exceptPartyId) {
    const hosting = state.parties.find((p) => p.id !== exceptPartyId && p.hostId === userId && dayOf(p) === date && offered(p).some((x) => x.id === slot));
    if (hosting) return { party: hosting, hosting: true };
    const r = state.rsvps.find((x) => x.userId === userId && x.partyId !== exceptPartyId && x.status !== 'declined' && x.slots.includes(slot)
      && partyById(x.partyId) && dayOf(partyById(x.partyId)) === date);
    return r ? { party: partyById(r.partyId), hosting: false } : null;
  }
  const busyText = (b) => (b.hosting ? `You’re hosting ${b.party.album} then` : `You’re at ${b.party.album} then`);
  const cost = (r) => r.slots.length * PRICE;
  const slotNames = (slots) => SLOTS.filter((x) => slots.includes(x.id)).map((x) => `${x.label} (${x.at})`).join(', ');
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
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(`${startsAt}:00Z`));
  }

  function hue(text) {
    let h = 0;
    for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) % 360;
    return h;
  }

  // ---------- Album covers ----------
  // Looked up from the public iTunes Search API by artist and album name, and
  // loaded straight from Apple's image servers. The coloured sleeve stays as
  // the fallback when there is no confident match or the lookup fails.

  const COVERS_KEY = 'house-music-covers-v1';
  let covers = {};
  try { covers = JSON.parse(localStorage.getItem(COVERS_KEY)) || {}; } catch { /* no cache */ }
  const lookups = new Set(); // keys being fetched right now

  const norm = (text) => String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
  const coverKey = (p) => `${norm(p.artist)}|${norm(p.album)}`;
  const coverImg = (url, big) => `<img src="${esc(url.replace('100x100bb', big ? '600x600bb' : '200x200bb'))}" alt="" loading="lazy">`;

  function sleeve(p, big) {
    const url = covers[coverKey(p)];
    return `<div class="sleeve${big ? ' big' : ''}" style="--h: ${hue(p.album + p.artist)}" aria-hidden="true"
      data-cover="${esc(coverKey(p))}" data-artist="${esc(p.artist)}" data-album="${esc(p.album)}"><span class="disc"></span>${url ? coverImg(url, big) : ''}</div>`;
  }

  // Only accept a result for the same artist whose title is the album, or the album plus an edition suffix.
  function pickCover(results, artist, album) {
    const a = norm(artist), t = norm(album);
    const same = results.filter((r) => r.artworkUrl100 && norm(r.artistName) === a);
    const hit = same.find((r) => norm(r.collectionName) === t) || same.find((r) => norm(r.collectionName).startsWith(`${t} `));
    return hit ? hit.artworkUrl100 : '';
  }

  async function findCover(key, artist, album) {
    if (!norm(artist) || !norm(album) || lookups.has(key)) return;
    lookups.add(key);
    try {
      const query = new URLSearchParams({ term: `${artist} ${album}`, entity: 'album', country: 'GB', limit: '25' });
      const res = await fetch(`https://itunes.apple.com/search?${query}`);
      if (!res.ok) return; // try again on a later visit
      covers[key] = pickCover((await res.json()).results || [], artist, album);
      try { localStorage.setItem(COVERS_KEY, JSON.stringify(covers)); } catch { /* fine */ }
      if (!covers[key]) return;
      for (const el of document.querySelectorAll('.sleeve[data-cover]')) {
        if (el.dataset.cover === key && !el.querySelector('img')) {
          el.insertAdjacentHTML('beforeend', coverImg(covers[key], el.classList.contains('big')));
        }
      }
    } catch { /* offline or blocked: the coloured sleeve stays */ } finally {
      lookups.delete(key);
    }
  }

  function loadCovers() {
    for (const el of document.querySelectorAll('.sleeve[data-cover]')) {
      if (!(el.dataset.cover in covers)) findCover(el.dataset.cover, el.dataset.artist, el.dataset.album);
    }
  }

  // A cover or cocktail photo that fails to load is removed (the coloured sleeve shows instead of a cover).
  document.addEventListener('error', (event) => {
    if (event.target.matches && event.target.matches('.sleeve img, #recipe-body img')) event.target.remove();
  }, true);

  // ---------- Cocktail recipes ----------
  // Looked up by name from TheCocktailDB's public API when a cocktail is clicked.

  const recipes = new Map(); // normalised name -> recipe object, or null when there is no match

  const cocktailButton = (name) =>
    `<button class="cocktail" data-recipe="${esc(name)}" aria-haspopup="dialog" title="How to make it">${esc(name)}</button>`;

  async function findRecipe(name) {
    const key = norm(name);
    if (recipes.has(key)) return recipes.get(key);
    // The API matches on spelling, so also try the first word and the other spelling of whisky.
    const terms = [name, name.replace(/whisky/i, 'whiskey'), name.trim().split(/\s+/)[0]];
    const wanted = new Set([key, norm(name.replace(/whisky/i, 'whiskey'))]);
    let found = null;
    for (const term of [...new Set(terms)]) {
      if (term.length < 3) continue;
      const res = await fetch(`https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${encodeURIComponent(term)}`);
      if (!res.ok) throw new Error('lookup failed');
      const drinks = (await res.json()).drinks;
      found = (Array.isArray(drinks) ? drinks : []).find((d) => wanted.has(norm(d.strDrink))) || null;
      if (found) break;
    }
    recipes.set(key, found);
    return found;
  }

  function recipeHtml(d) {
    const rows = [];
    for (let i = 1; i <= 15; i++) {
      const ingredient = (d[`strIngredient${i}`] || '').trim();
      if (ingredient) rows.push(`<li>${esc(`${(d[`strMeasure${i}`] || '').trim()} ${ingredient}`.trim())}</li>`);
    }
    return `
      ${d.strDrinkThumb ? `<img src="${esc(d.strDrinkThumb)}/medium" alt="">` : ''}
      ${d.strGlass ? `<p class="glass">Serve in: ${esc(d.strGlass.toLowerCase())}</p>` : ''}
      <h3>Ingredients</h3>
      <ul>${rows.join('')}</ul>
      <h3>Method</h3>
      <p>${esc(d.strInstructions || 'No method given.')}</p>
      <p class="source">Recipe from TheCocktailDB.</p>`;
  }

  async function showRecipe(name) {
    const dialog = $('recipe');
    $('recipe-title').textContent = name;
    $('recipe-body').innerHTML = '<p class="empty">Finding the recipe…</p>';
    if (!dialog.open) dialog.showModal();
    let html;
    try {
      const drink = await findRecipe(name);
      html = drink ? recipeHtml(drink) : '<p class="empty">We couldn’t find a recipe for this one. Ask the host what goes in it.</p>';
    } catch {
      html = '<p class="empty">The recipe couldn’t be loaded just now. Try again in a moment.</p>';
    }
    // Ignore the answer if a different cocktail was opened in the meantime.
    if (dialog.open && $('recipe-title').textContent === name) $('recipe-body').innerHTML = html;
  }

  function card(p, badge) {
    const full = isFull(p);
    return `
      <div class="card">
        ${sleeve(p, false)}
        <div class="card-body">
          <p class="when">${esc(fmtDate(p.startsAt))}</p>
          <h3><a href="#/party/${p.id}">${esc(p.album)}</a></h3>
          <p class="artist">${esc(p.artist)}</p>
          <p class="meta">🍸 ${cocktailButton(p.cocktail)} · <span class="zero">alcohol-free: ${esc(p.softDrink)}</span></p>
          <p class="meta">${esc(p.city)} · hosted by ${esc(userById(p.hostId).name)}</p>
          <p class="spots ${full ? 'full' : ''}">${full ? 'Sold out' : `${money(PRICE)} a slot`}</p>
          <p class="slot-strip">${offered(p).map((x) => { const n = left(p, x.id); return `<span class="${n ? '' : 'gone'}">${x.at} · ${n ? `${n} left` : 'full'}</span>`; }).join('')}</p>
          ${badge || ''}
        </div>
      </div>`;
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
    const nights = [...new Set(parties.map(dayOf))];
    return `
      <section class="hero">
        <h1>One house. One album. On repeat.</h1>
        <p>Listening parties in Lancaster. Hosts pick a record, mix a cocktail and open their door. Each night has three slots: happy hour at 5, early evening at 8 and late at 10. Stay at one house, or hop between them. ${money(PRICE)} a slot.</p>
        <a class="btn" href="${user ? '#/host' : '#/register'}">${user ? 'Host a party' : 'Sign up to join in'}</a>
      </section>
      ${nights.length ? nights.map((date) => {
        const here = parties.filter((p) => dayOf(p) === date);
        return `
      <section class="night">
        <div class="night-head">
          <h2>${esc(fmtDate(`${date}T00:00`))} <span>${here.length} ${here.length === 1 ? 'house' : 'houses'}</span></h2>
          ${here.length > 1 ? `<a class="btn small ghost" href="#/night/${date}">Plan your night</a>` : ''}
        </div>
        <div class="grid">${here.map((p) => card(p)).join('')}</div>
      </section>`; }).join('') : '<p class="empty">Nothing on the calendar yet. Be the first to put a record on.</p>'}`;
  }

  // Plan a night across houses: one house per slot.
  function nightPage(date, error) {
    const user = me();
    const here = state.parties.filter((p) => dayOf(p) === date && !isPast(p));
    if (!here.length) return panel('Nothing on', 'There are no parties that night.', { href: '#/', label: 'Browse parties' });
    const rows = SLOTS.map((x) => {
      const open = here.filter((p) => offered(p).some((y) => y.id === x.id));
      const busy = user && busyAt(user.id, date, x.id);
      let body;
      if (!open.length) body = '<p class="empty">No houses are open for this slot.</p>';
      else if (busy) body = `<p class="locked">${esc(busyText(busy))}. <a href="#/party/${busy.party.id}">See the party</a></p>`;
      else {
        body = `
          <label class="hop none"><input type="radio" name="${x.id}" value="" checked><span>Not this slot</span></label>
          ${open.map((p) => {
            const n = left(p, x.id);
            const own = user && p.hostId === user.id;
            const already = user && rsvp(p.id, user.id);
            const why = own ? 'Your party' : already ? 'You’ve already asked here' : !n ? 'Full' : `${n} left`;
            const off = own || already || !n;
            return `
          <label class="hop${off ? ' gone' : ''}"><input type="radio" name="${x.id}" value="${p.id}"${off ? ' disabled' : ''}>
            <span class="hop-what"><strong>${esc(p.album)}</strong> <em>${esc(p.artist)}</em>
              <small>${esc(userById(p.hostId).name)}’s, ${esc(p.city)} · 🍸 ${esc(p.cocktail)} · 🍹 ${esc(p.softDrink)}</small></span>
            <span class="slot-left">${why}</span><span class="slot-price">${money(PRICE)}</span></label>`; }).join('')}`;
      }
      return `<fieldset class="hop-slot"><legend>${x.label} <small>${x.at}</small></legend>${body}</fieldset>`;
    }).join('');
    return `
      <form class="planner" data-form="night" data-date="${date}">
        <p class="when">${esc(fmtDate(`${date}T00:00`))}</p>
        <h1>Plan your night</h1>
        <p class="lede">Pick a house for each slot you want: stay put, or start at one and move on to the next. ${money(PRICE)} a slot. Each host approves you, then you pay them separately.</p>
        ${errorBox(error)}
        ${rows}
        <p class="total">Total <strong data-total>${money(0)}</strong></p>
        ${user ? '<button class="btn">Ask for these spots</button>' : '<a class="btn" href="#/login">Sign in to plan your night</a>'}
      </form>`;
  }

  function registerPage(error, values = {}) {
    return `
      <form class="panel" data-form="register">
        <h1>Sign up</h1>
        ${errorBox(error)}
        <label>Your name <input name="name" value="${esc(values.name)}" maxlength="60" autocomplete="name" required></label>
        <label><span>A line about you <span class="opt">(optional)</span></span>
          <input name="bio" value="${esc(values.bio)}" maxlength="140" placeholder="Northern soul on vinyl, and a good Manhattan.">
          <small>Other guests see this on parties you’re going to.</small></label>
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
        <p class="lede">Pick one album and play it on repeat. Choose which of the night’s slots you’ll open your door for. Guests can stay with you or hop between houses. They pay ${money(PRICE)} a slot once you’ve approved them, and only then see your address.</p>
        ${errorBox(error)}
        <div class="row">
          <label>Album <input name="album" value="${esc(v.album)}" maxlength="120" required></label>
          <label>Artist <input name="artist" value="${esc(v.artist)}" maxlength="120" required></label>
        </div>
        <div class="row">
          <label>Cocktail you’ll serve <input name="cocktail" value="${esc(v.cocktail)}" maxlength="120" placeholder="Negroni" required></label>
          <label>Alcohol-free drink <input name="softDrink" value="${esc(v.softDrink)}" maxlength="120" placeholder="Bitter orange spritz" required>
            <small>Every party offers one, so everyone has something good to drink.</small></label>
        </div>
        <div class="row">
          <label>Date <input type="date" name="date" value="${esc(v.date)}" min="${localIso(new Date()).slice(0, 10)}" required></label>
          <label>Guests per slot <input type="number" name="capacity" value="${esc(v.capacity)}" min="1" max="200" required></label>
        </div>
        <fieldset class="host-slots"><legend>Slots you’re open for</legend>
          ${SLOTS.map((x) => `<label><input type="checkbox" name="slots" value="${x.id}"${!v.slots || v.slots.includes(x.id) ? ' checked' : ''}> ${x.label}, ${x.at}</label>`).join('')}
        </fieldset>
        <div class="row">
          <label>Part of Lancaster <input name="city" value="${esc(v.city)}" maxlength="80" placeholder="Bowerham" required>
            <small>Shown to everyone.</small></label>
          <label>Address <input name="address" value="${esc(v.address)}" maxlength="200" required>
            <small>Only shown to guests who are approved and paid. This is a demo: use a made-up address.</small></label>
        </div>
        <label><span>Anything guests should know <span class="opt">(optional)</span></span>
          <textarea name="notes" rows="3" maxlength="1000">${esc(v.notes)}</textarea></label>
        <button class="btn">Publish party</button>
      </form>`;
  }

  function partyPage(id, error) {
    const p = partyById(id);
    if (!p) return panel('Not found', 'That party doesn’t exist, or the host cancelled it.', { href: '#/', label: 'Browse parties' });
    const user = me();
    const host = userById(p.hostId);
    const isHost = Boolean(user && user.id === p.hostId);
    const mine = user && rsvp(p.id, user.id);
    const status = mine ? mine.status : null;
    const insider = isHost || status === 'paid';
    const past = isPast(p);
    const act = (action, label, cls, userId) =>
      `<button class="btn ${cls}" data-action="${action}" data-party="${p.id}"${userId ? ` data-user="${userId}"` : ''}>${label}</button>`;
    const chips = (slots) => SLOTS.filter((x) => slots.includes(x.id)).map((x) => `<span class="chip">${x.at}</span>`).join('');

    let actions;
    if (isHost) {
      actions = `
        <p class="notice">You’re hosting this one.</p>
        <details class="confirm">
          <summary class="btn danger">Cancel party</summary>
          <div><p>This removes the party. In the real app, everyone who asked to come is emailed and anyone who paid is refunded.</p>
          ${act('cancel', 'Yes, cancel it', 'danger')}</div>
        </details>`;
    } else if (status === 'paid') {
      actions = `<p class="notice">You’re going: ${esc(slotNames(mine.slots))}. Paid ${money(cost(mine))}. See you there.</p>
        <details class="confirm">
          <summary class="btn ghost">Give up my spot</summary>
          <div><p>Your ${money(cost(mine))} would be refunded. In this demo no money changes hands.</p>${act('leave', 'Yes, give it up', 'ghost')}</div>
        </details>`;
    } else if (status === 'approved') {
      actions = `<p class="notice">${esc(host.name)} said yes to ${esc(slotNames(mine.slots))}. Pay to confirm your place and see the address.</p>
        <a class="btn" href="#/pay/${p.id}">Pay ${money(cost(mine))}</a> ${act('leave', 'Withdraw', 'ghost')}`;
    } else if (status === 'pending') {
      actions = `<p class="notice">Request sent for ${esc(slotNames(mine.slots))}. ${esc(host.name)} will get back to you, and you pay once they’ve said yes. To see the host’s side, choose ${esc(host.name)} in “Try as” at the top.</p>${act('leave', 'Withdraw request', 'ghost')}`;
    } else if (status === 'declined') {
      actions = '<p class="notice">The host isn’t able to offer you a spot at this one.</p>';
    } else if (past) {
      actions = '<p class="notice">This party has already happened.</p>';
    } else if (isFull(p)) {
      actions = '<p class="notice">Every slot at this party is sold out.</p>';
    } else if (user) {
      actions = `
        <form class="book" data-form="ask" data-party="${p.id}">
          <h2>Choose your slots</h2>
          <p class="lede">${offered(p).length > 1 ? `Come for one or more. ` : ''}${money(PRICE)} a slot. Other houses are open the same night, so you can <a href="#/night/${dayOf(p)}">plan a night across houses</a>.</p>
          ${errorBox(error)}
          ${offered(p).length === SLOTS.length && SLOTS.every((x) => left(p, x.id) && !busyAt(user.id, dayOf(p), x.id, p.id)) ? `
          <label class="slot whole"><input type="checkbox" data-whole>
            <span class="slot-name">The whole night<small>5pm, 8pm and 10pm</small></span>
            <span class="slot-left">all three slots</span><span class="slot-price">${money(PRICE * SLOTS.length)}</span></label>` : ''}
          ${offered(p).map((x) => { const n = left(p, x.id); const busy = busyAt(user.id, dayOf(p), x.id, p.id); const ok = n && !busy; return `
          <label class="slot${ok ? '' : ' gone'}"><input type="checkbox" name="slot" value="${x.id}"${ok ? '' : ' disabled'}>
            <span class="slot-name">${x.label}<small>${x.at}</small></span>
            <span class="slot-left">${busy ? esc(busyText(busy)) : n ? `${n} left` : 'Full'}</span><span class="slot-price">${money(PRICE)}</span></label>`; }).join('')}
          <p class="total">Total <strong data-total>${money(0)}</strong></p>
          <button class="btn">Ask for a spot</button>
          <p><small>The host approves each guest. You only pay once they’ve said yes.</small></p>
        </form>`;
    } else {
      actions = `<a class="btn" href="#/login">Sign in to book</a>`;
    }

    let lists = '';
    if (isHost) {
      const requests = state.rsvps.filter((r) => r.partyId === p.id && r.status === 'pending');
      lists += `<h2>Requests waiting for you</h2>${requests.length ? `<ul class="people">${requests.map((r) => `
        <li><span>${esc(userById(r.userId).name)} ${chips(r.slots)}</span>${act('approve', 'Approve', 'small', r.userId)}${act('decline', 'Decline', 'small ghost', r.userId)}</li>`).join('')}</ul>` : '<p class="empty">No requests waiting.</p>'}`;
      const sold = state.rsvps.filter((r) => r.partyId === p.id && r.status === 'paid');
      const tickets = sold.reduce((n, r) => n + r.slots.length, 0);
      lists += `<h2>Ticket sales</h2><p class="takings"><strong>${money(tickets * PRICE)}</strong> from ${tickets} ${tickets === 1 ? 'ticket' : 'tickets'}</p>`;
    }
    // Everyone signed in can see who's coming (approved guests), but not the address.
    const guests = state.rsvps.filter((r) => r.partyId === p.id && holds(r));
    const guestItem = (r) => {
      const g = userById(r.userId);
      return `<li><span><strong>${esc(g.name)}</strong> ${chips(r.slots)}${isHost && r.status === 'approved' ? ' <small>payment due</small>' : ''}
        ${g.bio ? `<em class="bio">${esc(g.bio)}</em>` : ''}</span>${isHost ? act('decline', 'Remove', 'small ghost', r.userId) : ''}</li>`;
    };
    if (isHost) {
      lists += `<h2>Guest list</h2>${guests.length ? `<ul class="people">${guests.map(guestItem).join('')}</ul>` : '<p class="empty">Nobody is confirmed yet.</p>'}`;
    } else {
      lists += `
        <details class="attending"${status === 'paid' ? ' open' : ''}>
          <summary>See who’s attending <span>${guests.length}</span></summary>
          ${!user ? '<p class="empty"><a href="#/login">Sign in</a> to see who’s coming.</p>'
            : guests.length ? `<ul class="people">${guests.map(guestItem).join('')}</ul>` : '<p class="empty">Nobody is confirmed yet. Be the first.</p>'}
        </details>`;
    }

    return `
      <article class="party">
        ${sleeve(p, true)}
        <div>
          <p class="when">${esc(fmtDate(p.startsAt))}${past ? ' · finished' : ''}</p>
          <h1>${esc(p.album)}</h1>
          <p class="artist">${esc(p.artist)} · on repeat all night</p>
          <dl>
            <dt>Cocktail</dt><dd>🍸 ${cocktailButton(p.cocktail)}</dd>
            <dt>Alcohol-free</dt><dd>🍹 ${esc(p.softDrink)}</dd>
            <dt>Host</dt><dd>${esc(host.name)}</dd>
            <dt>Where</dt>
            <dd>${esc(p.city)}<br>${insider ? `<strong>${esc(p.address)}</strong>` : '<small>The address is shared once you’ve been approved and paid.</small>'}</dd>
            <dt>Tickets</dt><dd>${money(PRICE)} a slot, ${p.capacity} guests per slot</dd>
            <dt>Same night</dt><dd><a href="#/night/${dayOf(p)}">${state.parties.filter((x) => dayOf(x) === dayOf(p)).length - 1 || 'No'} other ${state.parties.filter((x) => dayOf(x) === dayOf(p)).length === 2 ? 'house' : 'houses'} · plan your night</a></dd>
            <dt>Slots</dt><dd>${offered(p).map((x) => `${x.label}, ${x.at}: ${taken(p.id, x.id)} of ${p.capacity} taken`).join('<br>')}</dd>
          </dl>
          ${p.notes ? `<p class="notes">${esc(p.notes)}</p>` : ''}
          ${actions}
          ${lists}
        </div>
      </article>`;
  }

  // Pretend checkout. No card details are asked for and no money is taken.
  function payPage(id) {
    const p = partyById(id);
    const user = me();
    const r = p && user && rsvp(p.id, user.id);
    if (!r || r.status !== 'approved') return partyPage(id);
    return `
      <section class="panel checkout">
        <p class="when">Checkout</p>
        <h1>${esc(p.album)}</h1>
        <p class="lede">${esc(p.artist)} · ${esc(fmtDate(p.startsAt))} · hosted by ${esc(userById(p.hostId).name)}</p>
        <table class="order">
          ${SLOTS.filter((x) => r.slots.includes(x.id)).map((x) => `<tr><td>${x.label}, ${x.at}</td><td>${money(PRICE)}</td></tr>`).join('')}
          <tr class="sum"><td>Total</td><td>${money(cost(r))}</td></tr>
        </table>
        <p class="dev">Demo: this is a pretend checkout. In the real app you’d pay by card here. Nothing is charged.</p>
        <button class="btn" data-action="pay" data-party="${p.id}">Pay ${money(cost(r))}</button>
        <p class="alt"><a href="#/party/${p.id}">Back to the party</a></p>
      </section>`;
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
      <form class="bio-form" data-form="bio">
        <label><span>A line about you <span class="opt">(shown to other guests)</span></span>
          <input name="bio" value="${esc(user.bio)}" maxlength="140" placeholder="Northern soul on vinyl, and a good Manhattan."></label>
        <button class="btn small">Save</button>
      </form>
      <h2>Hosting</h2>
      ${hosting.length ? `<div class="grid">${hosting.map((p) => card(p, waitingBadge(p))).join('')}</div>` : '<p class="empty">You’re not hosting anything yet. <a href="#/host">Host a party</a></p>'}
      <h2>Attending</h2>
      ${attending.length ? `<div class="grid">${attending.map(({ p, status }) => card(p, `<p class="badge ${status}">${{ paid: 'You’re going', approved: 'Approved: payment due', pending: 'Waiting for host' }[status]}</p>`)).join('')}</div>` : '<p class="empty">You haven’t asked for a spot at any parties. <a href="#/">Browse what’s on</a></p>'}`;
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
    else if (parts[0] === 'pay') html = payPage(Number(parts[1]));
    else if (parts[0] === 'night') html = nightPage(parts[1]);
    else if (parts[0] === 'register') html = me() ? homePage() : registerPage();
    else if (parts[0] === 'check-email') html = checkEmailPage(Number(parts[1]));
    else if (parts[0] === 'login') html = me() ? homePage() : loginPage();
    else if (parts[0] === 'host') html = hostPage();
    else if (parts[0] === 'me') html = mePage();
    else if (parts[0] === '') html = homePage();
    else html = panel('Not found', 'There’s nothing at this address.', { href: '#/', label: 'Browse parties' });
    $('main').innerHTML = (flash ? `<p class="notice" role="status">${esc(flash)}</p>` : '') + html;
    flash = null;
    loadCovers();
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
      const bio = clean(data.get('bio'), 140);
      const email = clean(data.get('email'), 254).toLowerCase();
      const password = String(data.get('password') || '');
      let error = null;
      if (!name) error = 'Please tell us your name.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = 'That email address doesn’t look right.';
      else if (password.length < 8) error = 'Use a password of at least 8 characters.';
      else if (state.users.some((u) => u.email === email)) error = 'That email already has an account in this demo. Sign in instead.';
      if (error) return render(registerPage(error, { name, email, bio }));
      const user = { id: state.nextId++, name, bio, email, pass: await hashPassword(email, password), verified: false };
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
        softDrink: clean(data.get('softDrink'), 120),
        date: clean(data.get('date'), 10),
        city: clean(data.get('city'), 80),
        address: clean(data.get('address'), 200),
        capacity: Number.parseInt(data.get('capacity'), 10),
        slots: SLOTS.map((x) => x.id).filter((id) => data.getAll('slots').includes(id)),
        notes: clean(data.get('notes'), 1000),
      };
      let error = null;
      if (!v.album || !v.artist) error = 'Which album are you playing, and who is it by?';
      else if (!v.cocktail) error = 'Pick the cocktail you’ll be serving.';
      else if (!v.softDrink) error = 'Add an alcohol-free drink. Every party needs one.';
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) error = 'Choose a date.';
      else if (v.date < localIso(new Date()).slice(0, 10)) error = 'That date is in the past.';
      else if (!v.city) error = 'Add your part of Lancaster so guests know roughly where you are.';
      else if (!v.address) error = 'Add your address. Only guests you approve will see it.';
      else if (!(v.capacity >= 1 && v.capacity <= 200)) error = 'Guests per slot must be between 1 and 200.';
      else if (!v.slots.length) error = 'Pick at least one slot to open your door for.';
      if (error) return render(hostPage(error, v));
      const { date, ...rest } = v;
      const party = { id: state.nextId++, hostId: user.id, ...rest, startsAt: `${date}T${slotById(v.slots[0]).time}` };
      state.parties.push(party);
      save();
      go(`#/party/${party.id}`, 'Your party is published.');
    },
  };

  forms.bio = function (data) {
    const user = me();
    if (!user) return go('#/login');
    user.bio = clean(data.get('bio'), 140);
    save();
    go('#/me', 'Saved your bio.');
  };

  forms.night = function (data, form) {
    const date = form.dataset.date;
    const user = me();
    if (!user) return go('#/login');
    const picks = {}; // partyId -> slots
    for (const x of SLOTS) {
      const p = partyById(Number(data.get(x.id)));
      if (!p || dayOf(p) !== date || p.hostId === user.id || rsvp(p.id, user.id)) continue;
      if (!offered(p).some((y) => y.id === x.id) || !left(p, x.id) || busyAt(user.id, date, x.id)) continue;
      (picks[p.id] = picks[p.id] || []).push(x.id);
    }
    const ids = Object.keys(picks);
    if (!ids.length) return render(nightPage(date, 'Pick a house for at least one slot.'));
    for (const id of ids) state.rsvps.push({ partyId: Number(id), userId: user.id, slots: picks[id], status: 'pending' });
    save();
    go('#/me', `Asked ${ids.length} ${ids.length === 1 ? 'host' : 'hosts'} for spots. You pay each one once they say yes.`);
  };

  forms.ask = function (data, form) {
    const p = partyById(Number(form.dataset.party));
    const user = me();
    if (!p || !user || user.id === p.hostId || isPast(p) || rsvp(p.id, user.id)) return render();
    const slots = offered(p).map((x) => x.id).filter((id) => data.getAll('slot').includes(id) && left(p, id) > 0 && !busyAt(user.id, dayOf(p), id, p.id));
    if (!slots.length) return render(partyPage(p.id, 'Pick at least one slot.'));
    state.rsvps.push({ partyId: p.id, userId: user.id, slots, status: 'pending' });
    save();
    render();
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
      const fullSlots = r.slots.filter((id) => left(p, id) === 0);
      if (fullSlots.length) return go(location.hash, `${slotNames(fullSlots)} is full, so this request can’t be approved.`);
      r.status = 'approved';
      save();
      go(location.hash, `${userById(user).name} is approved. Their spots are held while they pay ${money(cost(r))}. In the real app they get an email with a payment link.`);
    },
    pay({ party }) {
      const p = partyById(party);
      const user = me();
      const r = p && user && rsvp(party, user.id);
      if (!r || r.status !== 'approved') return render();
      r.status = 'paid';
      save();
      go(`#/party/${party}`, `Paid ${money(cost(r))}. You’re on the guest list. (Demo: nothing was charged.)`);
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
    forms[form.dataset.form](new FormData(form), form);
  });

  document.addEventListener('click', (event) => {
    const recipe = event.target.closest('button[data-recipe]');
    if (recipe) return showRecipe(recipe.dataset.recipe);
    // Close the recipe from its button, or by clicking the dimmed area around it.
    if (event.target.closest('[data-close]') || event.target === $('recipe')) return $('recipe').close();
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    actions[button.dataset.action]({ party: Number(button.dataset.party), user: Number(button.dataset.user) });
  });

  document.addEventListener('change', (event) => {
    const planner = event.target.closest('form[data-form="night"]');
    if (planner) {
      const n = [...planner.querySelectorAll('input[type=radio]:checked')].filter((r) => r.value).length;
      planner.querySelector('[data-total]').textContent = money(n * PRICE);
      return;
    }
    const book = event.target.closest('form[data-form="ask"]');
    if (book) {
      const boxes = [...book.querySelectorAll('input[name="slot"]:not(:disabled)')];
      const whole = book.querySelector('[data-whole]');
      if (event.target === whole) boxes.forEach((box) => { box.checked = whole.checked; });
      else if (whole) whole.checked = boxes.every((box) => box.checked);
      const n = book.querySelectorAll('input[name="slot"]:checked').length;
      book.querySelector('[data-total]').textContent = money(n * PRICE);
      return;
    }
    if (event.target.id !== 'try-as') return;
    state.me = Number(event.target.value) || null;
    save();
    render();
  });

  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  render();
})();
