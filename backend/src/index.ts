import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { connectPostgres } from './config/postgres';
import { connectMongo } from './config/mongo';
import { connectRedis } from './config/redis';
import authRoutes from './routes/auth.routes';
import reportRoutes from './routes/report.routes';
import projectRoutes from './routes/project.routes';
import dashboardRoutes from './routes/dashboard.routes';
import userRoutes from './routes/user.routes';
import assistantRoutes from './routes/assistant.routes';
import { requireAuth } from './middleware/auth.middleware';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = [
  process.env.CLIENT_URL,
  ...(isProduction ? [] : ['http://localhost:3000', 'http://localhost:5173']),
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like server-to-server Vercel proxy rewrites, curl, health checks)
      if (!origin) return callback(null, true);
      const normalizedOrigin = origin.replace(/\/$/, '');
      const isAllowed = allowedOrigins.some((allowed) => allowed.replace(/\/$/, '') === normalizedOrigin);
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Public Health Check Endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Public Authentication Routes
app.use('/api/auth', authRoutes);

// Apply requireAuth to all remaining routes across the entire app
app.use(requireAuth);

// Protected Routes
app.use('/api/reports', reportRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/assistant', assistantRoutes);

// Centralized Error Handler
app.use(errorHandler);

export const startServer = async () => {
  console.log('[Server] Initializing database connections...');

  // Initialize each database independently so failure in one does not block or crash the process
  await connectPostgres();
  await connectMongo();
  await connectRedis();

  const server = app.listen(port, () => {
    console.log(`[Server] Backend listening on port ${port}`);
  });

  return { app, server };
};

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
