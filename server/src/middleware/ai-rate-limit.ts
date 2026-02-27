import rateLimit from 'express-rate-limit';
import type { AuthRequest } from './auth.js';

export const chatRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  message: { error: 'Too many chat requests. Please wait a moment.' },
});

export const blockGenRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  message: { error: 'Too many generation requests. Please wait a moment.' },
});

export const autoFillRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  message: { error: 'Too many auto-fill requests. Please wait a moment.' },
});
