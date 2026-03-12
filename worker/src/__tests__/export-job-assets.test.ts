import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { copyFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { assembleTypst } from '../renderers/typst-assembler.js';
import { generateTypstPdf } from '../generators/typst.generator.js';
import {
  createTypstWorkspace,
  rewriteUploadUrlsInDocs,
} from '../jobs/export.job.js';

const assetsDir = path.resolve(process.cwd(), 'assets');
const fontsDir = path.join(assetsDir, 'fonts');

const originalAssetStorageDir = process.env.ASSET_STORAGE_DIR;

afterEach(async () => {
  if (originalAssetStorageDir === undefined) {
    delete process.env.ASSET_STORAGE_DIR;
  } else {
    process.env.ASSET_STORAGE_DIR = originalAssetStorageDir;
  }
});

describe('Export job asset resolution', () => {
  it('rewrites project upload URLs into Typst workspace-relative paths', () => {
    const docs = rewriteUploadUrlsInDocs([
      {
        title: 'Front Matter',
        sortOrder: 0,
        kind: 'front_matter' as const,
        content: {
          type: 'doc',
          content: [
            {
              type: 'titlePage',
              attrs: {
                title: 'The Blackglass Mine',
                subtitle: 'A one-shot',
                author: 'DND Booker',
                coverImageUrl: '/uploads/project-123/cover.png',
              },
            },
          ],
        },
      },
    ]);

    expect(docs[0].content).toMatchObject({
      content: [
        {
          attrs: {
            coverImageUrl: 'uploads/project-123/cover.png',
          },
        },
      ],
    });
  });

  it('compiles a PDF when a document references a project upload image', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'dnd-booker-export-assets-'));
    const uploadsDir = path.join(tempRoot, 'uploads');
    const projectDir = path.join(uploadsDir, 'project-123');
    await mkdir(projectDir, { recursive: true });
    await copyFile(
      path.join(assetsDir, 'textures', 'parchment-classic.jpg'),
      path.join(projectDir, 'scene.jpg'),
    );
    process.env.ASSET_STORAGE_DIR = uploadsDir;

    const docs = rewriteUploadUrlsInDocs([
      {
        title: 'Scene Art',
        sortOrder: 0,
        kind: 'chapter' as const,
        content: {
          type: 'doc',
          content: [
            {
              type: 'fullBleedImage',
              attrs: {
                src: '/uploads/project-123/scene.jpg',
                caption: 'Mine entrance',
                position: 'half',
              },
            },
          ],
        },
      },
    ]);

    const workspace = await createTypstWorkspace(tempRoot);

    try {
      const source = assembleTypst({
        documents: docs,
        theme: 'classic-parchment',
        projectTitle: 'Upload Image Export Test',
      });

      const pdf = await generateTypstPdf(source, [fontsDir], workspace);
      expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(1000);
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 30_000);
});
