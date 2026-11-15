const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

const SESSION_COOKIE = 'hm_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

const newToken = () => crypto.randomBytes(32).toString('hex');
// Tokens are stored hashed so a leaked database can't be used to log in or verify.
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

module.exports = {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  VERIFY_TTL_MS,
  hashPassword,
  verifyPassword,
  newToken,
  hashToken,
  readCookie,
};
