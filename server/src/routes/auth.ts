import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../middleware/async-handler.js';
import {
  registerUser,
  loginUser,
  getUserById,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  incrementTokenVersion,
} from '../services/auth.service.js';
import { redis } from '../config/redis.js';

const router = Router();

// Rate limiting for auth endpoints — prevent brute-force
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window (reduced from 20)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

// Per-account lockout tracking via Redis (persists across restarts)
const ACCOUNT_LOCKOUT_THRESHOLD = 10;
const ACCOUNT_LOCKOUT_TTL = 900; // 15 minutes in seconds

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
      const record = JSON.parse(raw) as { count: number };
      count = record.count + 1;
    } catch {
      // corrupted data, reset
    }
  }
  await redis.set(key, JSON.stringify({ count }), 'EX', ACCOUNT_LOCKOUT_TTL);
}

async function clearFailedLogins(email: string): Promise<void> {
  await redis.del(lockoutKey(email));
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
  displayName: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/register', authRateLimit, asyncHandler(async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  try {
    const user = await registerUser(parsed.data.email, parsed.data.password, parsed.data.displayName);
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id, 0);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({ user, accessToken });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'EMAIL_EXISTS') {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    res.status(500).json({ error: 'Registration failed' });
  }
}));

router.post('/login', authRateLimit, asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  // Per-account lockout check (Redis-backed)
  if (await checkAccountLockout(parsed.data.email)) {
    res.status(429).json({ error: 'Account temporarily locked due to too many failed attempts. Please try again later.' });
    return;
  }

  try {
    const user = await loginUser(parsed.data.email, parsed.data.password);
    await clearFailedLogins(parsed.data.email);
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id, user.tokenVersion);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const { tokenVersion: _tv, ...userResponse } = user;
    res.json({ user: userResponse, accessToken });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'INVALID_CREDENTIALS') {
      await recordFailedLogin(parsed.data.email);
      console.warn(`[SECURITY] Failed login attempt for ${parsed.data.email} from ${req.ip}`);
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    res.status(500).json({ error: 'Login failed' });
  }
}));

router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
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
    // Reject tokens issued before the last logout/invalidation
    if (payload.tokenVersion !== user.tokenVersion) {
      console.warn(`[SECURITY] Revoked token refresh attempt for user ${payload.userId}`);
      res.status(401).json({ error: 'Token revoked' });
      return;
    }
    const accessToken = generateAccessToken(payload.userId);
    const { tokenVersion: _tv, ...userResponse } = user;
    res.json({ accessToken, user: userResponse });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
}));

router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  // Best-effort: invalidate refresh tokens if we can identify the user
  const refreshTokenCookie = req.cookies?.refreshToken;
  if (refreshTokenCookie) {
    try {
      const payload = verifyRefreshToken(refreshTokenCookie);
      await incrementTokenVersion(payload.userId);
    } catch {
      // Token expired or invalid — no user to invalidate, that's fine
    }
  }
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.json({ message: 'Logged out' });
}));

export default router;
