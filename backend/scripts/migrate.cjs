const fs = require('node:fs');
const path = require('node:path');
const {Pool} = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Create backend/.env from backend/.env.example first.');
  }

  const pool = new Pool({connectionString: process.env.DATABASE_URL});
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationDirectory = path.join(__dirname, '..', 'migrations');
    const migrations = fs.readdirSync(migrationDirectory).filter(name => name.endsWith('.sql')).sort();

    for (const name of migrations) {
      const alreadyApplied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
      if (alreadyApplied.rowCount) {
        console.log(`skip ${name}`);
        continue;
      }

      await client.query('BEGIN');
      try {
        const sql = fs.readFileSync(path.join(migrationDirectory, name), 'utf8');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        console.log(`applied ${name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
