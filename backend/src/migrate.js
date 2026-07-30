import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  // Constraints können bei wiederholtem Ausführen schon existieren – das ignorieren wir sauber
  const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    try {
      await pool.query(stmt);
    } catch (err) {
      if (err.code === '42710' /* duplicate constraint */) continue;
      throw err;
    }
  }
  console.log('Migration abgeschlossen.');
  await pool.end();
}

migrate().catch(err => {
  console.error('Migration fehlgeschlagen:', err);
  process.exit(1);
});
