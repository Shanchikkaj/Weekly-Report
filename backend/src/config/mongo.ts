import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGO_URL || 'mongodb://localhost:27017/weekly_report';

export const connectMongo = async (): Promise<boolean> => {
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('[MongoDB] Connected successfully');
    return true;
  } catch (error: any) {
    console.error(`[MongoDB] Connection error: ${error?.message || error}`);
    return false;
  }
};

mongoose.connection.on('error', (err) => {
  console.error('[MongoDB] Runtime connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('[MongoDB] Disconnected from database');
});

export { mongoose };
