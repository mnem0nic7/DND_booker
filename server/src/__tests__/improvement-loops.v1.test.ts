import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../index.js';
import { prisma } from '../config/database.js';
import { createImprovementLoopRun } from '../services/improvement-loop/run.service.js';
import { createImprovementLoopArtifact } from '../services/improvement-loop/artifact.service.js';
import * as githubAppService from '../services/github-app.service.js';
import * as improvementLoopQueueService from '../services/improvement-loop/queue.service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const uniqueSuffix = Date.now();
const TEST_EMAIL = `improvement-loops-v1-${uniqueSuffix}@example.com`;

let accessToken: string;
let userId: string;
let projectId: string;

describe('Improvement loop API v1', () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('StrongP@ss1', 4);
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        displayName: 'Improvement Loop Test User',
      },
    });
    userId = user.id;

    accessToken = jwt.sign(
      { userId: user.id, tokenVersion: user.tokenVersion },
      JWT_SECRET,
      { expiresIn: '15m' },
    );

    const project = await prisma.project.create({
      data: {
        title: 'Improvement Loop Project',
        type: 'campaign',
        userId: user.id,
      },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('rejects starting a current-project improvement loop without a validated repo binding', async () => {
    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/improvement-loops`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        prompt: 'Improve this campaign.',
        objective: 'Run the full improvement loop.',
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('GitHub repo binding');
  });

  it('saves and reads a project GitHub repo binding', async () => {
    const saveRes = await request(app)
      .post(`/api/v1/projects/${projectId}/github-repo-binding`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        repositoryFullName: 'openai/dnd-booker',
        installationId: 123456,
        defaultBranch: 'main',
        pathAllowlist: ['docs/', 'README.md'],
        engineeringAutomationEnabled: true,
      });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.repositoryFullName).toBe('openai/dnd-booker');
    expect(saveRes.body.pathAllowlist).toEqual(['docs/', 'README.md']);

    const getRes = await request(app)
      .get(`/api/v1/projects/${projectId}/github-repo-binding`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.repositoryFullName).toBe('openai/dnd-booker');
    expect(getRes.body.defaultBranch).toBe('main');
    expect(typeof getRes.body.createdAt).toBe('string');
    expect(typeof getRes.body.updatedAt).toBe('string');
  });

  it('rejects create-and-run when the server GitHub App integration is unavailable', async () => {
    const configuredSpy = vi.spyOn(githubAppService, 'isGitHubAppConfigured').mockReturnValue(false);

    try {
      const res = await request(app)
        .post('/api/v1/improvement-loops')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          projectTitle: 'Fresh Loop Campaign',
          prompt: 'Create a campaign and run the loop.',
          objective: 'Run the four-stage improvement loop.',
          generationMode: 'campaign',
          generationQuality: 'polished',
          repoBinding: {
            repositoryFullName: 'openai/dnd-booker',
            installationId: 123456,
            defaultBranch: 'main',
            pathAllowlist: ['docs/'],
            engineeringAutomationEnabled: true,
          },
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('GitHub App integration');
    } finally {
      configuredSpy.mockRestore();
    }
  });

  it('allows create-and-run in report-only mode when the server GitHub App integration is unavailable', async () => {
    const configuredSpy = vi.spyOn(githubAppService, 'isGitHubAppConfigured').mockReturnValue(false);
    const publicRepoSpy = vi.spyOn(githubAppService, 'getPublicGitHubRepoInfo').mockResolvedValue({
      defaultBranch: 'main',
      htmlUrl: 'https://github.com/openai/dnd-booker',
    });
    const enqueueSpy = vi.spyOn(improvementLoopQueueService, 'enqueueImprovementLoopRun').mockResolvedValue(undefined);

    try {
      const res = await request(app)
        .post('/api/v1/improvement-loops')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          projectTitle: 'Fresh Loop Campaign Report Only',
          prompt: 'Create a campaign and run the loop in report-only mode.',
          objective: 'Run the four-stage improvement loop.',
          generationMode: 'campaign',
          generationQuality: 'polished',
          repoBinding: {
            repositoryFullName: 'openai/dnd-booker',
            installationId: 1,
            defaultBranch: 'main',
            pathAllowlist: ['docs/'],
            engineeringAutomationEnabled: false,
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.mode).toBe('create_campaign');
      expect(publicRepoSpy).toHaveBeenCalled();
      expect(enqueueSpy).toHaveBeenCalledWith(res.body.id, userId, res.body.projectId);
    } finally {
      enqueueSpy.mockRestore();
      publicRepoSpy.mockRestore();
      configuredSpy.mockRestore();
    }
  });

  it('lists run details and loop artifacts with ISO timestamps', async () => {
    const run = await createImprovementLoopRun({
      projectId,
      userId,
      mode: 'current_project',
      request: {
        prompt: 'Tighten the campaign.',
        objective: 'Run the improvement loop.',
        generationMode: 'campaign',
        generationQuality: 'polished',
      },
    });

    if (!run) {
      throw new Error('Failed to create improvement loop fixture.');
    }

    const artifact = await createImprovementLoopArtifact({
      runId: run.id,
      projectId,
      artifactType: 'creator_report',
      artifactKey: 'creator-report',
      title: 'Creator Report',
      summary: 'Creator initialized the project.',
      jsonContent: { ok: true },
      markdownContent: '# Creator Report\n',
    });

    const listRes = await request(app)
      .get(`/api/v1/projects/${projectId}/improvement-loops`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    const listedRun = listRes.body.find((candidate: { id: string }) => candidate.id === run.id);
    expect(listedRun).toBeTruthy();
    expect(typeof listedRun.createdAt).toBe('string');
    expect(typeof listedRun.updatedAt).toBe('string');

    const detailRes = await request(app)
      .get(`/api/v1/projects/${projectId}/improvement-loops/${run.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.id).toBe(run.id);
    expect(detailRes.body.artifactCount).toBe(1);
    expect(typeof detailRes.body.createdAt).toBe('string');
    expect(typeof detailRes.body.updatedAt).toBe('string');

    const artifactsRes = await request(app)
      .get(`/api/v1/projects/${projectId}/improvement-loops/${run.id}/artifacts`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(artifactsRes.status).toBe(200);
    expect(artifactsRes.body).toHaveLength(1);
    expect(artifactsRes.body[0].id).toBe(artifact.id);
    expect(typeof artifactsRes.body[0].createdAt).toBe('string');
    expect(typeof artifactsRes.body[0].updatedAt).toBe('string');

    const artifactDetailRes = await request(app)
      .get(`/api/v1/projects/${projectId}/improvement-loops/${run.id}/artifacts/${artifact.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(artifactDetailRes.status).toBe(200);
    expect(artifactDetailRes.body.id).toBe(artifact.id);
    expect(typeof artifactDetailRes.body.createdAt).toBe('string');
    expect(typeof artifactDetailRes.body.updatedAt).toBe('string');
  });
});
