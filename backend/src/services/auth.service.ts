import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { AppError } from '../middleware/errorHandler';
import { Role } from '@prisma/client';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export const getRefreshTokenKey = (userId: string): string => `refresh_token:${userId}`;

export const invalidateUserSessions = async (userId: string): Promise<void> => {
  await redis.del(getRefreshTokenKey(userId));
};

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not defined');
  }
  return secret;
};

const getJwtRefreshSecret = (): string => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET environment variable is not defined');
  }
  return secret;
};

export interface RegisterDTO {
  email?: string;
  password?: string;
  role?: string;
}

export interface LoginDTO {
  email?: string;
  password?: string;
}

export interface UserResponse {
  id: string;
  email: string;
  role: Role;
  active: boolean;
  created_at: Date;
}

export class AuthService {
  /**
   * Registers a new user with input validation, password hashing, and Postgres persistence
   */
  async register(data: RegisterDTO): Promise<UserResponse> {
    const { email, password, role } = data;

    // Validate email
    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      throw new AppError(400, 'A valid email address is required.');
    }

    // Validate password
    if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw new AppError(
        400,
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
      );
    }

    // Validate role
    let assignedRole: Role = Role.team_member;
    if (role) {
      if (role === 'manager' || role === 'admin') {
        throw new AppError(403, 'Public registration cannot create Manager or Admin accounts.');
      } else if (role === 'team_member') {
        assignedRole = Role.team_member;
      } else {
        throw new AppError(400, 'Invalid role. Allowed role is: team_member.');
      }
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new AppError(400, 'A user with this email already exists.');
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user in PostgreSQL
    const newUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password_hash: passwordHash,
        role: assignedRole,
        active: true,
      },
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        created_at: true,
      },
    });

    return newUser;
  }

  /**
   * Validates credentials, issues 15m access token + 7d refresh token, stores session in Redis
   */
  async login(data: LoginDTO): Promise<{
    user: { id: string; email: string; role: Role };
    accessToken: string;
    refreshToken: string;
  }> {
    const { email, password } = data;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      throw new AppError(400, 'Email and password are required.');
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Look up user in PostgreSQL with explicit select
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        password_hash: true,
      },
    });

    if (!user) {
      // Dummy hash compare to normalize response timing against timing attacks
      await bcrypt.compare(
        password,
        '$2b$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUV0123456789'
      );
      throw new AppError(401, 'Invalid email or password.');
    }

    if (!user.active) {
      throw new AppError(401, 'Account has been deactivated. Please contact an administrator.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new AppError(401, 'Invalid email or password.');
    }

    // Generate JWT Access Token (15 minutes)
    const accessToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      getJwtSecret(),
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    // Generate JWT Refresh Token (7 days)
    const refreshToken = jwt.sign(
      {
        userId: user.id,
      },
      getJwtRefreshSecret(),
      { expiresIn: REFRESH_TOKEN_EXPIRY }
    );

    // Store refresh token in Redis keyed by user id
    const redisKey = getRefreshTokenKey(user.id);
    await redis.set(redisKey, refreshToken, 'EX', REFRESH_TOKEN_TTL_SECONDS);

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      accessToken,
      refreshToken,
    };
  }

  /**
   * Validates refresh token against Redis and issues a fresh 15m access token
   */
  async refresh(refreshToken?: string): Promise<{ accessToken: string }> {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new AppError(401, 'Refresh token required.');
    }

    let payload: { userId: string };
    try {
      payload = jwt.verify(refreshToken, getJwtRefreshSecret()) as { userId: string };
    } catch {
      throw new AppError(401, 'Invalid or expired refresh token.');
    }

    // Verify token matches Redis session
    const redisKey = getRefreshTokenKey(payload.userId);
    const storedToken = await redis.get(redisKey);

    if (!storedToken || storedToken !== refreshToken) {
      throw new AppError(401, 'Invalid or expired refresh session.');
    }

    // Confirm user is active in PostgreSQL
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
      },
    });

    if (!user || !user.active) {
      await invalidateUserSessions(payload.userId);
      throw new AppError(401, 'User account is inactive or not found.');
    }

    // Issue new Access Token
    const accessToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      getJwtSecret(),
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    return { accessToken };
  }

  /**
   * Invalidates the user session in Redis
   */
  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken || typeof refreshToken !== 'string') {
      return;
    }

    try {
      const payload = jwt.verify(refreshToken, getJwtRefreshSecret()) as { userId: string };
      if (payload?.userId) {
        await invalidateUserSessions(payload.userId);
      }
    } catch {
      // Even if token verification fails on logout, we fail gracefully
    }
  }
}

export const authService = new AuthService();
