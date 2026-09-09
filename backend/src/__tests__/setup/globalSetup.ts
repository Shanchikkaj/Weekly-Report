import path from 'path';
import dotenv from 'dotenv';
import { Client } from 'pg';
import mongoose from 'mongoose';
import { execSync } from 'child_process';

export default async function globalSetup() {
  const envTestPath = path.resolve(__dirname, '../../../.env.test');
  dotenv.config({ path: envTestPath, override: true });

  const pgHost = process.env.PG_HOST || (process.env.DATABASE_URL?.includes('@postgres') ? 'postgres' : 'localhost');
  const mongoHost = process.env.MONGO_HOST || (process.env.MONGO_URL?.includes('mongodb:') || process.env.MONGO_URL?.includes('@mongodb') ? 'mongodb' : 'localhost');

  const adminPostgresUrl = `postgresql://postgres:postgres@${pgHost}:5432/postgres`;
  const testDbName = 'weekly_report_test';
  const testPostgresUrl = `postgresql://postgres:postgres@${pgHost}:5432/${testDbName}`;
  const testMongoUrl = `mongodb://${mongoHost}:27017/weekly_report_test`;

  console.log('\n[Global Test Setup] Ensuring isolated test database exists...');

  // 1. Ensure PostgreSQL weekly_report_test exists
  const client = new Client({ connectionString: adminPostgresUrl });
  try {
    await client.connect();
    const checkRes = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDbName]);
    if (checkRes.rowCount === 0) {
      console.log(`[Global Test Setup] Creating database "${testDbName}"...`);
      await client.query(`CREATE DATABASE "${testDbName}"`);
    }
  } catch (err: any) {
    console.error('[Global Test Setup] Error verifying test database:', err.message);
  } finally {
    await client.end().catch(() => {});
  }

  // 2. Push schema to weekly_report_test so tables are up-to-date
  try {
    const backendRoot = path.resolve(__dirname, '../../..');
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      cwd: backendRoot,
      env: {
        ...process.env,
        DATABASE_URL: testPostgresUrl,
        DIRECT_URL: testPostgresUrl,
      },
      stdio: 'ignore',
    });
    console.log('[Global Test Setup] Synchronized Prisma schema with "weekly_report_test".');
  } catch (err: any) {
    console.warn('[Global Test Setup] Warning during prisma db push:', err.message);
  }

  // 3. Truncate test Postgres tables for clean test run
  const testClient = new Client({ connectionString: testPostgresUrl });
  try {
    await testClient.connect();
    await testClient.query(
      'TRUNCATE TABLE "review_comments", "reports", "project_members", "projects", "users" CASCADE;'
    );
    console.log('[Global Test Setup] Truncated tables in "weekly_report_test".');
  } catch (err: any) {
    // Ignore truncate errors if tables are empty
  } finally {
    await testClient.end().catch(() => {});
  }

  // 4. Drop test MongoDB database so it starts completely fresh
  try {
    await mongoose.connect(testMongoUrl);
    if (mongoose.connection.db) {
      await mongoose.connection.db.dropDatabase();
      console.log('[Global Test Setup] Dropped test MongoDB database "weekly_report_test".');
    }
    await mongoose.disconnect();
  } catch (err: any) {
    console.warn('[Global Test Setup] Warning during test MongoDB reset:', err.message);
  }

  console.log('[Global Test Setup] Isolation complete. Running test suite.\n');
}
