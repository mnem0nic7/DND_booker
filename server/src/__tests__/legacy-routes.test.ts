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

describe('Legacy route removal', () => {
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

  it('returns 404 for removed legacy project routes and keeps v1 routes available', async () => {
    const legacyRes = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(legacyRes.status).toBe(404);
    expect(legacyRes.headers.deprecation).toBeUndefined();
    expect(legacyRes.headers['x-api-compatibility']).toBeUndefined();

    const v1Res = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(v1Res.status).toBe(200);
    expect(v1Res.headers.deprecation).toBeUndefined();
    expect(v1Res.headers['x-api-compatibility']).toBeUndefined();
  });
});
