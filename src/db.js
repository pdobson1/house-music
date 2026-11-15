const { createClient } = require('@libsql/client');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = `
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
      status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | declined
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (party_id, user_id)
    );
`;

// Opens a local SQLite file (`file:./data/x.db`, or `:memory:`) or a hosted
// libSQL/Turso database (`libsql://...` plus an auth token). Same SQL either way.
async function openDb({ url, authToken }) {
  const local = url === ':memory:' || url.startsWith('file:');
  if (url.startsWith('file:')) fs.mkdirSync(path.dirname(path.resolve(url.slice(5))), { recursive: true });
  const client = createClient({ url, authToken });
  if (local) await client.execute('PRAGMA foreign_keys = ON');
  await client.executeMultiple(SCHEMA);

  const exec = (sql, args) => client.execute({ sql, args });
  const db = {
    get: async (sql, ...args) => (await exec(sql, args)).rows[0],
    all: async (sql, ...args) => (await exec(sql, args)).rows,
    run: async (sql, ...args) => {
      const res = await exec(sql, args);
      return { changes: res.rowsAffected, lastInsertRowid: Number(res.lastInsertRowid ?? 0) };
    },
    close: () => client.close(),
  };

  // Databases created before host approval existed: existing guests keep their spots.
  const columns = await db.all('PRAGMA table_info(rsvps)');
  if (!columns.some((c) => c.name === 'status')) {
    await db.run("ALTER TABLE rsvps ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'");
  }
  return db;
}

module.exports = { openDb };
