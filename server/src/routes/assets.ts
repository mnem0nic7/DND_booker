import { Router, Response } from 'express';
import multer from 'multer';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validateUuid } from '../middleware/validate-uuid.js';
import { crudRateLimit } from '../middleware/ai-rate-limit.js';
import * as assetService from '../services/asset.service.js';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
  fileFilter: (_req, file, cb) => {
    // SVG intentionally excluded — SVG can contain embedded scripts (XSS risk)
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Routes nested under /api/projects/:projectId/assets
export const projectAssetRoutes = Router({ mergeParams: true });
projectAssetRoutes.use(requireAuth);
projectAssetRoutes.use(crudRateLimit);

projectAssetRoutes.post('/', validateUuid('projectId'), upload.single('file'), asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file provided' });
    return;
  }

  // Validate actual file content via magic bytes (MIME header is client-controlled and spoofable)
  const { fileTypeFromBuffer } = await import('file-type');
  const detectedType = await fileTypeFromBuffer(req.file.buffer);
  if (!detectedType || !ALLOWED_MIME_TYPES.includes(detectedType.mime)) {
    res.status(400).json({ error: 'File content does not match an allowed image type' });
    return;
  }

  const asset = await assetService.createAsset(
    req.params.projectId as string,
    req.userId!,
    {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      buffer: req.file.buffer,
    }
  );

  if (!asset) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  res.status(201).json(asset);
}));

projectAssetRoutes.get('/', validateUuid('projectId'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const assets = await assetService.listAssets(
    req.params.projectId as string,
    req.userId!
  );

  if (!assets) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  res.json(assets);
}));

// Standalone route for deleting an asset by id: /api/assets/:id
export const assetRoutes = Router();
assetRoutes.use(requireAuth);

assetRoutes.delete('/:id', validateUuid('id'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const deleted = await assetService.deleteAsset(req.params.id as string, req.userId!);
  if (!deleted) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }
  res.status(204).send();
}));
