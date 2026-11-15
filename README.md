# House Music

Album listening parties in people's homes in Lancaster, Lancashire. A host picks one album, plays it on
repeat for the evening and serves a cocktail of their choice. Other members
browse the calendar and sign up for a spot.

## What it does

- Sign up with name, email and password. Accounts must confirm their email
  (single-use link, valid 24 hours) before they can sign in, host or attend.
- Host a party: album, artist, cocktail, date and time, part of Lancaster, address,
  guest limit and notes.
- Browse upcoming parties and ask for a spot. The host is emailed and approves
  or declines each request; the guest is emailed the outcome.
- The street address and guest list are only visible to the host and to guests
  the host has approved. Everyone else sees just the part of town.
- Approved guests count towards the host's guest limit. Guests can give their
  spot back, and hosts can remove a guest.
- Hosts can cancel a party; everyone who asked to come is emailed.

## Run it

Requires Node 22.13 or newer.

```sh
npm install
npm start          # http://localhost:3000
npm test
```

With no email provider set, no email is sent: the confirmation link is printed in
the server console and shown on screen so you can try the whole flow locally.

## Proof of concept on GitHub Pages

`docs/` holds a front-end only version: the same screens and flows, running
entirely in the visitor's browser with no server.

To publish it: in the repository on GitHub go to Settings > Pages, set Source
to "Deploy from a branch", pick the branch and the `/docs` folder, and save.
It appears at `https://<your-username>.github.io/house-music/` a minute or so later.

It is a demo, not the product:

- Data is saved in each visitor's own browser. Visitors do not see each
  other's parties or requests.
- No emails are sent; confirming an email is a button.
- Every party lists an alcohol-free drink alongside the cocktail, and guests
  can see who else is attending, with a line about each of them.
- It tries out paid tickets, at £15 a slot. A night has three slots (happy
  hour 5pm, early evening 8pm, late 10pm) and each house opens for one or
  more of them, so guests can stay put or hop between houses: "Plan your
  night" picks one house per slot. Each host approves, then the guest pays at
  a pretend checkout. No money is taken, and the real app doesn't have
  tickets yet.
- A "Try as" menu switches between sample people so one person can see both
  the guest's and the host's side.
- Album covers are looked up by artist and album name from Apple's public
  iTunes Search API and loaded from Apple's servers. Albums it can't match
  keep the generated coloured sleeve.
- Each party page shows a short blurb about the album from its English
  Wikipedia article, when there is one that clearly matches.
- Clicking a cocktail name shows how to make it, looked up by name from
  TheCocktailDB's public API. Cocktails it doesn't know get a short message.
- Nothing is private or secure. Don't enter real passwords or addresses.

## Put it online for free

The app is set up for Render (web hosting), Turso (database) and Brevo
(email), all on their free plans. You need an account with each.

1. **Turso** (turso.tech): create a database. Copy its URL (starts with
   `libsql://`) and create a database token.
2. **Brevo** (brevo.com): add and verify the sender address your emails will
   come from, then create an API key.
3. **Render** (render.com): New > Blueprint, connect this GitHub repository.
   Render reads `render.yaml` and asks for four values:
   `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `BREVO_API_KEY` and `MAIL_FROM`
   (for example `House Music <you@yourdomain.co.uk>`).
4. Deploy. The site is live at the `onrender.com` address Render gives you.
   The tables are created on first start.

On the free plan the site sleeps when nobody has visited for a while, so the
first visit after a quiet spell takes up to a minute.

## Configuration

Local development needs no configuration. See `.env.example` for the full list.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | Hosted Turso/libSQL database. Without them a local file at `DB_PATH` is used |
| `BREVO_API_KEY` | Sends email through Brevo. `SMTP_URL` is the alternative for any SMTP provider |
| `MAIL_FROM` | From address for emails |
| `BASE_URL` | Public `https://` URL used in email links. Set automatically on Render |
| `TRUST_PROXY` | Set to `1` behind a reverse proxy |

One of `BREVO_API_KEY` or `SMTP_URL` is required when `NODE_ENV=production`.

## Layout

- `server.js` – entry point and configuration
- `src/app.js` – routes
- `src/auth.js` – password hashing, tokens, cookies
- `src/db.js` – database schema and connection
- `src/mail.js` – email sending
- `views/`, `public/` – pages and styles
- `render.yaml` – Render deployment blueprint
- `docs/` – front-end only proof of concept for GitHub Pages
