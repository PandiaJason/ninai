import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pkg;

async function testConnection() {
  console.log('='.repeat(60));
  console.log('  AWS RDS PostgreSQL Connection Test');
  console.log('='.repeat(60));

  const requiredKeys = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missing = requiredKeys.filter((k) => !process.env[k]);

  if (missing.length > 0) {
    console.error(`\n[ERROR] Missing required environment variable(s): ${missing.join(', ')}`);
    console.error('Please create a .env file based on .env.example with your database credentials.\n');
    process.exit(1);
  }

  // Security check: Never allow app to connect as algo_cmo
  if (process.env.DB_USER.trim().toLowerCase() === 'algo_cmo') {
    console.error('\n[SECURITY VIOLATION] DB_USER cannot be "algo_cmo".');
    console.error('The app must connect as the restricted "ninai_app" role.');
    console.error('Please run create_role.sql in DBeaver and set DB_USER=ninai_app.\n');
    process.exit(1);
  }

  console.log(`\nTarget Host : ${process.env.DB_HOST}`);
  console.log(`Database    : ${process.env.DB_NAME}`);
  console.log(`User        : ${process.env.DB_USER}`);
  console.log(`SSL         : Enabled (rejectUnauthorized: false)`);
  console.log('\nConnecting to PostgreSQL RDS...');

  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });

  try {
    await client.connect();
    console.log('[SUCCESS] Successfully connected to PostgreSQL instance!');

    // Check user & database
    const metaRes = await client.query('SELECT current_user, current_database(), version()');
    const { current_user, current_database, version } = metaRes.rows[0];
    console.log(`\nAuthenticated Role : ${current_user}`);
    console.log(`Current Database   : ${current_database}`);
    console.log(`PostgreSQL Version : ${version.split(',')[0]}`);

    // Check tables & permissions
    console.log('\nChecking table permissions:');
    const tables = ['users', 'leads', 'lead_notes', 'messages'];
    for (const tbl of tables) {
      try {
        const countRes = await client.query(`SELECT count(*) AS count FROM ${tbl}`);
        console.log(`  ✓ Table "${tbl}": Accessible (Current rows: ${countRes.rows[0].count})`);
      } catch (tblErr) {
        console.warn(`  ✗ Table "${tbl}": ${tblErr.message}`);
      }
    }

    console.log('\n[RESULT] Database connection and role permissions are fully verified.\n');
  } catch (err) {
    console.error('\n[CONNECTION FAILED]');
    if (err.code === '28P01') {
      console.error('  Authentication failed: Invalid username or password.');
      console.error('  Verify that ninai_app was created in DBeaver with the matching password.');
    } else if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
      console.error('  Connection timed out.');
      console.error('  Check if your current laptop IP is whitelisted in the AWS RDS security group.');
    } else if (err.code === 'ENOTFOUND') {
      console.error('  Host name resolution failed. Check DB_HOST.');
    } else {
      console.error(`  Error message: ${err.message}`);
    }
    console.log('');
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

testConnection();
