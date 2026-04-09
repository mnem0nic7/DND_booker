import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../index.js';
import { prisma } from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const TEST_EMAIL = `legacy-route-${Date.now()}@example.com`;

let accessToken: string;
let userId: string;

describe('Legacy route compatibility headers', () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('StrongP@ss1', 4);
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        displayName: 'Legacy Route Test User',
      },
    });
    userId = user.id;

    accessToken = jwt.sign(
      { userId: user.id, tokenVersion: user.tokenVersion },
      JWT_SECRET,
      { expiresIn: '15m' },
    );
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('marks legacy project routes as deprecated and leaves v1 routes clean', async () => {
    const legacyRes = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(legacyRes.status).toBe(200);
    expect(legacyRes.headers.deprecation).toBe('true');
    expect(legacyRes.headers.sunset).toBeDefined();
    expect(legacyRes.headers.link).toContain('/api/v1/openapi.json');
    expect(legacyRes.headers['x-api-compatibility']).toBe('legacy');

    const v1Res = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(v1Res.status).toBe(200);
    expect(v1Res.headers.deprecation).toBeUndefined();
    expect(v1Res.headers['x-api-compatibility']).toBeUndefined();
  });
});
