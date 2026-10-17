import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { serverDb } from '../db';
import { AppUser, UserPermissions } from '../../src/types';

export const JWT_SECRET = process.env.JWT_SECRET || 'apex-road-infra-ops-mgmt-jwt-secret-key-2026';
if (!process.env.JWT_SECRET) {
  console.warn('[Auth] JWT_SECRET is not set — using the built-in development fallback. Set JWT_SECRET in the environment before this server accepts production traffic.');
}

export interface AuthenticatedRequest extends Request {
  user?: AppUser;
}

export function generateToken(user: AppUser): string {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication token required. Please sign in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string; role: string };
    const user = serverDb.getUserById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, error: 'User account no longer exists.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, error: 'User account is inactive or pending setup.' });
    }

    req.user = user;
    next();
  } catch (err: any) {
    return res.status(401).json({ success: false, error: 'Invalid or expired session token. Please sign in again.' });
  }
}

// Silent credential resolution for tiered endpoints (e.g. GET /api/sync):
// validates a bearer token without mounting the full middleware stack and
// without ever writing a response — returns the user or null.
export function resolveTokenUser(token: string | null | undefined): AppUser | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string; role: string };
    const user = serverDb.getUserById(decoded.id);
    if (!user || user.status !== 'active') return null;
    return user;
  } catch {
    return null;
  }
}

export function requirePermission(permissionKey: keyof UserPermissions) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    if (req.user.role === 'super_admin' || req.user.permissions?.[permissionKey]) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: `Access Denied: You do not have permission to perform this action (${String(permissionKey)}).`,
    });
  };
}

export function requireEitherPermission(...perms: (keyof UserPermissions)[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    if (req.user.role === 'super_admin' || perms.some((p) => req.user?.permissions?.[p])) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: `Access Denied: You do not have permission to perform this action (${perms.map(String).join(' or ')}).`,
    });
  };
}
