import pg from 'pg';

const conn = process.env.DATABASE_URL;

export const pool = new pg.Pool({
  connectionString: conn,
  max: 3,
  idleTimeoutMillis: 10000,
  ssl: conn && /localhost|127\.0\.0\.1/.test(conn) ? false : { rejectUnauthorized: false }
});

/* Constant-time-ish compare so the key cannot be guessed byte by byte. */
export function authed(req) {
  const want = process.env.TEAM_KEY || '';
  const got = (req.headers && req.headers['x-team-key']) || '';
  if (!want || want.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

/* Vercel parses JSON bodies, but be tolerant if it has not. */
export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return null; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return null;
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return null; }
}
