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

With no `SMTP_URL` set, no email is sent: the confirmation link is printed in
the server console and shown on screen so you can try the whole flow locally.

## Configuration

Copy `.env.example` to `.env`. For a real deployment set:

| Variable | Purpose |
| --- | --- |
| `BASE_URL` | Public `https://` URL, used in email links and to mark cookies secure |
| `SMTP_URL` | SMTP connection string for your mail provider (required when `NODE_ENV=production`) |
| `MAIL_FROM` | From address for emails |
| `DB_PATH` | SQLite file location; put it on a persistent disk |
| `TRUST_PROXY` | Set to `1` behind a reverse proxy |

## Layout

- `server.js` – entry point and configuration
- `src/app.js` – routes
- `src/auth.js` – password hashing, tokens, cookies
- `src/db.js` – SQLite schema
- `src/mail.js` – email sending
- `views/`, `public/` – pages and styles
