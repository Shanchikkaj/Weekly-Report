import path from 'path';
import dotenv from 'dotenv';

// Force load .env.test before any module or application code executes
const envTestPath = path.resolve(__dirname, '../../../.env.test');
dotenv.config({
  path: envTestPath,
  override: true,
});

// Guarantee test environment isolation variables
process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT || '5001';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/weekly_report_test';
process.env.MONGO_URL = 'mongodb://localhost:27017/weekly_report_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-very-secure-key-32-chars-long';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-jwt-secret-very-secure-key-32';
