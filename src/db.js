const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      verified_at TEXT,
      verify_token_hash TEXT,
      verify_expires INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL
    );

    -- A "party" is one host playing one album on repeat on one evening.
    CREATE TABLE IF NOT EXISTS parties (
      id INTEGER PRIMARY KEY,
      host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      album TEXT NOT NULL,
      artist TEXT NOT NULL,
      cocktail TEXT NOT NULL,
      starts_at TEXT NOT NULL,          -- local wall-clock time, 'YYYY-MM-DDTHH:MM'
      city TEXT NOT NULL,               -- public: neighbourhood / city
      address TEXT NOT NULL,            -- private: only shown to the host and confirmed guests
      capacity INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS parties_starts_at ON parties(starts_at);

    CREATE TABLE IF NOT EXISTS rsvps (
      party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (party_id, user_id)
    );
  `);
  return db;
}

module.exports = { openDb };
