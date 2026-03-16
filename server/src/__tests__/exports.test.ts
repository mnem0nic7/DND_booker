import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import app from '../index.js';
import { prisma } from '../config/database.js';

const TEST_USER = {
  email: 'export-test@example.com',
  password: 'StrongP@ss1',
  displayName: 'Export Test User',
};

let accessToken: string;
let projectId: string;

describe('Export Routes', () => {
  beforeAll(async () => {
    const existingUser = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existingUser) {
      await prisma.exportJob.deleteMany({ where: { userId: existingUser.id } });
      await prisma.project.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.delete({ where: { id: existingUser.id } });
    }

    const res = await request(app).post('/api/auth/register').send(TEST_USER);
    accessToken = res.body.accessToken;

    const projRes = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Export Test Project' });
    projectId = projRes.body.id;
  });

  afterAll(async () => {
    const existingUser = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existingUser) {
      await prisma.exportJob.deleteMany({ where: { userId: existingUser.id } });
      await prisma.project.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.delete({ where: { id: existingUser.id } });
    }
    await prisma.$disconnect();
  });

  describe('POST /api/projects/:id/export', () => {
    it('should create an export job with valid format', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/export`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ format: 'pdf' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.format).toBe('pdf');
      expect(res.body.projectId).toBe(projectId);
      expect(res.body.status).toBe('queued');
      expect(res.body.review).toBeNull();
    });

    it('should accept epub format', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/export`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ format: 'epub' });

      expect(res.status).toBe(201);
      expect(res.body.format).toBe('epub');
    });

    it('should accept print_pdf format', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/export`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ format: 'print_pdf' });

      expect(res.status).toBe(201);
      expect(res.body.format).toBe('print_pdf');
    });

    it('should reject invalid format', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/export`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ format: 'docx' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject missing format', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/export`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(app)
        .post('/api/projects/00000000-0000-0000-0000-000000000000/export')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ format: 'pdf' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Project not found');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/export`)
        .send({ format: 'pdf' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/projects/:id/export-jobs', () => {
    it('should list export history for a project', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/export-jobs`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].projectId).toBe(projectId);
      expect(res.body[0].format).toBeDefined();
      expect(res.body[0].status).toBeDefined();
      expect(res.body[0]).toHaveProperty('review');
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(app)
        .get('/api/projects/00000000-0000-0000-0000-000000000000/export-jobs')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Project not found');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/export-jobs`);

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/export-jobs/:id', () => {
    let exportJobId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/export`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ format: 'pdf' });
      exportJobId = res.body.id;
    });

    it('should get export job status', async () => {
      const res = await request(app)
        .get(`/api/export-jobs/${exportJobId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(exportJobId);
      expect(res.body.format).toBe('pdf');
      expect(res.body.status).toBeDefined();
      expect(res.body.review).toBeNull();
    });

    it('should return completed export review data when present', async () => {
      const reviewedJob = await prisma.exportJob.create({
        data: {
          projectId,
          userId: (await prisma.user.findUnique({ where: { email: TEST_USER.email } }))!.id,
          format: 'pdf',
          status: 'completed',
          progress: 100,
          outputUrl: '/output/reviewed.pdf',
          reviewJson: {
            status: 'needs_attention',
            score: 72,
            generatedAt: new Date().toISOString(),
            summary: 'Export review found 2 layout issues.',
            passCount: 1,
            appliedFixes: [],
            findings: [
              {
                code: 'EXPORT_CHAPTER_OPENER_LOW',
                severity: 'warning',
                page: 6,
                message: 'Chapter 2 starts too low on page 6.',
                details: { topRatio: 0.41 },
              },
            ],
            metrics: {
              pageCount: 26,
              pageWidthPts: 612,
              pageHeightPts: 792,
              lastPageFillRatio: 0.28,
              sectionStarts: [],
              utilityCoverage: [],
            },
          },
          completedAt: new Date(),
        },
      });

      try {
        const res = await request(app)
          .get(`/api/export-jobs/${reviewedJob.id}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(res.status).toBe(200);
        expect(res.body.review).toBeTruthy();
        expect(res.body.review.score).toBe(72);
        expect(res.body.review.findings[0].code).toBe('EXPORT_CHAPTER_OPENER_LOW');
      } finally {
        await prisma.exportJob.delete({ where: { id: reviewedJob.id } });
      }
    });

    it('should return 404 for non-existent job', async () => {
      const res = await request(app)
        .get('/api/export-jobs/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Export job not found');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .get(`/api/export-jobs/${exportJobId}`);

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/export-jobs/:id/fix', () => {
    it('should apply safe export fixes and queue a replacement export', async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER.email } });
      const doc = await prisma.projectDocument.create({
        data: {
          projectId,
          kind: 'chapter',
          title: 'Chapter 1: Broken Tools',
          slug: `broken-tools-${Date.now()}`,
          sortOrder: 99,
          content: {
            type: 'doc',
            content: [
              {
                type: 'encounterTable',
                attrs: {
                  environment: 'Mine',
                  crRange: '1-4',
                  entries: '[]',
                },
              },
              {
                type: 'randomTable',
                attrs: {
                  title: 'Complications',
                  dieType: 'd6',
                  entries: '[]',
                },
              },
              {
                type: 'statBlock',
                attrs: {
                  name: 'Broken Guardian',
                  ac: 0,
                  hp: 0,
                },
              },
              {
                type: 'heading',
                attrs: { level: 1 },
                content: [
                  {
                    type: 'text',
                    text: 'The Shadow Prism An ancient artifact of immense power that can control shadows but corrupts its wielder.',
                  },
                ],
              },
            ],
          },
        },
      });

      const reviewedJob = await prisma.exportJob.create({
        data: {
          projectId,
          userId: user.id,
          format: 'pdf',
          status: 'completed',
          progress: 100,
          outputUrl: '/output/reviewed-fixable.pdf',
          reviewJson: {
            status: 'needs_attention',
            score: 18,
            generatedAt: new Date().toISOString(),
            summary: 'Export review found 4 issues.',
            passCount: 1,
            appliedFixes: [],
            findings: [
              {
                code: 'EXPORT_EMPTY_ENCOUNTER_TABLE',
                severity: 'error',
                page: null,
                message: '"Chapter 1: Broken Tools" includes an empty encounter table.',
                details: { title: doc.title, blockType: 'encounterTable' },
              },
              {
                code: 'EXPORT_EMPTY_RANDOM_TABLE',
                severity: 'error',
                page: null,
                message: '"Chapter 1: Broken Tools" includes an empty random table.',
                details: { title: doc.title, blockType: 'randomTable' },
              },
              {
                code: 'EXPORT_PLACEHOLDER_STAT_BLOCK',
                severity: 'error',
                page: null,
                message: '"Chapter 1: Broken Tools" includes a broken or placeholder stat block.',
                details: { title: doc.title, blockType: 'statBlock' },
              },
              {
                code: 'EXPORT_OVERSIZED_DISPLAY_HEADING',
                severity: 'warning',
                page: null,
                message: '"Chapter 1: Broken Tools" includes an oversized display heading that is likely malformed.',
                details: { title: doc.title, level: 1 },
              },
            ],
            metrics: {
              pageCount: 8,
              pageWidthPts: 612,
              pageHeightPts: 792,
              lastPageFillRatio: 0.42,
              sectionStarts: [],
              utilityCoverage: [],
            },
          },
          completedAt: new Date(),
        },
      });

      try {
        const res = await request(app)
          .post(`/api/export-jobs/${reviewedJob.id}/fix`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(res.status).toBe(201);
        expect(res.body.status).toBe('started');
        expect(res.body.appliedFixCount).toBe(4);
        expect(res.body.documentsUpdated).toBe(1);
        expect(res.body.exportJob).toBeTruthy();
        expect(res.body.exportJob.status).toBe('queued');
        expect(res.body.exportJob.format).toBe('pdf');

        const updatedDoc = await prisma.projectDocument.findUniqueOrThrow({ where: { id: doc.id } });
        const content = updatedDoc.content as { type: string; content?: Array<{ type: string }> };
        const nodeTypes = (content.content ?? []).map((node) => node.type);
        expect(nodeTypes).not.toContain('encounterTable');
        expect(nodeTypes).not.toContain('randomTable');
        expect(nodeTypes).not.toContain('statBlock');
        expect(nodeTypes).toContain('paragraph');
      } finally {
        await prisma.exportJob.deleteMany({ where: { projectId, userId: user.id, outputUrl: '/output/reviewed-fixable.pdf' } });
        await prisma.projectDocument.delete({ where: { id: doc.id } });
      }
    });

    it('should report when findings need manual revision instead of a safe fix', async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER.email } });
      const reviewedJob = await prisma.exportJob.create({
        data: {
          projectId,
          userId: user.id,
          format: 'pdf',
          status: 'completed',
          progress: 100,
          outputUrl: '/output/reviewed-manual.pdf',
          reviewJson: {
            status: 'needs_attention',
            score: 64,
            generatedAt: new Date().toISOString(),
            summary: 'Export review found 1 issue.',
            passCount: 1,
            appliedFixes: [],
            findings: [
              {
                code: 'EXPORT_LOW_UTILITY_DENSITY',
                severity: 'warning',
                page: null,
                message: '"Chapter 2: Too Much Lore" is prose-heavy and under-indexed for table use.',
                details: { title: 'Chapter 2: Too Much Lore' },
              },
            ],
            metrics: {
              pageCount: 6,
              pageWidthPts: 612,
              pageHeightPts: 792,
              lastPageFillRatio: 0.54,
              sectionStarts: [],
              utilityCoverage: [],
            },
          },
          completedAt: new Date(),
        },
      });

      try {
        const res = await request(app)
          .post(`/api/export-jobs/${reviewedJob.id}/fix`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('No automatic fixes');
        expect(res.body.result.status).toBe('no_fixes');
      } finally {
        await prisma.exportJob.delete({ where: { id: reviewedJob.id } });
      }
    });

    it('should refresh layout plans for layout-only findings and queue a replacement export', async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER.email } });
      const doc = await prisma.projectDocument.create({
        data: {
          projectId,
          kind: 'chapter',
          title: 'Chapter 2: Layout Trouble',
          slug: `layout-trouble-${Date.now()}`,
          sortOrder: 100,
          content: {
            type: 'doc',
            content: [
              {
                type: 'chapterHeader',
                attrs: {
                  chapterNumber: 'Chapter 2',
                  title: 'Layout Trouble',
                  backgroundImage: '/uploads/layout-trouble.png',
                },
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'This scene needs a better layout plan so the hero art and encounter packet can stay together.',
                  },
                ],
              },
              {
                type: 'statBlock',
                attrs: {
                  name: 'Layout Shade',
                  ac: 13,
                  hp: 18,
                  speed: '30 ft.',
                },
              },
            ],
          },
          layoutPlan: {
            version: 1,
            sectionRecipe: 'utility_table_spread',
            columnBalanceTarget: 'left_heavy',
            blocks: [],
          },
        },
      });

      const reviewedJob = await prisma.exportJob.create({
        data: {
          projectId,
          userId: user.id,
          format: 'pdf',
          status: 'completed',
          progress: 100,
          outputUrl: '/output/reviewed-layout-only.pdf',
          reviewJson: {
            status: 'needs_attention',
            score: 51,
            generatedAt: new Date().toISOString(),
            summary: 'Export review found 2 layout issues.',
            passCount: 1,
            appliedFixes: [],
            findings: [
              {
                code: 'EXPORT_UNUSED_PAGE_REGION',
                severity: 'warning',
                page: 5,
                message: '"Chapter 2: Layout Trouble" leaves a large unused region on page 5.',
                details: { pageIndex: 4 },
              },
              {
                code: 'EXPORT_SPLIT_SCENE_PACKET',
                severity: 'warning',
                page: 6,
                message: '"Chapter 2: Layout Trouble" splits an encounter packet across layout regions.',
                details: { groupId: 'encounter-packet-1' },
              },
            ],
            metrics: {
              pageCount: 6,
              pageWidthPts: 612,
              pageHeightPts: 792,
              lastPageFillRatio: 0.54,
              sectionStarts: [
                {
                  title: doc.title,
                  kind: 'chapter',
                  page: 5,
                  topRatio: 0,
                  lineCount: 1,
                  hyphenated: false,
                },
              ],
              utilityCoverage: [],
            },
          },
          completedAt: new Date(),
        },
      });

      try {
        const res = await request(app)
          .post(`/api/export-jobs/${reviewedJob.id}/fix`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(res.status).toBe(201);
        expect(res.body.status).toBe('started');
        expect(res.body.appliedFixCount).toBe(2);
        expect(res.body.documentsUpdated).toBe(1);
        expect(res.body.exportJob).toBeTruthy();
        expect(res.body.exportJob.status).toBe('queued');
        expect(res.body.changes).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: 'EXPORT_UNUSED_PAGE_REGION',
              action: 'refresh_layout_plan',
              title: doc.title,
              count: 1,
            }),
            expect.objectContaining({
              code: 'EXPORT_SPLIT_SCENE_PACKET',
              action: 'refresh_layout_plan',
              title: doc.title,
              count: 1,
            }),
          ]),
        );

        const updatedDoc = await prisma.projectDocument.findUniqueOrThrow({ where: { id: doc.id } });
        expect(updatedDoc.layoutPlan).toBeTruthy();
        expect((updatedDoc.layoutPlan as { sectionRecipe?: string }).sectionRecipe).not.toBe('utility_table_spread');
      } finally {
        await prisma.exportJob.deleteMany({ where: { projectId, userId: user.id, outputUrl: '/output/reviewed-layout-only.pdf' } });
        await prisma.projectDocument.delete({ where: { id: doc.id } });
      }
    });
  });

  describe('GET /api/export-jobs/:id/download', () => {
    let pendingJobId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/export`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ format: 'pdf' });
      pendingJobId = res.body.id;
    });

    it('should return 400 for pending (incomplete) export', async () => {
      const res = await request(app)
        .get(`/api/export-jobs/${pendingJobId}/download`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Export is not yet complete.');
    });

    it('should return 404 for non-existent job', async () => {
      const res = await request(app)
        .get('/api/export-jobs/00000000-0000-0000-0000-000000000000/download')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Export job not found');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .get(`/api/export-jobs/${pendingJobId}/download`);

      expect(res.status).toBe(401);
    });

    it('should download a completed export file', async () => {
      // Create a completed job with a real output file
      const exportJob = await prisma.exportJob.create({
        data: {
          projectId,
          userId: (await prisma.user.findUnique({ where: { email: TEST_USER.email } }))!.id,
          format: 'pdf',
          status: 'completed',
          progress: 100,
          outputUrl: '/output/test-download.pdf',
          completedAt: new Date(),
        },
      });

      // Create the output file
      const outputDir = process.env.EXPORT_OUTPUT_DIR || path.join(process.cwd(), '..', 'worker', 'output');
      fs.mkdirSync(outputDir, { recursive: true });
      const testContent = Buffer.from('%PDF-1.4 test content');
      fs.writeFileSync(path.join(outputDir, 'test-download.pdf'), testContent);

      try {
        const res = await request(app)
          .get(`/api/export-jobs/${exportJob.id}/download`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/pdf');
        expect(res.headers['content-disposition']).toContain('test-download.pdf');
      } finally {
        // Clean up
        try { fs.unlinkSync(path.join(outputDir, 'test-download.pdf')); } catch { /* ignore */ }
        await prisma.exportJob.delete({ where: { id: exportJob.id } });
      }
    });

    it('should return 404 when output file has been cleaned up', async () => {
      const exportJob = await prisma.exportJob.create({
        data: {
          projectId,
          userId: (await prisma.user.findUnique({ where: { email: TEST_USER.email } }))!.id,
          format: 'pdf',
          status: 'completed',
          progress: 100,
          outputUrl: '/output/nonexistent-file.pdf',
          completedAt: new Date(),
        },
      });

      try {
        const res = await request(app)
          .get(`/api/export-jobs/${exportJob.id}/download`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(res.status).toBe(404);
      } finally {
        await prisma.exportJob.delete({ where: { id: exportJob.id } });
      }
    });
  });
});
