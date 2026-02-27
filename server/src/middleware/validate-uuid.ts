import type { Request, Response, NextFunction } from 'express';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Express middleware factory that validates one or more route params are UUIDs.
 * Returns 400 immediately if any param is not a valid UUID.
 *
 * Usage: `router.get('/:id', validateUuid('id'), handler)`
 */
export function validateUuid(...paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const name of paramNames) {
      const value = req.params[name] as string | undefined;
      if (!value || typeof value !== 'string' || !UUID_REGEX.test(value)) {
        res.status(400).json({ error: `Invalid ${name} format` });
        return;
      }
    }
    next();
  };
}
