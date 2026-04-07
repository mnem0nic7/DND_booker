import { prisma } from '../config/database.js';
import { deleteProjectAssetByUrl, saveProjectAsset } from './object-storage.service.js';

/**
 * Save an uploaded file to storage and create an Asset record.
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

  // Generate a unique filename to avoid collisions
  const path = await import('node:path');
  const ext = path.extname(file.originalname);
  const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
  const uniqueName = `${baseName}_${Date.now()}${ext}`;
  const url = await saveProjectAsset({
    projectId,
    filename: uniqueName,
    buffer: file.buffer,
    contentType: file.mimetype,
  });

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
 * Delete an asset record and its file from storage.
 * Returns the deleted asset, or null if not found / not authorized.
 */
export async function deleteAsset(assetId: string, userId: string) {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
  });

  if (!asset || asset.userId !== userId) return null;

  // Remove file from disk (best-effort)
  try {
    await deleteProjectAssetByUrl(asset.url);
  } catch (err: unknown) {
    // Only swallow ENOENT (file already gone); log everything else
    if (err instanceof Error && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[Asset] Failed to delete file from storage:', err.message);
    }
  }

  return prisma.asset.delete({ where: { id: assetId } });
}
