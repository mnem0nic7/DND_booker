import rateLimit from 'express-rate-limit';
import type { AuthRequest } from './auth.js';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function limitForEnv(productionMax: number, nonProductionMax = 1000): number {
  return IS_PRODUCTION ? productionMax : nonProductionMax;
}

export const chatRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: limitForEnv(10),
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  message: { error: 'Too many chat requests. Please wait a moment.' },
});

export const blockGenRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: limitForEnv(15),
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  message: { error: 'Too many generation requests. Please wait a moment.' },
});

export const autoFillRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: limitForEnv(30),
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  message: { error: 'Too many auto-fill requests. Please wait a moment.' },
});

/** General rate limit for public/unauthenticated endpoints. */
export const publicRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: limitForEnv(60),
  message: { error: 'Too many requests. Please wait a moment.' },
});

/** Rate limit for export endpoints (expensive: Puppeteer + file I/O). */
export const exportRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: limitForEnv(10),
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  message: { error: 'Too many export requests. Please wait a moment.' },
});

/** Rate limit for CRUD operations (projects, documents, assets). */
export const crudRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: limitForEnv(60),
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  message: { error: 'Too many requests. Please wait a moment.' },
});

/** Rate limit for AI wizard endpoints (expensive: multiple AI calls). */
export const wizardRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: limitForEnv(5, 100),
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  message: { error: 'Too many wizard requests. Please wait a few minutes.' },
});

/** Rate limit for AI memory/planning endpoints (lightweight CRUD). */
export const memoryRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: limitForEnv(30),
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  message: { error: 'Too many memory requests. Please wait a moment.' },
});

/** Rate limit for AI image generation (expensive: external API call + file I/O). */
export const imageGenRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: limitForEnv(5, 100),
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  message: { error: 'Too many image generation requests. Please wait.' },
});

/** Strict rate limit for AI key validation (prevents enumeration). */
export const aiValidationRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: limitForEnv(5, 100),
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
  message: { error: 'Too many validation requests. Please wait a moment.' },
});
