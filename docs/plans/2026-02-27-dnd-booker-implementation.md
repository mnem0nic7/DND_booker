# DND Booker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a microservices web app for creating D&D campaign material (campaigns, one-shots, supplements, sourcebooks) with a WYSIWYG block editor, targeting DriveThruRPG/DMsGuild publishing.

**Architecture:** Three services — React frontend with TipTap block editor, Express.js API with PostgreSQL/Prisma, and a BullMQ PDF worker with Puppeteer/Pandoc. Services communicate via REST and Redis job queue.

**Tech Stack:** React 19, TipTap v3, Tailwind CSS, Zustand, Express.js, Prisma 6, PostgreSQL, BullMQ, Redis, Puppeteer 24, Pandoc, Docker Compose, Vitest, React Testing Library

---

## Phase 1: Infrastructure & Scaffolding

### Task 1: Initialize monorepo structure and Docker Compose

**Files:**
- Create: `package.json` (root workspace)
- Create: `client/package.json`
- Create: `server/package.json`
- Create: `worker/package.json`
- Create: `shared/package.json`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`

**Step 1: Create root package.json with npm workspaces**

```json
{
  "name": "dnd-booker",
  "private": true,
  "workspaces": ["client", "server", "worker", "shared"]
}
```

**Step 2: Create Docker Compose with PostgreSQL and Redis**

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: dnd_booker
      POSTGRES_PASSWORD: dnd_booker_dev
      POSTGRES_DB: dnd_booker
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

volumes:
  pgdata:
```

**Step 3: Create .env.example**

```
DATABASE_URL="postgresql://dnd_booker:dnd_booker_dev@localhost:5432/dnd_booker?schema=public"
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=change-me-in-production
JWT_REFRESH_SECRET=change-me-in-production-too
PORT=4000
CLIENT_URL=http://localhost:3000
S3_BUCKET=dnd-booker-assets
S3_REGION=us-east-1
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
.env
*.log
.DS_Store
coverage/
```

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: initialize monorepo with Docker Compose for Postgres and Redis"
```

---

### Task 2: Scaffold shared types package

**Files:**
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/src/index.ts`
- Create: `shared/src/types/project.ts`
- Create: `shared/src/types/document.ts`
- Create: `shared/src/types/user.ts`
- Create: `shared/src/types/export.ts`
- Create: `shared/src/types/template.ts`
- Create: `shared/src/constants/index.ts`

**Step 1: Create shared/package.json**

```json
{
  "name": "@dnd-booker/shared",
  "version": "0.0.1",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

**Step 2: Create TypeScript types**

`shared/src/types/user.ts`:
```typescript
export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}
```

`shared/src/types/project.ts`:
```typescript
export type ProjectType = 'campaign' | 'one_shot' | 'supplement' | 'sourcebook';
export type ProjectStatus = 'draft' | 'in_progress' | 'review' | 'published';

export interface ProjectSettings {
  pageSize: 'letter' | 'a4' | 'a5';
  margins: { top: number; right: number; bottom: number; left: number };
  columns: 1 | 2;
  theme: string;
  fonts: { heading: string; body: string };
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  description: string;
  type: ProjectType;
  status: ProjectStatus;
  coverImageUrl: string | null;
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  title: string;
  description?: string;
  type: ProjectType;
  templateId?: string;
}
```

`shared/src/types/document.ts`:
```typescript
import { JSONContent } from '@tiptap/core';

export interface Document {
  id: string;
  projectId: string;
  title: string;
  sortOrder: number;
  content: JSONContent;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentRequest {
  title: string;
  content?: JSONContent;
}
```

`shared/src/types/export.ts`:
```typescript
export type ExportFormat = 'pdf' | 'epub' | 'print_pdf';
export type ExportStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface ExportJob {
  id: string;
  projectId: string;
  userId: string;
  format: ExportFormat;
  status: ExportStatus;
  progress: number;
  outputUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ExportRequest {
  format: ExportFormat;
}
```

`shared/src/types/template.ts`:
```typescript
import { JSONContent } from '@tiptap/core';
import { ProjectType } from './project';

export interface Template {
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  content: JSONContent;
  thumbnailUrl: string | null;
  isSystem: boolean;
  userId: string | null;
}
```

`shared/src/constants/index.ts`:
```typescript
export const PROJECT_TYPES = ['campaign', 'one_shot', 'supplement', 'sourcebook'] as const;
export const PROJECT_STATUSES = ['draft', 'in_progress', 'review', 'published'] as const;
export const EXPORT_FORMATS = ['pdf', 'epub', 'print_pdf'] as const;
export const EXPORT_STATUSES = ['queued', 'processing', 'completed', 'failed'] as const;

export const DEFAULT_PROJECT_SETTINGS = {
  pageSize: 'letter' as const,
  margins: { top: 1, right: 1, bottom: 1, left: 1 },
  columns: 1 as const,
  theme: 'classic-parchment',
  fonts: { heading: 'Cinzel', body: 'Crimson Text' },
};
```

`shared/src/index.ts`:
```typescript
export * from './types/user';
export * from './types/project';
export * from './types/document';
export * from './types/export';
export * from './types/template';
export * from './constants';
```

**Step 3: Commit**

```bash
git add shared/
git commit -m "feat: add shared types package with project, document, and export types"
```

---

## Phase 2: Server — Database & Auth

### Task 3: Set up Express server with Prisma schema

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/index.ts`
- Create: `server/src/config/database.ts`
- Create: `server/src/config/redis.ts`
- Create: `server/prisma/schema.prisma`

**Step 1: Create server/package.json and install dependencies**

```json
{
  "name": "@dnd-booker/server",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@dnd-booker/shared": "workspace:*",
    "@prisma/client": "^6.0.0",
    "bcrypt": "^5.1.0",
    "bullmq": "^5.0.0",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "ioredis": "^5.4.0",
    "jsonwebtoken": "^9.0.0",
    "multer": "^1.4.5-lts.1",
    "express-rate-limit": "^7.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.0",
    "@types/cookie-parser": "^1.4.0",
    "@types/cors": "^2.8.0",
    "@types/express": "^5.0.0",
    "@types/jsonwebtoken": "^9.0.0",
    "@types/multer": "^1.4.0",
    "prisma": "^6.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 2: Create Prisma schema**

`server/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String      @id @default(uuid())
  email        String      @unique
  passwordHash String      @map("password_hash")
  displayName  String      @map("display_name")
  avatarUrl    String?     @map("avatar_url")
  createdAt    DateTime    @default(now()) @map("created_at")
  updatedAt    DateTime    @updatedAt @map("updated_at")

  projects     Project[]
  exportJobs   ExportJob[]
  assets       Asset[]
  templates    Template[]

  @@map("users")
}

enum ProjectType {
  campaign
  one_shot
  supplement
  sourcebook
}

enum ProjectStatus {
  draft
  in_progress
  review
  published
}

model Project {
  id             String        @id @default(uuid())
  userId         String        @map("user_id")
  title          String
  description    String        @default("")
  type           ProjectType   @default(campaign)
  status         ProjectStatus @default(draft)
  coverImageUrl  String?       @map("cover_image_url")
  settings       Json          @default("{}")
  createdAt      DateTime      @default(now()) @map("created_at")
  updatedAt      DateTime      @updatedAt @map("updated_at")

  user           User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  documents      Document[]
  exportJobs     ExportJob[]

  @@map("projects")
}

model Document {
  id          String   @id @default(uuid())
  projectId   String   @map("project_id")
  title       String
  sortOrder   Int      @default(0) @map("sort_order")
  content     Json     @default("{}")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@map("documents")
}

model Template {
  id            String      @id @default(uuid())
  name          String
  description   String      @default("")
  type          ProjectType @default(campaign)
  content       Json        @default("{}")
  thumbnailUrl  String?     @map("thumbnail_url")
  isSystem      Boolean     @default(false) @map("is_system")
  userId        String?     @map("user_id")
  createdAt     DateTime    @default(now()) @map("created_at")

  user          User?       @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@map("templates")
}

enum ExportFormat {
  pdf
  epub
  print_pdf
}

enum ExportStatus {
  queued
  processing
  completed
  failed
}

model ExportJob {
  id            String       @id @default(uuid())
  projectId     String       @map("project_id")
  userId        String       @map("user_id")
  format        ExportFormat
  status        ExportStatus @default(queued)
  progress      Int          @default(0)
  outputUrl     String?      @map("output_url")
  errorMessage  String?      @map("error_message")
  createdAt     DateTime     @default(now()) @map("created_at")
  completedAt   DateTime?    @map("completed_at")

  project       Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user          User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("export_jobs")
}

model Asset {
  id          String   @id @default(uuid())
  userId      String   @map("user_id")
  projectId   String?  @map("project_id")
  filename    String
  mimeType    String   @map("mime_type")
  url         String
  sizeBytes   Int      @map("size_bytes")
  createdAt   DateTime @default(now()) @map("created_at")

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("assets")
}
```

**Step 3: Create database and Redis config**

`server/src/config/database.ts`:
```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

`server/src/config/redis.ts`:
```typescript
import IORedis from 'ioredis';

export const redis = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});
```

**Step 4: Create Express app entry point**

`server/src/index.ts`:
```typescript
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
```

**Step 5: Start Docker, run migration**

```bash
docker compose up -d
cp .env.example .env
cd server && npx prisma migrate dev --name init
```

**Step 6: Verify server starts**

```bash
cd server && npm run dev
# In another terminal:
curl http://localhost:4000/api/health
# Expected: {"status":"ok"}
```

**Step 7: Commit**

```bash
git add server/ docker-compose.yml .env.example .gitignore package.json
git commit -m "feat: set up Express server with Prisma schema and Docker Compose"
```

---

### Task 4: Implement JWT authentication

**Files:**
- Create: `server/src/middleware/auth.ts`
- Create: `server/src/routes/auth.ts`
- Create: `server/src/services/auth.service.ts`
- Test: `server/src/__tests__/auth.test.ts`

**Step 1: Write auth service tests**

`server/src/__tests__/auth.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import { prisma } from '../config/database';

describe('Auth API', () => {
  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@test.com', password: 'Password1!', displayName: 'Test User' });

      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe('test@test.com');
      expect(res.body.accessToken).toBeDefined();
    });

    it('should reject duplicate email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@test.com', password: 'Password1!', displayName: 'Test User' });

      expect(res.status).toBe(409);
    });

    it('should reject weak password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test2@test.com', password: '123', displayName: 'Test' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login and return tokens', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'Password1!' });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'wrong' });

      expect(res.status).toBe(401);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd server && npx vitest run src/__tests__/auth.test.ts
```
Expected: FAIL — routes not defined

**Step 3: Implement auth service**

`server/src/services/auth.service.ts`:
```typescript
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';

export function generateAccessToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '15m' });
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): { userId: string } {
  return jwt.verify(token, JWT_SECRET) as { userId: string };
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, JWT_REFRESH_SECRET) as { userId: string };
}

export async function registerUser(email: string, password: string, displayName: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error('EMAIL_EXISTS');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, displayName },
    select: { id: true, email: true, displayName: true, avatarUrl: true, createdAt: true, updatedAt: true },
  });

  return user;
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error('INVALID_CREDENTIALS');
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
```

**Step 4: Implement auth middleware**

`server/src/middleware/auth.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/auth.service';

export interface AuthRequest extends Request {
  userId?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
```

**Step 5: Implement auth routes**

`server/src/routes/auth.ts`:
```typescript
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  registerUser,
  loginUser,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../services/auth.service';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/),
  displayName: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }

  try {
    const user = await registerUser(parsed.data.email, parsed.data.password, parsed.data.displayName);
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({ user, accessToken });
  } catch (err: any) {
    if (err.message === 'EMAIL_EXISTS') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    return res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed' });
  }

  try {
    const user = await loginUser(parsed.data.email, parsed.data.password);
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ user, accessToken });
  } catch (err: any) {
    if (err.message === 'INVALID_CREDENTIALS') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    return res.status(401).json({ error: 'No refresh token' });
  }

  try {
    const payload = verifyRefreshToken(token);
    const accessToken = generateAccessToken(payload.userId);
    return res.json({ accessToken });
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('refreshToken');
  return res.json({ message: 'Logged out' });
});

export default router;
```

**Step 6: Wire routes into Express app — update `server/src/index.ts`**

Add after middleware setup:
```typescript
import authRoutes from './routes/auth';
app.use('/api/auth', authRoutes);
```

**Step 7: Run tests**

```bash
cd server && npx vitest run src/__tests__/auth.test.ts
```
Expected: PASS

**Step 8: Commit**

```bash
git add server/src/
git commit -m "feat: implement JWT auth with register, login, refresh, logout"
```

---

## Phase 3: Server — Projects & Documents CRUD

### Task 5: Implement Projects CRUD API

**Files:**
- Create: `server/src/routes/projects.ts`
- Create: `server/src/services/project.service.ts`
- Test: `server/src/__tests__/projects.test.ts`

**Step 1: Write failing tests for project CRUD**

Test file should cover:
- `POST /api/projects` — create project (requires auth)
- `GET /api/projects` — list user's projects
- `GET /api/projects/:id` — get single project (only own)
- `PUT /api/projects/:id` — update project
- `DELETE /api/projects/:id` — delete project

Each test should register a user, get a token, then test the endpoint.

**Step 2: Implement project service**

`server/src/services/project.service.ts`:
```typescript
import { prisma } from '../config/database';
import { DEFAULT_PROJECT_SETTINGS } from '@dnd-booker/shared';

export async function createProject(userId: string, data: {
  title: string;
  description?: string;
  type?: 'campaign' | 'one_shot' | 'supplement' | 'sourcebook';
}) {
  return prisma.project.create({
    data: {
      userId,
      title: data.title,
      description: data.description || '',
      type: data.type || 'campaign',
      settings: DEFAULT_PROJECT_SETTINGS,
    },
  });
}

export async function getUserProjects(userId: string) {
  return prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { documents: true } } },
  });
}

export async function getProject(id: string, userId: string) {
  return prisma.project.findFirst({
    where: { id, userId },
    include: {
      documents: { orderBy: { sortOrder: 'asc' } },
    },
  });
}

export async function updateProject(id: string, userId: string, data: {
  title?: string;
  description?: string;
  type?: 'campaign' | 'one_shot' | 'supplement' | 'sourcebook';
  status?: 'draft' | 'in_progress' | 'review' | 'published';
  settings?: Record<string, unknown>;
}) {
  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) return null;

  return prisma.project.update({ where: { id }, data });
}

export async function deleteProject(id: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) return null;

  return prisma.project.delete({ where: { id } });
}
```

**Step 3: Implement project routes**

`server/src/routes/projects.ts`:
```typescript
import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import * as projectService from '../services/project.service';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.enum(['campaign', 'one_shot', 'supplement', 'sourcebook']).optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  type: z.enum(['campaign', 'one_shot', 'supplement', 'sourcebook']).optional(),
  status: z.enum(['draft', 'in_progress', 'review', 'published']).optional(),
  settings: z.record(z.unknown()).optional(),
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });

  const project = await projectService.createProject(req.userId!, parsed.data);
  return res.status(201).json(project);
});

router.get('/', async (req: AuthRequest, res: Response) => {
  const projects = await projectService.getUserProjects(req.userId!);
  return res.json(projects);
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const project = await projectService.getProject(req.params.id, req.userId!);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  return res.json(project);
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed' });

  const project = await projectService.updateProject(req.params.id, req.userId!, parsed.data);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  return res.json(project);
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const project = await projectService.deleteProject(req.params.id, req.userId!);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  return res.status(204).send();
});

export default router;
```

**Step 4: Wire into Express app**

Add to `server/src/index.ts`:
```typescript
import projectRoutes from './routes/projects';
app.use('/api/projects', projectRoutes);
```

**Step 5: Run tests and verify**

```bash
cd server && npx vitest run
```

**Step 6: Commit**

```bash
git add server/src/
git commit -m "feat: implement projects CRUD API with auth"
```

---

### Task 6: Implement Documents CRUD API

**Files:**
- Create: `server/src/routes/documents.ts`
- Create: `server/src/services/document.service.ts`
- Test: `server/src/__tests__/documents.test.ts`

**Step 1: Write failing tests**

Cover: create document under project, list documents, update document content (TipTap JSON), reorder documents, delete document. Verify authorization (can't access other user's project documents).

**Step 2: Implement document service**

```typescript
import { prisma } from '../config/database';

export async function createDocument(projectId: string, userId: string, data: { title: string; content?: any }) {
  // Verify project belongs to user
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return null;

  const maxOrder = await prisma.document.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });

  return prisma.document.create({
    data: {
      projectId,
      title: data.title,
      content: data.content || { type: 'doc', content: [{ type: 'paragraph' }] },
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  });
}

export async function getProjectDocuments(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return null;

  return prisma.document.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function updateDocument(id: string, userId: string, data: { title?: string; content?: any }) {
  const doc = await prisma.document.findFirst({
    where: { id },
    include: { project: { select: { userId: true } } },
  });
  if (!doc || doc.project.userId !== userId) return null;

  return prisma.document.update({ where: { id }, data });
}

export async function reorderDocuments(projectId: string, userId: string, documentIds: string[]) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return null;

  const updates = documentIds.map((id, index) =>
    prisma.document.update({ where: { id }, data: { sortOrder: index } })
  );

  return prisma.$transaction(updates);
}

export async function deleteDocument(id: string, userId: string) {
  const doc = await prisma.document.findFirst({
    where: { id },
    include: { project: { select: { userId: true } } },
  });
  if (!doc || doc.project.userId !== userId) return null;

  return prisma.document.delete({ where: { id } });
}
```

**Step 3: Implement document routes, wire into app**

Routes nested under `/api/projects/:projectId/documents` for create/list, and `/api/documents/:id` for update/delete/reorder.

**Step 4: Run tests, commit**

```bash
git add server/src/
git commit -m "feat: implement documents CRUD with reordering"
```

---

### Task 7: Implement export job creation and template listing

**Files:**
- Create: `server/src/routes/exports.ts`
- Create: `server/src/routes/templates.ts`
- Create: `server/src/services/export.service.ts`
- Create: `server/src/services/template.service.ts`

**Step 1: Implement export service — creates job in DB and adds to BullMQ queue**

```typescript
import { Queue } from 'bullmq';
import { prisma } from '../config/database';
import { redis } from '../config/redis';

const exportQueue = new Queue('export', { connection: redis });

export async function createExportJob(projectId: string, userId: string, format: 'pdf' | 'epub' | 'print_pdf') {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return null;

  const job = await prisma.exportJob.create({
    data: { projectId, userId, format },
  });

  await exportQueue.add('generate', { exportJobId: job.id, format }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });

  return job;
}

export async function getExportJob(id: string, userId: string) {
  return prisma.exportJob.findFirst({ where: { id, userId } });
}
```

**Step 2: Implement template service — list system templates, get by ID**

**Step 3: Wire routes, run tests, commit**

```bash
git commit -m "feat: add export job creation with BullMQ queue and template listing"
```

---

## Phase 4: React Client — Shell & Auth

### Task 8: Scaffold React client with Vite

**Files:**
- Create: `client/` (via Vite scaffold)
- Modify: `client/package.json` (add dependencies)
- Create: `client/src/lib/api.ts`
- Create: `client/src/stores/authStore.ts`

**Step 1: Scaffold with Vite**

```bash
cd client && npm create vite@latest . -- --template react-ts
```

**Step 2: Install dependencies**

```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit zustand axios react-router-dom tailwindcss @tailwindcss/vite
```

**Step 3: Configure Tailwind**

Update `vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 3000, proxy: { '/api': 'http://localhost:4000' } },
});
```

Update `client/src/index.css`:
```css
@import 'tailwindcss';
```

**Step 4: Create API client**

`client/src/lib/api.ts`:
```typescript
import axios from 'axios';

const api = axios.create({ baseURL: '/api', withCredentials: true });

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      try {
        const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        setAccessToken(data.accessToken);
        error.config.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(error.config);
      } catch {
        setAccessToken(null);
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
```

**Step 5: Create auth store with Zustand**

`client/src/stores/authStore.ts`:
```typescript
import { create } from 'zustand';
import api, { setAccessToken } from '../lib/api';

interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setAccessToken(data.accessToken);
    set({ user: data.user });
  },

  register: async (email, password, displayName) => {
    const { data } = await api.post('/auth/register', { email, password, displayName });
    setAccessToken(data.accessToken);
    set({ user: data.user });
  },

  logout: async () => {
    await api.post('/auth/logout');
    setAccessToken(null);
    set({ user: null });
  },

  refresh: async () => {
    try {
      const { data } = await api.post('/auth/refresh');
      setAccessToken(data.accessToken);
      // Fetch user profile after refresh
      set({ user: data.user, isLoading: false });
    } catch {
      set({ user: null, isLoading: false });
    }
  },
}));
```

**Step 6: Commit**

```bash
git add client/
git commit -m "feat: scaffold React client with Vite, Tailwind, auth store"
```

---

### Task 9: Build login/register pages and routing

**Files:**
- Create: `client/src/pages/LoginPage.tsx`
- Create: `client/src/pages/RegisterPage.tsx`
- Create: `client/src/pages/DashboardPage.tsx`
- Create: `client/src/components/auth/ProtectedRoute.tsx`
- Modify: `client/src/App.tsx`

**Step 1: Implement pages with forms, connect to auth store**

**Step 2: Set up React Router with protected routes**

**Step 3: Verify login flow works end-to-end**

```bash
# Terminal 1: docker compose up -d
# Terminal 2: cd server && npm run dev
# Terminal 3: cd client && npm run dev
# Open http://localhost:3000, register, verify redirect to dashboard
```

**Step 4: Commit**

```bash
git commit -m "feat: add login/register pages with protected routing"
```

---

## Phase 5: Client — Project Management

### Task 10: Build project dashboard and create project flow

**Files:**
- Create: `client/src/stores/projectStore.ts`
- Create: `client/src/pages/DashboardPage.tsx` (update)
- Create: `client/src/components/projects/ProjectCard.tsx`
- Create: `client/src/components/projects/CreateProjectModal.tsx`

**Step 1: Create Zustand project store with CRUD operations**

**Step 2: Build dashboard with project cards grid**

**Step 3: Build create project modal with type selection**

**Step 4: Verify: create project, see it in dashboard, click to open**

**Step 5: Commit**

```bash
git commit -m "feat: add project dashboard with create/list/delete"
```

---

## Phase 6: Client — TipTap Editor Foundation

### Task 11: Set up TipTap editor with basic extensions

**Files:**
- Create: `client/src/components/editor/Editor.tsx`
- Create: `client/src/components/editor/Toolbar.tsx`
- Create: `client/src/components/editor/EditorLayout.tsx`
- Create: `client/src/components/sidebar/BlockPalette.tsx`
- Create: `client/src/pages/EditorPage.tsx`

**Step 1: Create base TipTap editor component**

```typescript
// client/src/components/editor/Editor.tsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

interface EditorProps {
  content: any;
  onUpdate: (content: any) => void;
}

export function Editor({ content, onUpdate }: EditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onUpdate(editor.getJSON());
    },
  });

  return (
    <div className="editor-container">
      <EditorContent editor={editor} />
    </div>
  );
}
```

**Step 2: Create editor layout (sidebar + editor + preview panel)**

Three-column layout:
- Left: Block palette sidebar (draggable blocks)
- Center: TipTap editor
- Right: Properties panel (edit selected block's attributes)

**Step 3: Create block palette with basic insert functionality**

Use `onMouseDown` + `preventDefault` pattern to prevent editor focus loss.

**Step 4: Wire to EditorPage with document loading/saving**

Load document content from API on mount, auto-save on debounced update.

**Step 5: Verify: open project → click document → editor loads content**

**Step 6: Commit**

```bash
git commit -m "feat: add TipTap editor with toolbar, block palette, and auto-save"
```

---

## Phase 7: D&D Block Nodes (Core Set)

### Task 12: Implement Stat Block custom node

**Files:**
- Create: `client/src/components/blocks/StatBlock/StatBlockExtension.ts`
- Create: `client/src/components/blocks/StatBlock/StatBlockView.tsx`
- Create: `client/src/styles/blocks/stat-block.css`

**Step 1: Define the TipTap node extension**

```typescript
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import StatBlockView from './StatBlockView';

export const StatBlock = Node.create({
  name: 'statBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      name: { default: 'Creature Name' },
      size: { default: 'Medium' },
      type: { default: 'humanoid' },
      alignment: { default: 'neutral' },
      ac: { default: 10 },
      acType: { default: '' },
      hp: { default: 10 },
      hitDice: { default: '2d8+2' },
      speed: { default: '30 ft.' },
      str: { default: 10 }, dex: { default: 10 }, con: { default: 10 },
      int: { default: 10 }, wis: { default: 10 }, cha: { default: 10 },
      skills: { default: '' },
      senses: { default: 'passive Perception 10' },
      languages: { default: 'Common' },
      cr: { default: '1' },
      traits: { default: [] },
      actions: { default: [] },
      reactions: { default: [] },
      legendaryActions: { default: [] },
    };
  },

  parseHTML() { return [{ tag: 'div[data-stat-block]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { 'data-stat-block': '', ...HTMLAttributes }]; },

  addNodeView() {
    return ReactNodeViewRenderer(StatBlockView);
  },
});
```

**Step 2: Build the React component for stat block editing**

The `StatBlockView` component renders a 5e-styled stat block with editable fields. Uses `updateAttributes` for all changes.

**Step 3: Style with authentic 5e stat block CSS**

Tan background, red dividers, proper typography.

**Step 4: Register extension and add to block palette**

**Step 5: Verify: insert stat block, edit fields, see styled output**

**Step 6: Commit**

```bash
git commit -m "feat: add stat block custom TipTap node with 5e styling"
```

---

### Task 13: Implement Read-Aloud Box, Sidebar Callout, and Chapter Header blocks

**Files:**
- Create: `client/src/components/blocks/ReadAloudBox/`
- Create: `client/src/components/blocks/SidebarCallout/`
- Create: `client/src/components/blocks/ChapterHeader/`

Follow the same pattern as Task 12 for each block:
1. Define TipTap node extension with attributes
2. Build React NodeView component
3. Style with D&D-appropriate CSS
4. Register in editor and add to palette

**Commit:**
```bash
git commit -m "feat: add read-aloud box, sidebar callout, and chapter header blocks"
```

---

### Task 14: Implement Spell Card, Magic Item, and Random Table blocks

**Files:**
- Create: `client/src/components/blocks/SpellCard/`
- Create: `client/src/components/blocks/MagicItem/`
- Create: `client/src/components/blocks/RandomTable/`

Same pattern. Each block has:
- Extension with typed attributes
- React NodeView with editable fields
- Themed CSS
- Palette entry

**Commit:**
```bash
git commit -m "feat: add spell card, magic item, and random table blocks"
```

---

### Task 15: Implement NPC Profile, Encounter Table, Class Feature, and Race blocks

**Files:**
- Create: `client/src/components/blocks/NpcProfile/`
- Create: `client/src/components/blocks/EncounterTable/`
- Create: `client/src/components/blocks/ClassFeature/`
- Create: `client/src/components/blocks/RaceBlock/`

**Commit:**
```bash
git commit -m "feat: add NPC profile, encounter table, class feature, and race blocks"
```

---

### Task 16: Implement layout blocks (images, maps, handouts, page breaks, borders)

**Files:**
- Create: `client/src/components/blocks/FullBleedImage/`
- Create: `client/src/components/blocks/MapBlock/`
- Create: `client/src/components/blocks/Handout/`
- Create: `client/src/components/blocks/PageBorder/`
- Create: `client/src/components/blocks/PageBreak/`
- Create: `client/src/components/blocks/ColumnBreak/`

**Commit:**
```bash
git commit -m "feat: add layout blocks (images, maps, handouts, page breaks, borders)"
```

---

### Task 17: Implement document structure blocks (title page, ToC, credits, back cover)

**Files:**
- Create: `client/src/components/blocks/TitlePage/`
- Create: `client/src/components/blocks/TableOfContents/`
- Create: `client/src/components/blocks/CreditsPage/`
- Create: `client/src/components/blocks/BackCover/`

The Table of Contents block auto-generates entries by scanning for ChapterHeader nodes in the document.

**Commit:**
```bash
git commit -m "feat: add document structure blocks (title page, ToC, credits, back cover)"
```

---

## Phase 8: Theme System

### Task 18: Implement D&D theme CSS and theme picker

**Files:**
- Create: `client/src/styles/themes/classic-parchment.css`
- Create: `client/src/styles/themes/dark-tome.css`
- Create: `client/src/styles/themes/clean-modern.css`
- Create: `client/src/styles/themes/fey-wild.css`
- Create: `client/src/styles/themes/infernal.css`
- Create: `client/src/components/editor/ThemePicker.tsx`
- Create: `client/src/stores/themeStore.ts`

**Step 1: Create CSS custom property-based themes**

Each theme defines CSS variables:
```css
/* classic-parchment.css */
[data-theme="classic-parchment"] {
  --page-bg: #f4e4c1;
  --text-color: #1a1a1a;
  --heading-font: 'Cinzel', serif;
  --body-font: 'Crimson Text', serif;
  --accent-color: #58180d;
  --accent-secondary: #c9ad6a;
  --stat-block-bg: #fdf1dc;
  --stat-block-border: #e69a28;
  --callout-bg: #e0d6c2;
  --read-aloud-bg: #ddd8c4;
  --read-aloud-border: #1a1a1a;
}
```

**Step 2: Build theme picker component in project settings**

**Step 3: Apply theme to editor preview area**

**Step 4: Commit**

```bash
git commit -m "feat: add D&D theme system with 5 built-in themes"
```

---

## Phase 9: PDF Worker

### Task 19: Set up PDF worker service with BullMQ

**Files:**
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/src/index.ts`
- Create: `worker/src/jobs/export.job.ts`
- Create: `worker/src/renderers/html-assembler.ts`
- Create: `worker/src/renderers/tiptap-to-html.ts`

**Step 1: Create worker package.json**

```json
{
  "name": "@dnd-booker/worker",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@dnd-booker/shared": "workspace:*",
    "@prisma/client": "^6.0.0",
    "bullmq": "^5.0.0",
    "ioredis": "^5.4.0",
    "puppeteer": "^24.0.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 2: Create TipTap JSON → HTML renderer**

`worker/src/renderers/tiptap-to-html.ts`:
Server-side renderer that converts TipTap document JSON into HTML string. Maps each node type (statBlock, readAloudBox, etc.) to its HTML representation with proper CSS classes.

**Step 3: Create HTML assembler**

`worker/src/renderers/html-assembler.ts`:
Combines all documents into a single HTML page with:
- Theme CSS
- Print stylesheet
- Page headers/footers
- ToC generation
- Font embedding

**Step 4: Create BullMQ worker**

`worker/src/index.ts`:
```typescript
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { processExportJob } from './jobs/export.job';

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});

const worker = new Worker('export', processExportJob, {
  connection,
  concurrency: 2,
});

worker.on('completed', (job) => console.log(`Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`Job ${job?.id} failed:`, err.message));

console.log('PDF Worker running...');
```

**Step 5: Commit**

```bash
git add worker/
git commit -m "feat: set up PDF worker service with BullMQ and TipTap-to-HTML renderer"
```

---

### Task 20: Implement PDF generation with Puppeteer

**Files:**
- Create: `worker/src/jobs/export.job.ts`
- Create: `worker/src/generators/pdf.generator.ts`
- Create: `worker/src/generators/print-pdf.generator.ts`

**Step 1: Implement PDF generator**

```typescript
import puppeteer from 'puppeteer';

export async function generatePdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');

    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '1in', right: '1in', bottom: '1in', left: '1in' },
      displayHeaderFooter: true,
      footerTemplate: '<div style="font-size:9px;width:100%;text-align:center;"><span class="pageNumber"></span></div>',
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
```

**Step 2: Implement print-ready PDF generator**

Same as PDF but with:
- 0.125" bleed margins
- Crop marks (added via CSS)
- Higher quality settings

**Step 3: Implement export job processor**

```typescript
import { Job } from 'bullmq';
import { prisma } from '../config/database';
import { assembleHtml } from '../renderers/html-assembler';
import { generatePdf } from '../generators/pdf.generator';
import { generatePrintPdf } from '../generators/print-pdf.generator';
import fs from 'fs/promises';
import path from 'path';

export async function processExportJob(job: Job) {
  const { exportJobId, format } = job.data;

  await prisma.exportJob.update({
    where: { id: exportJobId },
    data: { status: 'processing' },
  });

  try {
    const exportJob = await prisma.exportJob.findUnique({
      where: { id: exportJobId },
      include: {
        project: { include: { documents: { orderBy: { sortOrder: 'asc' } } } },
      },
    });

    if (!exportJob) throw new Error('Export job not found');

    await job.updateProgress(20);
    const html = await assembleHtml(exportJob.project);

    await job.updateProgress(50);

    let buffer: Buffer;
    if (format === 'print_pdf') {
      buffer = await generatePrintPdf(html);
    } else {
      buffer = await generatePdf(html);
    }

    await job.updateProgress(80);

    // Save to local storage (replace with S3 in production)
    const outputDir = path.join(process.cwd(), 'output');
    await fs.mkdir(outputDir, { recursive: true });
    const filename = `${exportJob.projectId}-${Date.now()}.pdf`;
    const filepath = path.join(outputDir, filename);
    await fs.writeFile(filepath, buffer);

    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: {
        status: 'completed',
        progress: 100,
        outputUrl: `/output/${filename}`,
        completedAt: new Date(),
      },
    });

    await job.updateProgress(100);
  } catch (error: any) {
    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: { status: 'failed', errorMessage: error.message },
    });
    throw error;
  }
}
```

**Step 4: Test end-to-end: create project → add document → export → download PDF**

**Step 5: Commit**

```bash
git commit -m "feat: implement PDF and print-ready PDF generation with Puppeteer"
```

---

### Task 21: Implement ePub generation with Pandoc

**Files:**
- Create: `worker/src/generators/epub.generator.ts`

**Step 1: Implement ePub generator using Pandoc CLI**

Shell out to Pandoc: `pandoc input.html -o output.epub --css=theme.css --metadata title="..."`.
Write temporary HTML to disk, invoke Pandoc, read result.

**Step 2: Wire into export job processor (add epub case)**

**Step 3: Test ePub generation end-to-end**

**Step 4: Commit**

```bash
git commit -m "feat: add ePub generation via Pandoc"
```

---

## Phase 10: Client — Export UI & Asset Upload

### Task 22: Build export dialog and progress tracking

**Files:**
- Create: `client/src/components/editor/ExportDialog.tsx`
- Create: `client/src/stores/exportStore.ts`

**Step 1: Create Zustand export store that polls job status**

**Step 2: Build export dialog with format selection and progress bar**

**Step 3: Add download button when export completes**

**Step 4: Commit**

```bash
git commit -m "feat: add export dialog with format selection and progress tracking"
```

---

### Task 23: Build image upload and asset management

**Files:**
- Create: `server/src/routes/assets.ts`
- Create: `server/src/services/asset.service.ts`
- Create: `client/src/components/editor/ImageUploader.tsx`

**Step 1: Server route for multipart upload (multer)**

**Step 2: Client image uploader component for use in blocks (maps, images, portraits)**

**Step 3: Wire image blocks to use uploaded assets**

**Step 4: Commit**

```bash
git commit -m "feat: add image upload and asset management"
```

---

## Phase 11: Template System

### Task 24: Seed system templates and build template gallery

**Files:**
- Create: `server/prisma/seed.ts`
- Create: `client/src/components/templates/TemplateGallery.tsx`
- Create: `client/src/components/templates/TemplateCard.tsx`

**Step 1: Create seed data with starter templates**

Templates for: blank campaign, blank one-shot, blank supplement, blank sourcebook. Each pre-populated with appropriate document structure blocks (title page, ToC, chapter headers, credits).

**Step 2: Build template gallery UI shown during project creation**

**Step 3: Implement "create project from template" flow**

**Step 4: Commit**

```bash
git commit -m "feat: add system templates and template gallery"
```

---

## Phase 12: Polish & Integration

### Task 25: Add document list sidebar with reordering

**Files:**
- Modify: `client/src/components/editor/EditorLayout.tsx`
- Create: `client/src/components/editor/DocumentList.tsx`

Drag-and-drop document reordering in the project sidebar. Click to switch between documents.

**Commit:**
```bash
git commit -m "feat: add document list sidebar with drag-and-drop reordering"
```

---

### Task 26: Add live preview panel

**Files:**
- Create: `client/src/components/preview/PreviewPanel.tsx`
- Create: `client/src/components/preview/PreviewRenderer.tsx`

Side panel that renders TipTap content with the selected theme CSS applied, showing an approximation of the final PDF output.

**Commit:**
```bash
git commit -m "feat: add live preview panel with theme rendering"
```

---

### Task 27: Docker Compose for full stack development

**Files:**
- Modify: `docker-compose.yml` (add all services)
- Create: `client/Dockerfile`
- Create: `server/Dockerfile`
- Create: `worker/Dockerfile`

**Commit:**
```bash
git commit -m "feat: add Dockerfiles and full-stack docker-compose"
```

---

### Task 28: End-to-end smoke test

**Manual verification checklist:**

1. `docker compose up` starts all services
2. Register a new user
3. Create a new campaign project from template
4. Open the editor, insert a stat block and a read-aloud box
5. Edit stat block fields
6. Switch theme to Dark Tome, verify preview updates
7. Add a second document, reorder documents
8. Export as PDF — verify download works
9. Export as ePub — verify download works
10. Logout, login again, verify project persists

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-2 | Infrastructure, shared types |
| 2 | 3-4 | Server: DB, auth |
| 3 | 5-7 | Server: projects, documents, exports API |
| 4 | 8-9 | Client: scaffold, auth UI |
| 5 | 10 | Client: project dashboard |
| 6 | 11 | Client: TipTap editor foundation |
| 7 | 12-17 | D&D block nodes (all categories) |
| 8 | 18 | Theme system |
| 9 | 19-21 | PDF worker (PDF, print PDF, ePub) |
| 10 | 22-23 | Export UI, asset upload |
| 11 | 24 | Template system |
| 12 | 25-28 | Polish, preview, Docker, E2E |
