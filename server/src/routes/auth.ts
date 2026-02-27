import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import {
  registerUser,
  loginUser,
  getUserById,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  incrementTokenVersion,
} from '../services/auth.service.js';

const router = Router();

// Rate limiting for auth endpoints — prevent brute-force
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

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

router.post('/register', authRateLimit, async (req: Request, res: Response) => {
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
      sameSite: 'lax',
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
});

router.post('/login', authRateLimit, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  try {
    const user = await loginUser(parsed.data.email, parsed.data.password);
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id, user.tokenVersion);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const { tokenVersion: _tv, ...userResponse } = user;
    res.json({ user: userResponse, accessToken });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'INVALID_CREDENTIALS') {
      console.warn(`[SECURITY] Failed login attempt for ${parsed.data.email} from ${req.ip}`);
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
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
    if (payload.tokenVersion !== undefined && payload.tokenVersion !== user.tokenVersion) {
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
});

router.post('/logout', async (req: Request, res: Response) => {
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
    sameSite: 'lax',
  });
  res.json({ message: 'Logged out' });
});

export default router;
