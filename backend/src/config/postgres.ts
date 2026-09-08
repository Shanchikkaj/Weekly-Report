import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/weekly_report';

export const pool = new Pool({
  connectionString,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client:', err.message);
});

export const connectPostgres = async (): Promise<boolean> => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('[PostgreSQL] Connected successfully');
    return true;
  } catch (error: any) {
    console.error(`[PostgreSQL] Connection error: ${error?.message || error}`);
    return false;
  }
};
