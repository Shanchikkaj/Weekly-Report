import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Operational AppError with designated status code
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
    });
  }

  // Prisma unique constraint violation (code P2002)
  if (err.code === 'P2002') {
    return res.status(400).json({
      error: 'A record with this unique value already exists.',
    });
  }

  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e: any) => e.message);
    return res.status(400).json({
      error: messages.join(', ') || 'Validation error',
    });
  }

  // Malformed JSON error
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Malformed JSON payload.',
    });
  }

  // Log unexpected system errors internally
  console.error('[Unhandled Server Error]:', err?.message || err);

  // Centralized safe response: never leak internal stack traces or raw database messages
  return res.status(500).json({
    error: 'Internal server error.',
  });
};
