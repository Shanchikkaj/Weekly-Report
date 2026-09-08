import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { AppError } from './errorHandler';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Middleware: Validates Bearer access token and attaches req.user
 */
export const requireAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError(401, 'Authentication required. Missing Bearer token.'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not configured.');
    }

    const decoded = jwt.verify(token, secret) as {
      userId: string;
      email: string;
      role: Role;
    };

    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (err) {
    return next(new AppError(401, 'Invalid or expired access token.'));
  }
};

/**
 * Middleware: Checks whether req.user.role matches allowed role list
 */
export const requireRole = (...allowedRoles: (Role | 'team_member' | 'manager')[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, 'Authentication required.'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(403, 'Forbidden: Insufficient permissions for this resource.')
      );
    }

    next();
  };
};
