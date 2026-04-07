import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Storage } from '@google-cloud/storage';
import {
  buildProjectAssetUrl,
  getAssetStorageDir,
  parseProjectAssetUrl,
  resolveProjectAssetPathFromUrl,
} from './asset-paths.service.js';

const EXPORT_OUTPUT_DIR = process.env.EXPORT_OUTPUT_DIR
  || path.resolve(process.cwd(), '..', 'worker', 'output');

let storageClient: Storage | null = null;

function getGcsBucketName(): string | null {
  const bucket = process.env.GCS_BUCKET?.trim();
  return bucket ? bucket : null;
}

function isGcsEnabled(): boolean {
  return Boolean(getGcsBucketName());
}

function getStorageClient(): Storage {
  if (!storageClient) {
    storageClient = new Storage();
  }
  return storageClient;
}

function getBucket() {
  const bucketName = getGcsBucketName();
  if (!bucketName) {
    throw new Error('GCS_BUCKET is not configured');
  }
  return getStorageClient().bucket(bucketName);
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

function joinObjectPath(...parts: string[]): string {
  return parts.filter(Boolean).join('/');
}

function getAssetPrefix(): string {
  return trimSlashes(process.env.GCS_ASSET_PREFIX?.trim() || 'uploads');
}

function getExportPrefix(): string {
  return trimSlashes(process.env.GCS_EXPORT_PREFIX?.trim() || 'output');
}

function getAssetObjectName(projectId: string, filename: string): string {
  return joinObjectPath(getAssetPrefix(), projectId, filename);
}

function parseExportUrl(url: string): { filename: string } | null {
  const match = url.match(/^\/output\/([^?#]+)$/);
  if (!match) return null;
  try {
    return { filename: decodeURIComponent(match[1]) };
  } catch {
    return { filename: match[1] };
  }
}

function getExportObjectName(filename: string): string {
  return joinObjectPath(getExportPrefix(), filename);
}

function getAssetMimeType(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.png':
    default:
      return 'image/png';
  }
}

export async function saveProjectAsset(input: {
  projectId: string;
  filename: string;
  buffer: Buffer;
  contentType: string;
}): Promise<string> {
  const { projectId, filename, buffer, contentType } = input;
  const url = buildProjectAssetUrl(projectId, filename);

  if (isGcsEnabled()) {
    const file = getBucket().file(getAssetObjectName(projectId, filename));
    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType,
        cacheControl: 'private, max-age=3600',
      },
    });
    return url;
  }

  const root = getAssetStorageDir();
  const dir = path.join(root, projectId);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, filename), buffer);
  return url;
}

export async function deleteProjectAssetByUrl(url: string): Promise<void> {
  const parsed = parseProjectAssetUrl(url);
  if (!parsed) return;

  if (isGcsEnabled()) {
    try {
      await getBucket().file(getAssetObjectName(parsed.projectId, parsed.filename)).delete();
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code !== 404) throw error;
    }
    return;
  }

  const filePath = resolveProjectAssetPathFromUrl(url);
  if (!filePath) return;
  await fsp.unlink(filePath);
}

export async function readProjectAssetBuffer(url: string): Promise<Buffer> {
  const parsed = parseProjectAssetUrl(url);
  if (!parsed) {
    throw new Error(`Invalid asset URL: ${url}`);
  }

  if (isGcsEnabled()) {
    const [buffer] = await getBucket().file(getAssetObjectName(parsed.projectId, parsed.filename)).download();
    return buffer;
  }

  const filePath = resolveProjectAssetPathFromUrl(url);
  if (!filePath) {
    throw new Error(`Invalid asset URL: ${url}`);
  }
  return fsp.readFile(filePath);
}

export async function openProjectAssetStream(input: {
  projectId: string;
  filename: string;
}): Promise<{ stream: Readable; contentType: string }> {
  const { projectId, filename } = input;

  if (isGcsEnabled()) {
    const file = getBucket().file(getAssetObjectName(projectId, filename));
    const [exists] = await file.exists();
    if (!exists) {
      const error = new Error('Asset not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
    return {
      stream: file.createReadStream(),
      contentType: getAssetMimeType(filename),
    };
  }

  const filePath = path.resolve(getAssetStorageDir(), projectId, filename);
  await fsp.access(filePath);
  return {
    stream: fs.createReadStream(filePath),
    contentType: getAssetMimeType(filename),
  };
}

export async function saveExportArtifact(input: {
  filename: string;
  buffer: Buffer;
  contentType: string;
}): Promise<string> {
  const { filename, buffer, contentType } = input;
  const outputUrl = `/output/${filename}`;

  if (isGcsEnabled()) {
    const file = getBucket().file(getExportObjectName(filename));
    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType,
        cacheControl: 'private, max-age=3600',
      },
    });
    return outputUrl;
  }

  await fsp.mkdir(EXPORT_OUTPUT_DIR, { recursive: true });
  await fsp.writeFile(path.join(EXPORT_OUTPUT_DIR, filename), buffer);
  return outputUrl;
}

export async function deleteExportArtifactByUrl(url: string): Promise<void> {
  const parsed = parseExportUrl(url);
  if (!parsed) return;

  if (isGcsEnabled()) {
    try {
      await getBucket().file(getExportObjectName(parsed.filename)).delete();
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code !== 404) throw error;
    }
    return;
  }

  await fsp.unlink(path.join(EXPORT_OUTPUT_DIR, parsed.filename));
}

export async function openExportArtifactStream(url: string): Promise<Readable> {
  const parsed = parseExportUrl(url);
  if (!parsed) {
    const error = new Error('Invalid export URL') as NodeJS.ErrnoException;
    error.code = 'EINVAL';
    throw error;
  }

  if (isGcsEnabled()) {
    const file = getBucket().file(getExportObjectName(parsed.filename));
    const [exists] = await file.exists();
    if (!exists) {
      const error = new Error('Export not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
    return file.createReadStream();
  }

  const resolvedDir = path.resolve(EXPORT_OUTPUT_DIR);
  const filePath = path.resolve(EXPORT_OUTPUT_DIR, parsed.filename);
  if (!filePath.startsWith(resolvedDir + path.sep)) {
    const error = new Error('Invalid export URL') as NodeJS.ErrnoException;
    error.code = 'EINVAL';
    throw error;
  }
  return fs.createReadStream(filePath);
}
