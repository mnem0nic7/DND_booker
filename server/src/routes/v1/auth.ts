import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  AuthLoginRequestSchema,
  AuthLogoutResponseSchema,
  AuthRegisterRequestSchema,
  AuthSessionResponseSchema,
} from '@dnd-booker/shared';
import { asyncHandler } from '../../middleware/async-handler.js';
import { requireAuthOrRefreshCookie, type AuthRequest } from '../../middleware/auth.js';
import {
  registerUser,
  loginUser,
  getUserById,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  incrementTokenVersion,
} from '../../services/auth.service.js';
import { redis } from '../../config/redis.js';

const v1AuthRoutes = Router();

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const AUTH_RATE_LIMIT_WINDOW_MS = envNumber('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
const AUTH_RATE_LIMIT_MAX = envNumber('AUTH_RATE_LIMIT_MAX', 10);
const ACCOUNT_LOCKOUT_THRESHOLD = envNumber('AUTH_ACCOUNT_LOCKOUT_THRESHOLD', 10);
const ACCOUNT_LOCKOUT_TTL = envNumber('AUTH_ACCOUNT_LOCKOUT_TTL_SECONDS', 900);

const authRateLimit = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  max: AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

function lockoutKey(email: string): string {
  return `lockout:${email}`;
}

async function checkAccountLockout(email: string): Promise<boolean> {
  const raw = await redis.get(lockoutKey(email));
  if (!raw) return false;
  try {
    const record = JSON.parse(raw) as { count: number };
    return record.count >= ACCOUNT_LOCKOUT_THRESHOLD;
  } catch {
    return false;
  }
}

async function recordFailedLogin(email: string): Promise<void> {
  const key = lockoutKey(email);
  const raw = await redis.get(key);
  let count = 1;
  if (raw) {
    try {
      count = (JSON.parse(raw) as { count: number }).count + 1;
    } catch {
      count = 1;
    }
  }
  await redis.set(key, JSON.stringify({ count }), 'EX', ACCOUNT_LOCKOUT_TTL);
}

async function clearFailedLogins(email: string): Promise<void> {
  await redis.del(lockoutKey(email));
}

function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

v1AuthRoutes.get('/session', requireAuthOrRefreshCookie, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest;
  const user = await getUserById(authReq.userId!);
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  const { tokenVersion: _tokenVersion, ...userResponse } = user;
  res.json(AuthSessionResponseSchema.parse({
    user: {
      ...userResponse,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
    accessToken: generateAccessToken(user.id),
  }));
}));

v1AuthRoutes.post('/register', authRateLimit, asyncHandler(async (req: Request, res: Response) => {
  const parsed = AuthRegisterRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  try {
    const user = await registerUser(parsed.data.email, parsed.data.password, parsed.data.displayName);
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id, 0);
    setRefreshCookie(res, refreshToken);
    res.status(201).json(AuthSessionResponseSchema.parse({
      user: {
        ...user,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      accessToken,
    }));
  } catch (error) {
    if (error instanceof Error && error.message === 'EMAIL_EXISTS') {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    if (error instanceof Error && error.message === 'REGISTRATION_NOT_ALLOWED') {
      res.status(403).json({ error: 'Registration is not allowed for this email' });
      return;
    }
    res.status(500).json({ error: 'Registration failed' });
  }
}));

v1AuthRoutes.post('/login', authRateLimit, asyncHandler(async (req: Request, res: Response) => {
  const parsed = AuthLoginRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  if (await checkAccountLockout(parsed.data.email)) {
    res.status(429).json({ error: 'Account temporarily locked due to too many failed attempts. Please try again later.' });
    return;
  }

  try {
    const user = await loginUser(parsed.data.email, parsed.data.password);
    await clearFailedLogins(parsed.data.email);
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id, user.tokenVersion);
    setRefreshCookie(res, refreshToken);
    const { tokenVersion: _tokenVersion, ...userResponse } = user;
    res.json(AuthSessionResponseSchema.parse({
      user: {
        ...userResponse,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      accessToken,
    }));
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_CREDENTIALS') {
      await recordFailedLogin(parsed.data.email);
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    res.status(500).json({ error: 'Login failed' });
  }
}));

v1AuthRoutes.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    res.status(401).json({ error: 'No refresh token' });
    return;
  }

  try {
    const payload = verifyRefreshToken(token);
    const user = await getUserById(payload.userId);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    if (payload.tokenVersion !== user.tokenVersion) {
      res.status(401).json({ error: 'Token revoked' });
      return;
    }

    const { tokenVersion: _tokenVersion, ...userResponse } = user;
    const accessToken = generateAccessToken(payload.userId);
    res.json(AuthSessionResponseSchema.parse({
      user: {
        ...userResponse,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      accessToken,
    }));
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
}));

v1AuthRoutes.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  const refreshTokenCookie = req.cookies?.refreshToken;
  if (refreshTokenCookie) {
    try {
      const payload = verifyRefreshToken(refreshTokenCookie);
      await incrementTokenVersion(payload.userId);
    } catch {
      // Ignore invalid cookies during logout.
    }
  }

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.json(AuthLogoutResponseSchema.parse({ message: 'Logged out' }));
}));

export default v1AuthRoutes;
