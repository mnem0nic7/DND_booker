import path from 'path';

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function getAssetStorageDir(cwd: string = process.cwd()): string {
  const configured = process.env.ASSET_STORAGE_DIR?.trim();
  return configured ? path.resolve(configured) : path.resolve(cwd, '../uploads');
}

export function getProjectAssetDir(projectId: string, cwd?: string): string {
  return path.join(getAssetStorageDir(cwd), projectId);
}

export function buildProjectAssetUrl(projectId: string, filename: string): string {
  return `/uploads/${projectId}/${filename}`;
}

export function getProjectAssetRelativePath(projectId: string, filename: string): string {
  return path.posix.join('uploads', projectId, filename);
}

export function parseProjectAssetUrl(url: string): { projectId: string; filename: string } | null {
  const match = url.match(/^\/uploads\/([^/]+)\/([^?#]+)$/);
  if (!match) return null;
  return {
    projectId: decodeSegment(match[1]),
    filename: decodeSegment(match[2]),
  };
}

export function resolveProjectAssetPathFromUrl(url: string, cwd?: string): string | null {
  const parsed = parseProjectAssetUrl(url);
  if (!parsed) return null;

  const root = getAssetStorageDir(cwd);
  const filePath = path.resolve(root, parsed.projectId, parsed.filename);
  const resolvedRoot = path.resolve(root);

  if (!filePath.startsWith(resolvedRoot + path.sep)) return null;
  return filePath;
}
