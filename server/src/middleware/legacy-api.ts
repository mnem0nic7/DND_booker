import type { NextFunction, Request, Response } from 'express';

const LEGACY_API_SUNSET = 'Thu, 31 Dec 2026 23:59:59 GMT';
const LEGACY_API_SUCCESSOR_LINK = '</api/v1/openapi.json>; rel="successor-version"';

export function legacyApiCompatibility(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', LEGACY_API_SUNSET);
  res.setHeader('Link', LEGACY_API_SUCCESSOR_LINK);
  res.setHeader('X-API-Compatibility', 'legacy');
  next();
}
