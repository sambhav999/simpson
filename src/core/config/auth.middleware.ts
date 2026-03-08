import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { AppError } from './error.handler';

export interface AuthPayload {
    wallet: string;
    iat?: number;
    exp?: number;
}

// Extend Express Request  
declare global {
    namespace Express {
        interface Request {
            user?: AuthPayload;
        }
    }
}

/**
 * Required auth middleware — rejects if no valid JWT
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
    try {
        const token = extractToken(req);
        if (!token) {
            throw new AppError('Authentication required', 401);
        }
        const payload = jwt.verify(token, config.JWT_SECRET) as AuthPayload;
        req.user = payload;
        next();
    } catch (err) {
        if (err instanceof AppError) return next(err);
        if (err instanceof jwt.JsonWebTokenError) {
            return next(new AppError('Invalid or expired token', 401));
        }
        next(err);
    }
}

/**
 * Optional auth middleware — attaches user if valid JWT present, but doesn't reject
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
    try {
        const token = extractToken(req);
        if (token) {
            const payload = jwt.verify(token, config.JWT_SECRET) as AuthPayload;
            req.user = payload;
        }
    } catch {
        // Silently ignore invalid tokens for optional auth
    }
    next();
}

/**
 * Generate a JWT token for a wallet address
 */
export function generateToken(wallet: string): string {
    return jwt.sign({ wallet }, config.JWT_SECRET, {
        expiresIn: config.JWT_EXPIRY as any,
    });
}

function extractToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.slice(7);
    }
    return null;
}
