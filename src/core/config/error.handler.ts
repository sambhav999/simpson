import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger/logger';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

import { ZodError } from 'zod';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      status: err.statusCode,
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation Error',
      details: err.flatten().fieldErrors,
      status: 400,
    });
    return;
  }

  logger.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    error: 'Internal server error',
    status: 500,
  });
}
