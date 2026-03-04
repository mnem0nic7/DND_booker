# AI Agent CRUD Tools — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate all AI control blocks to Vercel AI SDK tool() definitions, add project CRUD tools with optimistic concurrency, content indexing pipeline, and per-tool audit logging.

**Architecture:** Tool Registry pattern — individual tool modules registered in a central registry that composes them into Vercel AI SDK `tool()` definitions for `streamText()`. Tools execute server-side with audit wrapping. Client parses UI Message Stream events for text + tool status.

**Tech Stack:** Vercel AI SDK v6 (`ai`, `tool()`, `streamText`, `stepCountIs`, `pipeUIMessageStreamToResponse`), Zod, Prisma, BullMQ, Express

**Design doc:** `docs/plans/2026-03-04-ai-crud-tools-design.md`

---

## Phase 1: Tool Registry + Prisma Migration + CRUD Tools

### Task 1: Prisma Migration — AiToolAudit + ContentChunk models

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: migration via `prisma migrate dev`

**Step 1: Add AiToolAudit and ContentChunk models to schema**

Add to `server/prisma/schema.prisma` after the existing AiMemoryItem model (~line 227):

```prisma
model AiToolAudit {
  id              String    @id @default(uuid())
  requestId       String    @map("request_id")
  userId          String    @map("user_id")
  projectId       String?   @map("project_id")
  toolName        String    @map("tool_name")
  inputHash       String    @map("input_hash")
  resultStatus    String    @map("result_status")
  oldContentHash  String?   @map("old_content_hash")
  newContentHash  String?   @map("new_content_hash")
  oldUpdatedAt    DateTime? @map("old_updated_at")
  newUpdatedAt    DateTime? @map("new_updated_at")
  latencyMs       Int       @map("latency_ms")
  createdAt       DateTime  @default(now()) @map("created_at")

  @@index([userId])
  @@index([projectId])
  @@index([toolName])
  @@index([createdAt])
  @@map("ai_tool_audits")
}

model ContentChunk {
  id          String   @id @default(uuid())
  projectId   String   @map("project_id")
  chunkId     String   @map("chunk_id")
  blockType   String   @map("block_type")
  headingPath String   @map("heading_path")
  text        String
  attrs       Json     @default("{}")
  nodeIndex   Int      @map("node_index")
  updatedAt   DateTime @updatedAt @map("updated_at")

  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, chunkId])
  @@index([projectId])
  @@map("content_chunks")
}
```

Also add `contentChunks ContentChunk[]` to the Project model's relations (after `taskPlans` relation, ~line 75).

**Step 2: Generate and apply migration**

Run:
```bash
cd server && npx prisma migrate dev --name add-ai-tool-audit-and-content-chunks --schema=prisma/schema.prisma
```

Expected: Migration succeeds, new tables created.

**Step 3: Verify Prisma client generation**

Run:
```bash
cd server && npx prisma generate --schema=prisma/schema.prisma
```

**Step 4: Type check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors.

**Step 5: Commit**

```bash
git add server/prisma/
git commit -m "feat: add AiToolAudit and ContentChunk Prisma models"
```

---

### Task 2: Shared Types — Tool interfaces

**Files:**
- Create: `shared/src/types/ai-tools.ts`
- Modify: `shared/src/types/index.ts` (add re-export)

**Step 1: Create tool type definitions**

Create `shared/src/types/ai-tools.ts`:

```typescript
/** Context passed to every tool execution. */
export interface ToolContext {
  userId: string;
  projectId: string;
  requestId: string;
}

/** Standardized result from every tool execution. */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_ERROR';
    message: string;
  };
}

/** Where a tool is available. */
export type ToolScope = 'project-chat' | 'global';

/** Audit entry written per tool call. */
export interface ToolAuditEntry {
  requestId: string;
  userId: string;
  projectId: string | null;
  toolName: string;
  inputHash: string;
  resultStatus: string;
  oldContentHash?: string;
  newContentHash?: string;
  oldUpdatedAt?: string;
  newUpdatedAt?: string;
  latencyMs: number;
}

/** Events the client receives from the UI Message Stream. */
export type ToolCallStatus = 'running' | 'complete' | 'error';

export interface ActiveToolCall {
  toolCallId: string;
  toolName: string;
  status: ToolCallStatus;
  result?: unknown;
  error?: string;
}
```

**Step 2: Add re-export to shared/src/types/index.ts**

Check if `shared/src/types/index.ts` exists. If so, add:
```typescript
export * from './ai-tools.js';
```

If it doesn't exist, check how shared types are currently exported (they may be imported directly by path). In that case skip this step — consumers will import from `@dnd-booker/shared/types/ai-tools`.

**Step 3: Type check**

Run: `npm run typecheck --workspace=shared`
Expected: No errors.

**Step 4: Commit**

```bash
git add shared/src/types/ai-tools.ts
git commit -m "feat: add shared AI tool type definitions"
```

---

### Task 3: Tool Registry — Core infrastructure

**Files:**
- Create: `server/src/services/ai-tools/types.ts`
- Create: `server/src/services/ai-tools/registry.ts`
- Create: `server/src/services/ai-tools/index.ts`

**Step 1: Write the test**

Create `server/src/__tests__/ai-tools/registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../services/ai-tools/registry.js';
import { z } from 'zod';

describe('ToolRegistry', () => {
  it('should register and retrieve tools', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'testTool',
      description: 'A test tool',
      parameters: z.object({ input: z.string() }),
      contexts: ['project-chat'],
      execute: async () => ({ success: true, data: 'ok' }),
    });

    const tools = registry.getToolsForContext('project-chat', {
      userId: 'u1', projectId: 'p1', requestId: 'r1',
    });

    expect(tools).toHaveProperty('testTool');
  });

  it('should filter tools by context', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'chatOnly',
      description: 'Chat only',
      parameters: z.object({}),
      contexts: ['project-chat'],
      execute: async () => ({ success: true }),
    });
    registry.register({
      name: 'globalOnly',
      description: 'Global only',
      parameters: z.object({}),
      contexts: ['global'],
      execute: async () => ({ success: true }),
    });

    const chatTools = registry.getToolsForContext('project-chat', {
      userId: 'u1', projectId: 'p1', requestId: 'r1',
    });
    const globalTools = registry.getToolsForContext('global', {
      userId: 'u1', projectId: 'p1', requestId: 'r1',
    });

    expect(chatTools).toHaveProperty('chatOnly');
    expect(chatTools).not.toHaveProperty('globalOnly');
    expect(globalTools).toHaveProperty('globalOnly');
    expect(globalTools).not.toHaveProperty('chatOnly');
  });

  it('should execute tool and return result', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'echo',
      description: 'Echo input',
      parameters: z.object({ msg: z.string() }),
      contexts: ['project-chat'],
      execute: async (params) => ({
        success: true,
        data: (params as { msg: string }).msg,
      }),
    });

    const result = await registry.execute('echo', { msg: 'hello' }, {
      userId: 'u1', projectId: 'p1', requestId: 'r1',
    });

    expect(result).toEqual({ success: true, data: 'hello' });
  });

  it('should return error for unknown tool', async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute('missing', {}, {
      userId: 'u1', projectId: 'p1', requestId: 'r1',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/ai-tools/registry.test.ts`
Expected: FAIL — module not found.

**Step 3: Create types file**

Create `server/src/services/ai-tools/types.ts`:

```typescript
import type { z } from 'zod';
import type { ToolContext, ToolResult, ToolScope } from '@dnd-booker/shared';

export type { ToolContext, ToolResult, ToolScope };

/** A tool definition that the registry manages. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  contexts: ToolScope[];
  execute: (params: unknown, ctx: ToolContext) => Promise<ToolResult>;
}
```

**Step 4: Create registry**

Create `server/src/services/ai-tools/registry.ts`:

```typescript
import { tool } from 'ai';
import type { CoreTool } from 'ai';
import { createHash } from 'crypto';
import type { ToolContext, ToolResult, ToolDefinition } from './types.js';
import { prisma } from '../../config/database.js';

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(def: ToolDefinition): void {
    this.tools.set(def.name, def);
  }

  /** Build Vercel AI SDK tool() map for streamText(). */
  getToolsForContext(
    context: string,
    ctx: ToolContext,
  ): Record<string, CoreTool> {
    const result: Record<string, CoreTool> = {};

    for (const [name, def] of this.tools) {
      if (!def.contexts.includes(context as ToolDefinition['contexts'][number])) continue;

      result[name] = tool({
        description: def.description,
        parameters: def.parameters,
        execute: async (params) => {
          const toolResult = await this.executeWithAudit(name, params, ctx);
          return toolResult;
        },
      });
    }

    return result;
  }

  /** Execute a tool with audit logging. */
  async executeWithAudit(
    toolName: string,
    params: unknown,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const start = Date.now();
    const inputHash = createHash('sha256')
      .update(JSON.stringify(params))
      .digest('hex')
      .slice(0, 16);

    let result: ToolResult;
    try {
      result = await this.execute(toolName, params, ctx);
    } catch (err) {
      result = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
        },
      };
    }

    const latencyMs = Date.now() - start;

    // Fire-and-forget audit write (don't block tool response)
    prisma.aiToolAudit.create({
      data: {
        requestId: ctx.requestId,
        userId: ctx.userId,
        projectId: ctx.projectId || null,
        toolName,
        inputHash,
        resultStatus: result.success ? 'success' : (result.error?.code ?? 'error'),
        latencyMs,
      },
    }).catch((err) => console.error('[ToolAudit] Failed to write:', err));

    return result;
  }

  /** Execute a tool by name. */
  async execute(
    toolName: string,
    params: unknown,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const def = this.tools.get(toolName);
    if (!def) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `Unknown tool: ${toolName}` },
      };
    }

    return def.execute(params, ctx);
  }
}
```

**Step 5: Create index re-export**

Create `server/src/services/ai-tools/index.ts`:

```typescript
export { ToolRegistry } from './registry.js';
export type { ToolDefinition, ToolContext, ToolResult, ToolScope } from './types.js';
```

**Step 6: Run tests**

Run: `cd server && npx vitest run src/__tests__/ai-tools/registry.test.ts`
Expected: All 4 tests pass.

**Step 7: Type check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors.

**Step 8: Commit**

```bash
git add server/src/services/ai-tools/ server/src/__tests__/ai-tools/
git commit -m "feat: add ToolRegistry with audit logging"
```

---

### Task 4: CRUD Tools — Read operations (listProjects, getProject, getProjectContent)

**Files:**
- Create: `server/src/services/ai-tools/crud/list-projects.ts`
- Create: `server/src/services/ai-tools/crud/get-project.ts`
- Create: `server/src/services/ai-tools/crud/get-project-content.ts`
- Test: `server/src/__tests__/ai-tools/crud-read.test.ts`

**Step 1: Write failing test**

Create `server/src/__tests__/ai-tools/crud-read.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import { listProjectsTool } from '../../services/ai-tools/crud/list-projects.js';
import { getProjectTool } from '../../services/ai-tools/crud/get-project.js';
import { getProjectContentTool } from '../../services/ai-tools/crud/get-project-content.js';
import type { ToolContext } from '../../services/ai-tools/types.js';

let userId: string;
let projectId: string;
let ctx: ToolContext;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: 'crud-read-test@test.com', passwordHash: 'x', displayName: 'Test' },
  });
  userId = user.id;

  const project = await prisma.project.create({
    data: {
      userId,
      title: 'Test Project',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] },
    },
  });
  projectId = project.id;
  ctx = { userId, projectId, requestId: 'test-req-1' };
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
});

describe('listProjects tool', () => {
  it('should list user projects', async () => {
    const result = await listProjectsTool.execute({}, ctx);
    expect(result.success).toBe(true);
    const projects = result.data as Array<{ id: string; title: string }>;
    expect(projects.length).toBeGreaterThanOrEqual(1);
    expect(projects.some(p => p.id === projectId)).toBe(true);
  });

  it('should not list other users projects', async () => {
    const otherUser = await prisma.user.create({
      data: { email: 'other-crud@test.com', passwordHash: 'x', displayName: 'Other' },
    });
    await prisma.project.create({
      data: { userId: otherUser.id, title: 'Other Project' },
    });

    const result = await listProjectsTool.execute({}, ctx);
    const projects = result.data as Array<{ id: string; title: string }>;
    expect(projects.every(p => p.title !== 'Other Project')).toBe(true);

    await prisma.project.deleteMany({ where: { userId: otherUser.id } });
    await prisma.user.delete({ where: { id: otherUser.id } });
  });
});

describe('getProject tool', () => {
  it('should return project metadata', async () => {
    const result = await getProjectTool.execute({ projectId }, ctx);
    expect(result.success).toBe(true);
    const data = result.data as { id: string; title: string; updatedAt: string };
    expect(data.id).toBe(projectId);
    expect(data.title).toBe('Test Project');
    expect(data.updatedAt).toBeDefined();
  });

  it('should return NOT_FOUND for wrong project', async () => {
    const result = await getProjectTool.execute(
      { projectId: '00000000-0000-0000-0000-000000000000' },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });
});

describe('getProjectContent tool', () => {
  it('should return project content', async () => {
    const result = await getProjectContentTool.execute({ projectId }, ctx);
    expect(result.success).toBe(true);
    const data = result.data as { content: unknown };
    expect(data.content).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/ai-tools/crud-read.test.ts`
Expected: FAIL — modules not found.

**Step 3: Implement list-projects tool**

Create `server/src/services/ai-tools/crud/list-projects.ts`:

```typescript
import { z } from 'zod';
import { prisma } from '../../../config/database.js';
import type { ToolDefinition } from '../types.js';

export const listProjectsTool: ToolDefinition = {
  name: 'listProjects',
  description: 'List all projects owned by the current user. Returns id, title, type, status, and updatedAt for each project.',
  parameters: z.object({}),
  contexts: ['project-chat', 'global'],
  execute: async (_params, ctx) => {
    const projects = await prisma.project.findMany({
      where: { userId: ctx.userId },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      success: true,
      data: projects.map(p => ({
        ...p,
        updatedAt: p.updatedAt.toISOString(),
      })),
    };
  },
};
```

**Step 4: Implement get-project tool**

Create `server/src/services/ai-tools/crud/get-project.ts`:

```typescript
import { z } from 'zod';
import { prisma } from '../../../config/database.js';
import type { ToolDefinition } from '../types.js';

export const getProjectTool: ToolDefinition = {
  name: 'getProject',
  description: 'Get full metadata for a specific project by ID. Returns title, description, type, status, settings, and updatedAt. Does NOT return content — use getProjectContent for that.',
  parameters: z.object({
    projectId: z.string().uuid().describe('The project ID to fetch'),
  }),
  contexts: ['project-chat', 'global'],
  execute: async (params, ctx) => {
    const { projectId } = params as { projectId: string };

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: ctx.userId },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        status: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!project) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } };
    }

    return {
      success: true,
      data: {
        ...project,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      },
    };
  },
};
```

**Step 5: Implement get-project-content tool**

Create `server/src/services/ai-tools/crud/get-project-content.ts`:

```typescript
import { z } from 'zod';
import { prisma } from '../../../config/database.js';
import { buildDocumentOutline, buildDocumentTextSample } from '../../ai-content.service.js';
import type { ToolDefinition } from '../types.js';

export const getProjectContentTool: ToolDefinition = {
  name: 'getProjectContent',
  description: 'Get the document content for a project. Returns both the structured outline and a text sample for analysis.',
  parameters: z.object({
    projectId: z.string().uuid().describe('The project ID to fetch content for'),
  }),
  contexts: ['project-chat', 'global'],
  execute: async (params, ctx) => {
    const { projectId } = params as { projectId: string };

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: ctx.userId },
      select: { id: true, content: true, updatedAt: true },
    });

    if (!project) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } };
    }

    const outline = buildDocumentOutline(project.content);
    const textSample = buildDocumentTextSample(project.content);

    return {
      success: true,
      data: {
        projectId: project.id,
        updatedAt: project.updatedAt.toISOString(),
        outline,
        textSample,
        content: project.content,
      },
    };
  },
};
```

**Step 6: Run tests**

Run: `cd server && npx vitest run src/__tests__/ai-tools/crud-read.test.ts`
Expected: All tests pass.

**Step 7: Commit**

```bash
git add server/src/services/ai-tools/crud/ server/src/__tests__/ai-tools/
git commit -m "feat: add read CRUD tools (listProjects, getProject, getProjectContent)"
```

---

### Task 5: CRUD Tools — Write operations (createProject, updateProject, deleteProject, updateProjectContent)

**Files:**
- Create: `server/src/services/ai-tools/crud/create-project.ts`
- Create: `server/src/services/ai-tools/crud/update-project.ts`
- Create: `server/src/services/ai-tools/crud/delete-project.ts`
- Create: `server/src/services/ai-tools/crud/update-project-content.ts`
- Create: `server/src/services/ai-tools/crud/version-check.ts` (shared helper)
- Test: `server/src/__tests__/ai-tools/crud-write.test.ts`

**Step 1: Write failing test**

Create `server/src/__tests__/ai-tools/crud-write.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import { createProjectTool } from '../../services/ai-tools/crud/create-project.js';
import { updateProjectTool } from '../../services/ai-tools/crud/update-project.js';
import { deleteProjectTool } from '../../services/ai-tools/crud/delete-project.js';
import { updateProjectContentTool } from '../../services/ai-tools/crud/update-project-content.js';
import type { ToolContext } from '../../services/ai-tools/types.js';

let userId: string;
let ctx: ToolContext;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: 'crud-write-test@test.com', passwordHash: 'x', displayName: 'CrudWriter' },
  });
  userId = user.id;
  ctx = { userId, projectId: '', requestId: 'test-write-1' };
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
});

describe('createProject tool', () => {
  it('should create a new project', async () => {
    const result = await createProjectTool.execute(
      { title: 'New AI Project', type: 'one_shot' },
      ctx,
    );
    expect(result.success).toBe(true);
    const data = result.data as { id: string; title: string };
    expect(data.title).toBe('New AI Project');
    expect(data.id).toBeDefined();
  });
});

describe('updateProject tool', () => {
  it('should update project metadata with valid expectedUpdatedAt', async () => {
    const project = await prisma.project.create({
      data: { userId, title: 'Update Me' },
    });

    const result = await updateProjectTool.execute(
      {
        projectId: project.id,
        expectedUpdatedAt: project.updatedAt.toISOString(),
        patch: { title: 'Updated Title' },
      },
      ctx,
    );

    expect(result.success).toBe(true);
    const updated = await prisma.project.findUnique({ where: { id: project.id } });
    expect(updated?.title).toBe('Updated Title');
  });

  it('should reject stale expectedUpdatedAt with CONFLICT', async () => {
    const project = await prisma.project.create({
      data: { userId, title: 'Stale Test' },
    });

    // Simulate stale timestamp
    const result = await updateProjectTool.execute(
      {
        projectId: project.id,
        expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
        patch: { title: 'Should Fail' },
      },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('CONFLICT');
  });
});

describe('updateProjectContent tool', () => {
  it('should update content with valid version', async () => {
    const project = await prisma.project.create({
      data: { userId, title: 'Content Test', content: { type: 'doc', content: [] } },
    });

    const newContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated' }] }],
    };

    const result = await updateProjectContentTool.execute(
      {
        projectId: project.id,
        expectedUpdatedAt: project.updatedAt.toISOString(),
        content: newContent,
      },
      ctx,
    );

    expect(result.success).toBe(true);
  });
});

describe('deleteProject tool', () => {
  it('should delete project with valid version', async () => {
    const project = await prisma.project.create({
      data: { userId, title: 'Delete Me' },
    });

    const result = await deleteProjectTool.execute(
      {
        projectId: project.id,
        expectedUpdatedAt: project.updatedAt.toISOString(),
      },
      ctx,
    );

    expect(result.success).toBe(true);
    const found = await prisma.project.findUnique({ where: { id: project.id } });
    expect(found).toBeNull();
  });

  it('should reject stale delete', async () => {
    const project = await prisma.project.create({
      data: { userId, title: 'Stale Delete' },
    });

    const result = await deleteProjectTool.execute(
      {
        projectId: project.id,
        expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
      },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('CONFLICT');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/ai-tools/crud-write.test.ts`
Expected: FAIL — modules not found.

**Step 3: Create version-check helper**

Create `server/src/services/ai-tools/crud/version-check.ts`:

```typescript
import { prisma } from '../../../config/database.js';
import type { ToolResult } from '../types.js';

/**
 * Fetch a project with ownership check and version comparison.
 * Returns the project if valid, or a ToolResult error.
 */
export async function checkProjectVersion(
  projectId: string,
  userId: string,
  expectedUpdatedAt: string,
): Promise<{ project: NonNullable<Awaited<ReturnType<typeof prisma.project.findFirst>>> } | ToolResult> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });

  if (!project) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } };
  }

  if (project.updatedAt.toISOString() !== expectedUpdatedAt) {
    return {
      success: false,
      error: {
        code: 'CONFLICT',
        message: `Project was modified. Expected ${expectedUpdatedAt}, actual ${project.updatedAt.toISOString()}`,
      },
    };
  }

  return { project };
}

/** Type guard: is this a ToolResult error? */
export function isToolError(result: unknown): result is ToolResult {
  return typeof result === 'object' && result !== null && 'success' in result;
}
```

**Step 4: Implement create-project tool**

Create `server/src/services/ai-tools/crud/create-project.ts`:

```typescript
import { z } from 'zod';
import { prisma } from '../../../config/database.js';
import type { ToolDefinition } from '../types.js';

export const createProjectTool: ToolDefinition = {
  name: 'createProject',
  description: 'Create a new project for the current user. Returns the new project ID and metadata.',
  parameters: z.object({
    title: z.string().min(1).max(200).describe('Project title'),
    description: z.string().max(1000).optional().describe('Project description'),
    type: z.enum(['campaign', 'one_shot', 'supplement', 'sourcebook']).optional()
      .describe('Project type (defaults to campaign)'),
    templateId: z.string().uuid().optional().describe('Template ID to copy content from'),
  }),
  contexts: ['project-chat', 'global'],
  execute: async (params, ctx) => {
    const { title, description, type, templateId } = params as {
      title: string;
      description?: string;
      type?: string;
      templateId?: string;
    };

    let content: unknown = { type: 'doc', content: [] };

    if (templateId) {
      const template = await prisma.template.findUnique({ where: { id: templateId } });
      if (template?.content) {
        content = template.content;
      }
    }

    const project = await prisma.project.create({
      data: {
        userId: ctx.userId,
        title,
        description: description || '',
        type: (type as 'campaign' | 'one_shot' | 'supplement' | 'sourcebook') || 'campaign',
        content: content as any,
      },
    });

    return {
      success: true,
      data: {
        id: project.id,
        title: project.title,
        type: project.type,
        updatedAt: project.updatedAt.toISOString(),
      },
    };
  },
};
```

**Step 5: Implement update-project tool**

Create `server/src/services/ai-tools/crud/update-project.ts`:

```typescript
import { z } from 'zod';
import { prisma } from '../../../config/database.js';
import { checkProjectVersion, isToolError } from './version-check.js';
import type { ToolDefinition } from '../types.js';

export const updateProjectTool: ToolDefinition = {
  name: 'updateProject',
  description: 'Update project metadata (title, description, type, status). Requires expectedUpdatedAt for concurrency safety.',
  parameters: z.object({
    projectId: z.string().uuid().describe('The project to update'),
    expectedUpdatedAt: z.string().datetime().describe('The updatedAt timestamp from your last read of this project'),
    patch: z.object({
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(1000).optional(),
      type: z.enum(['campaign', 'one_shot', 'supplement', 'sourcebook']).optional(),
      status: z.enum(['draft', 'in_progress', 'review', 'published']).optional(),
    }).describe('Fields to update'),
  }),
  contexts: ['project-chat', 'global'],
  execute: async (params, ctx) => {
    const { projectId, expectedUpdatedAt, patch } = params as {
      projectId: string;
      expectedUpdatedAt: string;
      patch: Record<string, unknown>;
    };

    const check = await checkProjectVersion(projectId, ctx.userId, expectedUpdatedAt);
    if (isToolError(check)) return check;

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: patch as any,
    });

    return {
      success: true,
      data: {
        id: updated.id,
        title: updated.title,
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  },
};
```

**Step 6: Implement delete-project tool**

Create `server/src/services/ai-tools/crud/delete-project.ts`:

```typescript
import { z } from 'zod';
import { prisma } from '../../../config/database.js';
import { checkProjectVersion, isToolError } from './version-check.js';
import type { ToolDefinition } from '../types.js';

export const deleteProjectTool: ToolDefinition = {
  name: 'deleteProject',
  description: 'Delete a project permanently. Requires expectedUpdatedAt for concurrency safety. This cannot be undone.',
  parameters: z.object({
    projectId: z.string().uuid().describe('The project to delete'),
    expectedUpdatedAt: z.string().datetime().describe('The updatedAt timestamp from your last read'),
  }),
  contexts: ['project-chat', 'global'],
  execute: async (params, ctx) => {
    const { projectId, expectedUpdatedAt } = params as {
      projectId: string;
      expectedUpdatedAt: string;
    };

    const check = await checkProjectVersion(projectId, ctx.userId, expectedUpdatedAt);
    if (isToolError(check)) return check;

    await prisma.project.delete({ where: { id: projectId } });

    return { success: true, data: { deleted: projectId } };
  },
};
```

**Step 7: Implement update-project-content tool**

Create `server/src/services/ai-tools/crud/update-project-content.ts`:

```typescript
import { z } from 'zod';
import { prisma } from '../../../config/database.js';
import { checkProjectVersion, isToolError } from './version-check.js';
import type { ToolDefinition } from '../types.js';

const MAX_CONTENT_SIZE = 5 * 1024 * 1024; // 5MB

export const updateProjectContentTool: ToolDefinition = {
  name: 'updateProjectContent',
  description: 'Replace the entire document content for a project. Content must be valid TipTap JSON. Requires expectedUpdatedAt.',
  parameters: z.object({
    projectId: z.string().uuid().describe('The project to update'),
    expectedUpdatedAt: z.string().datetime().describe('The updatedAt timestamp from your last read'),
    content: z.unknown().describe('The new TipTap JSON document content'),
  }),
  contexts: ['project-chat'],
  execute: async (params, ctx) => {
    const { projectId, expectedUpdatedAt, content } = params as {
      projectId: string;
      expectedUpdatedAt: string;
      content: unknown;
    };

    // Size check
    const contentStr = JSON.stringify(content);
    if (contentStr.length > MAX_CONTENT_SIZE) {
      return {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Content exceeds 5MB limit' },
      };
    }

    // Basic structure check
    if (!content || typeof content !== 'object' || !('type' in (content as object))) {
      return {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Content must be a valid TipTap document' },
      };
    }

    const check = await checkProjectVersion(projectId, ctx.userId, expectedUpdatedAt);
    if (isToolError(check)) return check;

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: { content: content as any },
    });

    return {
      success: true,
      data: {
        id: updated.id,
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  },
};
```

**Step 8: Run tests**

Run: `cd server && npx vitest run src/__tests__/ai-tools/crud-write.test.ts`
Expected: All tests pass.

**Step 9: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All tests pass (existing + new).

**Step 10: Commit**

```bash
git add server/src/services/ai-tools/crud/ server/src/__tests__/ai-tools/
git commit -m "feat: add write CRUD tools with optimistic concurrency"
```

---

## Phase 2: Control Block Migration to Tools

### Task 6: Memory tools (updateWorkingMemory, rememberFact, updateTaskPlan)

**Files:**
- Create: `server/src/services/ai-tools/memory/update-working-memory.ts`
- Create: `server/src/services/ai-tools/memory/remember-fact.ts`
- Create: `server/src/services/ai-tools/memory/update-task-plan.ts`
- Test: `server/src/__tests__/ai-tools/memory-tools.test.ts`

These tools replace the `_memoryUpdate`, `_remember`, and `_planUpdate` control blocks. They wrap existing functions from `ai-memory.service.ts` and `ai-planner.service.ts`.

**Step 1: Write failing test**

Test should verify:
- `updateWorkingMemory` adds/drops bullets from working memory
- `rememberFact` creates a persistent memory item
- `updateTaskPlan` replaces the task plan

**Step 2: Implement tools**

Each tool wraps the existing service functions:
- `updateWorkingMemory` → calls `aiMemory.saveWorkingMemory()` (from `ai-memory.service.ts`)
- `rememberFact` → calls `aiMemory.addMemoryItem()` (from `ai-memory.service.ts`)
- `updateTaskPlan` → calls `aiPlanner.saveTaskPlan()` (from `ai-planner.service.ts`)

Reference: `server/src/services/ai-memory.service.ts` for exact function signatures.

**Step 3: Run tests, commit**

```bash
git commit -m "feat: add memory tools (updateWorkingMemory, rememberFact, updateTaskPlan)"
```

---

### Task 7: Content tools (editDocument, evaluateDocument, generateAdventure, generateImages)

**Files:**
- Create: `server/src/services/ai-tools/content/edit-document.ts`
- Create: `server/src/services/ai-tools/content/evaluate-document.ts`
- Create: `server/src/services/ai-tools/content/generate-adventure.ts`
- Create: `server/src/services/ai-tools/content/generate-images.ts`
- Test: `server/src/__tests__/ai-tools/content-tools.test.ts`

These are the most complex tools because they replace client-processed control blocks. Key design:

- **editDocument**: Accepts operations array, validates against schema, returns operations for client-side ProseMirror application. Does NOT modify DB directly.
- **evaluateDocument**: Accepts project content, returns structured findings object (score, summary, findings array). Client renders the eval card from this.
- **generateAdventure**: Wraps existing wizard service (`ai-wizard.service.ts`). Returns section data for client insertion.
- **generateImages**: Wraps existing image generation API call. Returns URLs for client to apply to editor blocks.

**Important**: `editDocument` and `evaluateDocument` are "return-only" tools — they compute a result but don't modify server state. The client handles applying the result to the editor.

**Step 1-3: Write tests, implement, verify, commit**

```bash
git commit -m "feat: add content tools (editDocument, evaluateDocument, generateAdventure, generateImages)"
```

---

### Task 8: Register all tools in a global registry instance

**Files:**
- Create: `server/src/services/ai-tools/register-all.ts`
- Modify: `server/src/services/ai-tools/index.ts`

**Step 1: Create registration file**

Create `server/src/services/ai-tools/register-all.ts`:

```typescript
import { ToolRegistry } from './registry.js';

// CRUD tools
import { listProjectsTool } from './crud/list-projects.js';
import { getProjectTool } from './crud/get-project.js';
import { getProjectContentTool } from './crud/get-project-content.js';
import { createProjectTool } from './crud/create-project.js';
import { updateProjectTool } from './crud/update-project.js';
import { deleteProjectTool } from './crud/delete-project.js';
import { updateProjectContentTool } from './crud/update-project-content.js';

// Memory tools
import { updateWorkingMemoryTool } from './memory/update-working-memory.js';
import { rememberFactTool } from './memory/remember-fact.js';
import { updateTaskPlanTool } from './memory/update-task-plan.js';

// Content tools
import { editDocumentTool } from './content/edit-document.js';
import { evaluateDocumentTool } from './content/evaluate-document.js';
import { generateAdventureTool } from './content/generate-adventure.js';
import { generateImagesTool } from './content/generate-images.js';

/** Singleton registry with all tools registered. */
export const toolRegistry = new ToolRegistry();

// Register all tools
const allTools = [
  listProjectsTool,
  getProjectTool,
  getProjectContentTool,
  createProjectTool,
  updateProjectTool,
  deleteProjectTool,
  updateProjectContentTool,
  updateWorkingMemoryTool,
  rememberFactTool,
  updateTaskPlanTool,
  editDocumentTool,
  evaluateDocumentTool,
  generateAdventureTool,
  generateImagesTool,
];

for (const tool of allTools) {
  toolRegistry.register(tool);
}
```

**Step 2: Update index.ts**

Add to `server/src/services/ai-tools/index.ts`:
```typescript
export { toolRegistry } from './register-all.js';
```

**Step 3: Type check + commit**

```bash
git commit -m "feat: register all tools in global registry"
```

---

### Task 9: Refactor server streaming — streamText with tools

**Files:**
- Modify: `server/src/routes/ai.ts` (lines 423-538, chat POST route)
- Modify: `server/src/services/ai-content.service.ts` (system prompt — remove control block instructions)

This is the critical streaming refactor. The chat POST route changes from:
1. `streamText()` → collect full text → `processAssistantResponse()` → `res.write()` chunks
2. To: `streamText({ tools })` → `pipeUIMessageStreamToResponse(res)` with automatic tool execution

**Step 1: Update system prompt**

In `server/src/services/ai-content.service.ts`, replace all control block instruction sections with tool-aware instructions. Remove:
- `=== ADVENTURE CREATION MODE ===` control block JSON format instructions
- `=== IMAGE GENERATION CONTROL BLOCK ===` format instructions
- `=== DOCUMENT EDITING MODE ===` control block format instructions
- `=== DOCUMENT EVALUATION MODE ===` control block format instructions
- Planning prompt control block instructions (from `ai-planner.service.ts:67-100`)

Replace with brief notes like: "You have tools available for editing documents, generating adventures, creating images, and evaluating content. Use them when appropriate."

The Vercel AI SDK automatically includes tool descriptions in the prompt — you don't need to document the JSON format.

**Step 2: Refactor chat route**

In `server/src/routes/ai.ts`, replace the chat POST handler (lines 423-538).

Key changes:
- Import `toolRegistry` and `stepCountIs`
- Create `ToolContext` from `req.userId`, `projectId`, `crypto.randomUUID()`
- Get tools via `toolRegistry.getToolsForContext('project-chat', ctx)`
- Pass `tools` and `stopWhen: stepCountIs(5)` to `streamText()`
- Use `result.pipeUIMessageStreamToResponse(res)` instead of manual `res.write()` loop
- Remove `processAssistantResponse()` call (tools execute inline)
- After stream completes, persist the full response text via `aiChat.addMessage()`

**Step 3: Remove planner post-processing**

In `server/src/services/ai-planner.service.ts`, the `processAssistantResponse`, `parseControlBlocks`, and `stripControlBlocks` functions become dead code. Keep them temporarily but mark deprecated with a TODO to remove once migration is verified.

**Step 4: Run server tests**

Run: `cd server && npx vitest run`
Expected: Existing tests may need updates (especially `ai-chat.test.ts` if it mocks streaming).

**Step 5: Type check + commit**

```bash
git commit -m "feat: refactor chat streaming to use Vercel AI SDK tools"
```

---

## Phase 3: Client Refactor

### Task 10: Data stream parser utility

**Files:**
- Create: `client/src/lib/parseUIMessageStream.ts`

Create a lightweight parser for Vercel AI SDK's UI Message Stream protocol. This replaces the raw `ReadableStream` text reader currently in `aiStore.ts` (lines 240-261).

The parser should yield typed events:
- `{ type: 'text-delta', value: string }`
- `{ type: 'tool-call', toolCallId: string, toolName: string, args: unknown }`
- `{ type: 'tool-result', toolCallId: string, toolName: string, result: unknown }`
- `{ type: 'error', error: string }`
- `{ type: 'finish' }`

Reference the Vercel AI SDK UI Message Stream protocol documentation for exact event format.

**Commit:**
```bash
git commit -m "feat: add UI Message Stream parser for client"
```

---

### Task 11: Refactor aiStore.ts — sendMessage with tool events

**Files:**
- Modify: `client/src/stores/aiStore.ts` (lines 174-305, sendMessage function)

Replace the raw text stream reader with the new `parseUIMessageStream` parser. Add `activeToolCalls` to the store state.

Key changes:
- Parse events instead of text chunks
- On `text-delta`: append to `streamingContent` (existing behavior)
- On `tool-call`: add to `activeToolCalls` map with status 'running'
- On `tool-result`: update status to 'complete', store result
- On `finish`: create assistant message, clear streaming state

**Commit:**
```bash
git commit -m "feat: refactor aiStore sendMessage for tool events"
```

---

### Task 12: Refactor AiChatPanel — remove control blocks, add tool result handling

**Files:**
- Modify: `client/src/components/ai/AiChatPanel.tsx`

This is the largest client-side change. Remove:
- `extractWizardOutline()` (lines 16-39)
- `extractDocumentEdit()` (lines 70-89)
- `extractImageGenBlock()` (lines 92-114)
- `stripWizardBlock()` (lines 42-52)
- `stripPlanningBlocks()` (lines 55-67)
- Module-level tracking sets (lines 273-287)
- useEffect hooks for wizard/edit/image detection (lines 351-490)

Keep:
- `executeDocumentEdits()` (lines 164-271) — still needed, called from tool result handler

Add:
- `handleToolResult(toolName, result, editor)` function that dispatches:
  - `editDocument` → call `executeDocumentEdits(editor, result.operations)`
  - `evaluateDocument` → store evaluation for card rendering
  - `generateAdventure` → trigger wizard UI flow
  - `generateImages` → trigger image progress UI
  - CRUD tools → no special UI handling (AI narrates the result)

**Commit:**
```bash
git commit -m "feat: refactor AiChatPanel for tool-based architecture"
```

---

### Task 13: Tool status indicators in message bubbles

**Files:**
- Create: `client/src/components/ai/ToolCallIndicator.tsx`
- Modify: `client/src/components/ai/AiMessageBubble.tsx`

Create a component that shows inline tool status in assistant messages:
- Running: spinner + tool name
- Complete: check icon + tool name + brief result summary
- Error: X icon + error message

Integrate into `AiMessageBubble.tsx` to render alongside message text.

**Commit:**
```bash
git commit -m "feat: add tool call status indicators in chat"
```

---

## Phase 4: Content Indexing Pipeline

### Task 14: Content chunker utility

**Files:**
- Create: `worker/src/jobs/content-index.job.ts`
- Create: `worker/src/lib/content-chunker.ts`
- Test: `worker/src/__tests__/content-chunker.test.ts`

The chunker walks TipTap JSON and produces `ContentChunk` records:
1. Track current heading path (e.g., "Chapter 1 > The Cave")
2. For each node: extract plain text, blockType, relevant attrs
3. Generate stable chunkId: `node-{nodeIndex}`
4. Return array of chunk data ready for upsert

The BullMQ job fetches the project, runs the chunker, then bulk upserts chunks (delete stale + create current in a transaction).

**Commit:**
```bash
git commit -m "feat: add content chunking worker job"
```

---

### Task 15: Emit indexing job on content save

**Files:**
- Modify: `server/src/routes/projects.ts` (line 89-106, PUT content route)
- Modify: `server/src/services/ai-tools/crud/update-project-content.ts`

After successful content save, enqueue a BullMQ job:
```typescript
await contentIndexQueue.add('index', { projectId, updatedAt: project.updatedAt.toISOString() });
```

Do this in both the HTTP route and the CRUD tool.

**Commit:**
```bash
git commit -m "feat: emit content indexing job on save"
```

---

### Task 16: Freshness-aware getProjectContent

**Files:**
- Modify: `server/src/services/ai-tools/crud/get-project-content.ts`

Update `getProjectContent` tool to check ContentChunk freshness:
1. Query latest `ContentChunk.updatedAt` for the project
2. Compare with `Project.updatedAt`
3. If fresh: return indexed chunks (structured, searchable)
4. If stale: fall back to `buildDocumentOutline()` + `buildDocumentTextSample()` (current behavior)

**Commit:**
```bash
git commit -m "feat: freshness-aware content retrieval in getProjectContent tool"
```

---

## Phase 5: E2E Tests + Polish

### Task 17: Integration tests — CRUD safety

**Files:**
- Create: `server/src/__tests__/ai-crud-integration.test.ts`

Full integration test that exercises the safety guarantees:
1. Create project via tool → verify in DB
2. Read project → verify data matches
3. Update with correct version → succeeds
4. Update with stale version → CONFLICT error
5. Cross-user access → NOT_FOUND (not FORBIDDEN — query-level scoping)
6. Delete with correct version → succeeds
7. Delete already-deleted → NOT_FOUND

**Commit:**
```bash
git commit -m "test: add CRUD safety integration tests"
```

---

### Task 18: E2E tests — AI tool calls in browser

**Files:**
- Modify: `client/e2e/ai-campaign-creation.spec.ts`

Add tests:
- Send "list my projects" → AI uses listProjects tool → response mentions projects
- Send "create a new one-shot called Test Adventure" → AI uses createProject tool → project appears in dashboard
- Verify tool status indicators appear during streaming

**Commit:**
```bash
git commit -m "test: add E2E tests for AI tool calling"
```

---

### Task 19: Cleanup — Remove dead control block code

**Files:**
- Modify: `server/src/services/ai-planner.service.ts` (remove `parseControlBlocks`, `stripControlBlocks`, `processAssistantResponse`)
- Modify: `client/src/components/ai/AiEvaluationCard.tsx` (remove `extractEvaluation` if no longer needed)
- Modify: `shared/src/types/planner.ts` (remove `MemoryUpdateBlock`, `PlanUpdateBlock`, `RememberBlock`, `DocumentEditBlock`, `PlanningStateChanges` if unused)

Run full test suite after each removal to verify no breakage.

**Commit:**
```bash
git commit -m "chore: remove dead control block extraction code"
```

---

### Task 20: Final verification

**Step 1:** Run all server tests: `cd server && npx vitest run`
**Step 2:** Run all worker tests: `cd worker && npm test`
**Step 3:** Type check: `cd server && npx tsc --noEmit && cd ../client && npx tsc --noEmit`
**Step 4:** Run E2E tests: `cd client && npx playwright test`
**Step 5:** Docker build + deploy: `docker compose build server && docker compose up -d server`
**Step 6:** Manual smoke test: Open app, send chat message, verify tool calls work

**Commit:**
```bash
git commit -m "chore: final verification pass — all tests green"
```
