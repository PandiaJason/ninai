import pkg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const { Pool } = pkg;

/**
 * TLS to the database.
 *
 * When DB_SSL_CA points at the RDS certificate bundle (the "global bundle"
 * from the RDS console), the server certificate is verified properly. Without
 * it we keep rejectUnauthorized off so a first connection still works, but
 * that leaves the link open to interception — set it in production.
 */
function buildSsl() {
    const caPath = process.env.DB_SSL_CA;
    if (caPath) {
        try {
            const ca = fs.readFileSync(caPath, 'utf8');
            return { rejectUnauthorized: true, ca };
        } catch (err) {
            console.error(`Could not read DB_SSL_CA at ${caPath}: ${err.message}`);
        }
    }
    return { rejectUnauthorized: false };
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'ninai',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: buildSsl(),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  // Avoid logging any credentials on error
  console.error('Unexpected error on idle Postgres client:', err.message);
});

export const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // Intentionally omit param values in debug logs
  if (process.env.DEBUG_SQL === 'true') {
    console.log('Executed query', { duration, rows: res.rowCount });
  }
  return res;
};

export default pool;
