import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { asyncHandler } from '../../middleware/async-handler.js';

const v1SpecRoutes = Router();

v1SpecRoutes.get('/openapi.json', asyncHandler(async (_req, res) => {
  const candidates = [
    resolve(process.cwd(), 'sdk', 'openapi', 'v1.json'),
    resolve(process.cwd(), '..', 'sdk', 'openapi', 'v1.json'),
  ];

  let raw: string | null = null;
  for (const specPath of candidates) {
    try {
      raw = await readFile(specPath, 'utf8');
      break;
    } catch {
      // Try the next candidate.
    }
  }

  if (!raw) {
    res.status(404).json({ error: 'OpenAPI spec has not been generated yet' });
    return;
  }

  res.type('application/json').send(raw);
}));

export default v1SpecRoutes;
