import { Router, Response } from 'express';
import multer from 'multer';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import * as assetService from '../services/asset.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Routes nested under /api/projects/:projectId/assets
export const projectAssetRoutes = Router({ mergeParams: true });
projectAssetRoutes.use(requireAuth);

projectAssetRoutes.post('/', upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file provided' });
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
});

projectAssetRoutes.get('/', async (req: AuthRequest, res: Response) => {
  const assets = await assetService.listAssets(
    req.params.projectId as string,
    req.userId!
  );

  if (!assets) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  res.json(assets);
});

// Standalone route for deleting an asset by id: /api/assets/:id
export const assetRoutes = Router();
assetRoutes.use(requireAuth);

assetRoutes.delete('/:id', async (req: AuthRequest, res: Response) => {
  const deleted = await assetService.deleteAsset(req.params.id as string, req.userId!);
  if (!deleted) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }
  res.status(204).send();
});
