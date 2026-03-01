import rateLimit from 'express-rate-limit';
import type { AuthRequest } from './auth.js';

export const chatRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  message: { error: 'Too many chat requests. Please wait a moment.' },
});

export const blockGenRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  message: { error: 'Too many generation requests. Please wait a moment.' },
});

export const autoFillRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  message: { error: 'Too many auto-fill requests. Please wait a moment.' },
});

/** General rate limit for public/unauthenticated endpoints. */
export const publicRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please wait a moment.' },
});

/** Rate limit for export endpoints (expensive: Puppeteer + file I/O). */
export const exportRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  message: { error: 'Too many export requests. Please wait a moment.' },
});

/** Rate limit for CRUD operations (projects, documents, assets). */
export const crudRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  message: { error: 'Too many requests. Please wait a moment.' },
});

/** Rate limit for AI wizard endpoints (expensive: multiple AI calls). */
export const wizardRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  message: { error: 'Too many wizard requests. Please wait a few minutes.' },
});

/** Strict rate limit for AI key validation (prevents enumeration). */
export const aiValidationRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  message: { error: 'Too many validation requests. Please wait a moment.' },
});
