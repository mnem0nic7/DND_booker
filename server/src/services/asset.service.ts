import path from 'path';
import fs from 'fs/promises';
import { prisma } from '../config/database.js';
import {
  buildProjectAssetUrl,
  getAssetStorageDir,
  getProjectAssetDir,
  resolveProjectAssetPathFromUrl,
} from './asset-paths.service.js';

const UPLOADS_DIR = getAssetStorageDir();

/** Ensure the uploads directory exists. */
async function ensureUploadsDir(): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

/** Build a project-scoped directory path inside uploads/. */
function projectDir(projectId: string): string {
  return getProjectAssetDir(projectId);
}

/**
 * Save an uploaded file to disk and create an Asset record.
 * Returns the created Asset.
 */
export async function createAsset(
  projectId: string,
  userId: string,
  file: { originalname: string; mimetype: string; size: number; buffer: Buffer }
) {
  // Verify the user owns the project
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return null;

  await ensureUploadsDir();
  const dir = projectDir(projectId);
  await fs.mkdir(dir, { recursive: true });

  // Generate a unique filename to avoid collisions
  const ext = path.extname(file.originalname);
  const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
  const uniqueName = `${baseName}_${Date.now()}${ext}`;
  const filePath = path.join(dir, uniqueName);

  await fs.writeFile(filePath, file.buffer);

  // Build a URL that can be served statically
  const url = buildProjectAssetUrl(projectId, uniqueName);

  const asset = await prisma.asset.create({
    data: {
      userId,
      projectId,
      filename: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      url,
    },
  });

  return asset;
}

/**
 * List all assets belonging to a project.
 * Returns null if the project doesn't belong to the user.
 */
export async function listAssets(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return null;

  return prisma.asset.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Delete an asset record and its file from disk.
 * Returns the deleted asset, or null if not found / not authorized.
 */
export async function deleteAsset(assetId: string, userId: string) {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
  });

  if (!asset || asset.userId !== userId) return null;

  // Remove file from disk (best-effort)
  try {
    const filePath = resolveProjectAssetPathFromUrl(asset.url);
    if (filePath) {
      await fs.unlink(filePath);
    }
  } catch (err: unknown) {
    // Only swallow ENOENT (file already gone); log everything else
    if (err instanceof Error && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[Asset] Failed to delete file from disk:', err.message);
    }
  }

  return prisma.asset.delete({ where: { id: assetId } });
}
