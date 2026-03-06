# Phase 14: Editor Migration — Per-Document Editing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Break the monolithic editor into per-chapter editing. Users with ProjectDocument records (from generation runs) get a document navigator sidebar and can switch between chapters. Legacy projects (no documents) continue working exactly as before.

**Architecture:** Server-side document CRUD service + routes. Client-side `projectStore` extended with document list, active document, and per-document save. New `DocumentNavigator` sidebar component. `EditorPage` conditionally shows navigator when documents exist. `EditorLayout` interface unchanged — it still receives `content` and `onUpdate` — the switching logic lives in `EditorPage`.

**Tech Stack:** Express 5, Prisma 6, React 19, Zustand 5, Tailwind CSS 4, TipTap v3

**Design Principle:** Backward compatibility first. The existing `Project.content` save flow remains untouched. Per-document editing is an additive layer activated only when `ProjectDocument[]` records exist.

---

### Task 1: Document Service

**Files:**
- Create: `server/src/services/document.service.ts`

**Step 1: Create the service**

```typescript
// server/src/services/document.service.ts
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';

export async function listDocuments(projectId: string, userId: string) {
  // Verify ownership
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return null;

  return prisma.projectDocument.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      projectId: true,
      runId: true,
      kind: true,
      title: true,
      slug: true,
      sortOrder: true,
      targetPageCount: true,
      status: true,
      sourceArtifactId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getDocument(documentId: string, userId: string) {
  const doc = await prisma.projectDocument.findUnique({
    where: { id: documentId },
    include: { project: { select: { userId: true } } },
  });

  if (!doc || doc.project.userId !== userId) return null;

  // Strip the nested project to avoid leaking data
  const { project: _project, ...rest } = doc;
  return rest;
}

export async function updateDocumentContent(
  documentId: string,
  userId: string,
  content: Prisma.InputJsonValue,
) {
  const doc = await prisma.projectDocument.findUnique({
    where: { id: documentId },
    include: { project: { select: { userId: true } } },
  });

  if (!doc || doc.project.userId !== userId) return null;

  return prisma.projectDocument.update({
    where: { id: documentId },
    data: { content, status: 'edited' },
  });
}

export async function updateDocumentTitle(
  documentId: string,
  userId: string,
  title: string,
) {
  const doc = await prisma.projectDocument.findUnique({
    where: { id: documentId },
    include: { project: { select: { userId: true } } },
  });

  if (!doc || doc.project.userId !== userId) return null;

  return prisma.projectDocument.update({
    where: { id: documentId },
    data: { title },
  });
}

export async function reorderDocuments(
  projectId: string,
  userId: string,
  orderedIds: string[],
) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return null;

  // Verify all IDs belong to this project
  const docs = await prisma.projectDocument.findMany({
    where: { projectId },
    select: { id: true },
  });
  const existingIds = new Set(docs.map((d) => d.id));
  for (const id of orderedIds) {
    if (!existingIds.has(id)) return null;
  }

  // Update sort orders in a transaction
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.projectDocument.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );

  return prisma.projectDocument.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
  });
}
```

**Step 2: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/services/document.service.ts
git commit -m "feat: add document service for per-chapter CRUD operations"
```

---

### Task 2: Document Routes

**Files:**
- Create: `server/src/routes/documents.ts`
- Modify: `server/src/index.ts`

**Step 1: Create the routes**

```typescript
// server/src/routes/documents.ts
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validateUuid } from '../middleware/validate-uuid.js';
import {
  listDocuments,
  getDocument,
  updateDocumentContent,
  updateDocumentTitle,
  reorderDocuments,
} from '../services/document.service.js';

const documentRoutes = Router({ mergeParams: true });

const contentSchema = z.object({
  type: z.string().max(50),
  content: z.array(z.any()).optional(),
  attrs: z.record(z.unknown()).optional(),
}).refine(
  (val) => JSON.stringify(val).length <= 5_000_000,
  { message: 'Content exceeds 5 MB limit' },
);

const titleSchema = z.object({
  title: z.string().min(1).max(200),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()),
});

// GET /documents — List project documents
documentRoutes.get(
  '/documents',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;

    const docs = await listDocuments(projectId, authReq.userId!);
    if (!docs) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(docs);
  }),
);

// GET /documents/:docId — Get one document (with content)
documentRoutes.get(
  '/documents/:docId',
  requireAuth,
  validateUuid('projectId', 'docId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const docId = req.params.docId as string;

    const doc = await getDocument(docId, authReq.userId!);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json(doc);
  }),
);

// PUT /documents/:docId/content — Update document content
documentRoutes.put(
  '/documents/:docId/content',
  requireAuth,
  validateUuid('projectId', 'docId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const docId = req.params.docId as string;

    const parsed = contentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid content', details: parsed.error.flatten() });
      return;
    }

    const doc = await updateDocumentContent(docId, authReq.userId!, parsed.data as any);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json(doc);
  }),
);

// PUT /documents/:docId/title — Update document title
documentRoutes.put(
  '/documents/:docId/title',
  requireAuth,
  validateUuid('projectId', 'docId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const docId = req.params.docId as string;

    const parsed = titleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid title' });
      return;
    }

    const doc = await updateDocumentTitle(docId, authReq.userId!, parsed.data.title);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json(doc);
  }),
);

// POST /documents/reorder — Reorder documents
documentRoutes.post(
  '/documents/reorder',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;

    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid reorder data' });
      return;
    }

    const docs = await reorderDocuments(projectId, authReq.userId!, parsed.data.orderedIds);
    if (!docs) {
      res.status(404).json({ error: 'Project not found or invalid document IDs' });
      return;
    }

    res.json(docs);
  }),
);

export default documentRoutes;
```

**Step 2: Mount routes in server/src/index.ts**

Add after the existing generation routes mount:
```typescript
import documentRoutes from './routes/documents.js';
```

Add the route mount (after the `generationRoutes` line):
```typescript
app.use('/api/projects/:projectId', documentRoutes);
```

**Step 3: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/routes/documents.ts server/src/index.ts
git commit -m "feat: add document routes for per-chapter CRUD with route mounting"
```

---

### Task 3: Document Routes Tests

**Files:**
- Create: `server/src/__tests__/documents.test.ts`

**Step 1: Create integration tests**

```typescript
// server/src/__tests__/documents.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../config/database.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

let userId: string;
let projectId: string;
let docId: string;
let token: string;

beforeAll(async () => {
  const email = `doctest-${Date.now()}@test.com`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash('TestPass1!', 4),
      displayName: 'Doc Tester',
      tokenVersion: 0,
    },
  });
  userId = user.id;
  token = jwt.sign({ userId, tokenVersion: 0 }, JWT_SECRET, { expiresIn: '15m' });

  const project = await prisma.project.create({
    data: {
      userId,
      title: 'Document Test Project',
      description: '',
      type: 'campaign',
      settings: {},
      content: { type: 'doc', content: [] },
    },
  });
  projectId = project.id;

  const doc = await prisma.projectDocument.create({
    data: {
      projectId,
      kind: 'chapter',
      title: 'Chapter 1: The Beginning',
      slug: 'chapter_1',
      sortOrder: 0,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }] },
      status: 'draft',
    },
  });
  docId = doc.id;

  await prisma.projectDocument.create({
    data: {
      projectId,
      kind: 'chapter',
      title: 'Chapter 2: The Middle',
      slug: 'chapter_2',
      sortOrder: 1,
      content: { type: 'doc', content: [] },
      status: 'draft',
    },
  });
});

afterAll(async () => {
  await prisma.projectDocument.deleteMany({ where: { projectId } });
  await prisma.project.delete({ where: { id: projectId } });
  await prisma.user.delete({ where: { id: userId } });
});

describe('Document Routes', () => {
  it('GET /documents lists project documents in order', async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/documents`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].title).toBe('Chapter 1: The Beginning');
    expect(res.body[1].title).toBe('Chapter 2: The Middle');
    // List should not include full content
    expect(res.body[0].content).toBeUndefined();
  });

  it('GET /documents/:docId returns document with content', async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/documents/${docId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Chapter 1: The Beginning');
    expect(res.body.content).toBeDefined();
    expect(res.body.content.type).toBe('doc');
  });

  it('PUT /documents/:docId/content updates content', async () => {
    const newContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated!' }] }] };
    const res = await request(app)
      .put(`/api/projects/${projectId}/documents/${docId}/content`)
      .set('Authorization', `Bearer ${token}`)
      .send(newContent);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('edited');
  });

  it('PUT /documents/:docId/title updates title', async () => {
    const res = await request(app)
      .put(`/api/projects/${projectId}/documents/${docId}/title`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Chapter 1: The New Beginning' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Chapter 1: The New Beginning');
  });

  it('POST /documents/reorder changes sort order', async () => {
    const listRes = await request(app)
      .get(`/api/projects/${projectId}/documents`)
      .set('Authorization', `Bearer ${token}`);

    const ids = listRes.body.map((d: { id: string }) => d.id);
    const reversed = [...ids].reverse();

    const res = await request(app)
      .post(`/api/projects/${projectId}/documents/reorder`)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderedIds: reversed });

    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe(reversed[0]);
  });

  it('returns 404 for non-existent document', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .get(`/api/projects/${projectId}/documents/${fakeId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
```

**Step 2: Run tests**

Run: `cd /home/gallison/workspace/DND_booker/server && npx vitest run src/__tests__/documents.test.ts`
Expected: All 6 tests PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/__tests__/documents.test.ts
git commit -m "test: add document routes integration tests"
```

---

### Task 4: Extend projectStore with Document State

**Files:**
- Modify: `client/src/stores/projectStore.ts`

**Step 1: Add document state and actions**

Add import:
```typescript
import type { ProjectDocument, DocumentContent } from '@dnd-booker/shared';
```

Add to the store interface:
```typescript
  // Per-document editing
  documents: ProjectDocument[];
  activeDocument: ProjectDocument | null;
  isLoadingDocuments: boolean;
  isLoadingDocument: boolean;

  fetchDocuments: (projectId: string) => Promise<void>;
  loadDocument: (projectId: string, docId: string) => Promise<void>;
  updateDocumentContent: (content: DocumentContent) => void;
  clearActiveDocument: () => void;
```

Add initial values:
```typescript
  documents: [],
  activeDocument: null,
  isLoadingDocuments: false,
  isLoadingDocument: false,
```

Add action implementations:
```typescript
  fetchDocuments: async (projectId) => {
    set({ isLoadingDocuments: true });
    try {
      const { data } = await api.get(`/projects/${projectId}/documents`);
      set({ documents: data, isLoadingDocuments: false });
    } catch {
      set({ isLoadingDocuments: false });
    }
  },

  loadDocument: async (projectId, docId) => {
    set({ isLoadingDocument: true });
    // Flush any pending save for previous document
    get().flushPendingSave();
    try {
      const { data } = await api.get(`/projects/${projectId}/documents/${docId}`);
      set({ activeDocument: data, isLoadingDocument: false });
    } catch {
      set({ isLoadingDocument: false });
    }
  },

  updateDocumentContent: (content) => {
    const doc = get().activeDocument;
    if (!doc) return;

    set({
      activeDocument: { ...doc, content },
      hasPendingChanges: true,
    });

    // Debounced save to document endpoint
    if (pendingSaveTimeout) clearTimeout(pendingSaveTimeout);
    pendingSaveTimeout = setTimeout(async () => {
      try {
        set({ isSaving: true });
        await api.put(`/projects/${doc.projectId}/documents/${doc.id}/content`, content);
        set({ isSaving: false, hasPendingChanges: false, saveError: null });
      } catch (err: unknown) {
        const message = err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : 'Save failed';
        set({
          isSaving: false,
          saveError: { message: message || 'Save failed', category: 'server' },
        });
      }
    }, 1000);
  },

  clearActiveDocument: () => {
    get().flushPendingSave();
    set({ activeDocument: null });
  },
```

Note: The `updateDocumentContent` function shares the same debounce timeout variable (`pendingSaveTimeout`) as the existing `updateContent` function so only one save can be in-flight at a time.

**Step 2: Verify client type check**

Run: `cd /home/gallison/workspace/DND_booker/client && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add client/src/stores/projectStore.ts
git commit -m "feat: extend projectStore with per-document state and save actions"
```

---

### Task 5: DocumentNavigator Component

**Files:**
- Create: `client/src/components/editor/DocumentNavigator.tsx`

**Step 1: Create the navigator sidebar**

```tsx
// client/src/components/editor/DocumentNavigator.tsx
import { useEffect } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import type { DocumentKind } from '@dnd-booker/shared';

const KIND_LABELS: Record<DocumentKind, string> = {
  front_matter: 'Front Matter',
  chapter: 'Chapters',
  appendix: 'Appendices',
  back_matter: 'Back Matter',
};

const KIND_ORDER: DocumentKind[] = ['front_matter', 'chapter', 'appendix', 'back_matter'];

interface Props {
  projectId: string;
}

export function DocumentNavigator({ projectId }: Props) {
  const {
    documents, activeDocument, isLoadingDocuments,
    fetchDocuments, loadDocument,
  } = useProjectStore();

  useEffect(() => {
    fetchDocuments(projectId);
  }, [projectId, fetchDocuments]);

  if (isLoadingDocuments && documents.length === 0) {
    return (
      <div className="w-56 border-r border-gray-200 bg-white p-3">
        <div className="text-xs text-gray-400">Loading documents...</div>
      </div>
    );
  }

  if (documents.length === 0) return null;

  // Group by kind
  const grouped = documents.reduce<Record<string, typeof documents>>((acc, doc) => {
    if (!acc[doc.kind]) acc[doc.kind] = [];
    acc[doc.kind].push(doc);
    return acc;
  }, {});

  return (
    <div className="w-56 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Documents</h3>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {KIND_ORDER.map((kind) => {
          const docs = grouped[kind];
          if (!docs?.length) return null;
          return (
            <div key={kind} className="mb-1">
              <div className="px-3 py-1 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                {KIND_LABELS[kind]}
              </div>
              {docs.map((doc) => {
                const isActive = activeDocument?.id === doc.id;
                return (
                  <button
                    key={doc.id}
                    onClick={() => loadDocument(projectId, doc.id)}
                    className={`w-full text-left px-3 py-1.5 text-xs truncate transition-colors ${
                      isActive
                        ? 'bg-purple-50 text-purple-700 font-medium border-r-2 border-purple-500'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                    }`}
                    title={doc.title}
                  >
                    {doc.title}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Verify client type check**

Run: `cd /home/gallison/workspace/DND_booker/client && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add client/src/components/editor/DocumentNavigator.tsx
git commit -m "feat: add DocumentNavigator sidebar for per-chapter navigation"
```

---

### Task 6: Adapt EditorPage for Per-Document Mode

**Files:**
- Modify: `client/src/pages/EditorPage.tsx`

**Step 1: Add document-aware rendering**

The key change: After `fetchProject`, also `fetchDocuments`. If documents exist, show `DocumentNavigator` sidebar and load content from `activeDocument`. If no documents, fall through to the existing monolithic mode.

Add imports:
```typescript
import { DocumentNavigator } from '../components/editor/DocumentNavigator';
```

In the `useEffect` that calls `fetchProject`, after the project loads, also fetch documents:
```typescript
useEffect(() => {
  if (projectId) {
    cancelPendingSave();
    fetchProject(projectId).then(() => {
      const project = useProjectStore.getState().currentProject;
      if (project) {
        loadProjectTheme(projectId, project.settings);
        fetchDocuments(projectId);
      }
    });
  }
  return () => {
    flushPendingSave();
    clearActiveDocument();
  };
}, [projectId, fetchProject, loadProjectTheme, cancelPendingSave, flushPendingSave, fetchDocuments, clearActiveDocument]);
```

Extract `documents`, `activeDocument`, `isLoadingDocument`, `updateDocumentContent`, `fetchDocuments`, `clearActiveDocument` from `useProjectStore`.

Add a `handleDocumentContentUpdate` callback:
```typescript
const handleDocumentContentUpdate = useCallback(
  (content: DocumentContent) => {
    updateDocumentContent(content);
  },
  [updateDocumentContent],
);
```

Modify the render to conditionally show the navigator and use document content when available:

```tsx
<div className="flex flex-1 overflow-hidden">
  {/* Document navigator sidebar — only when documents exist */}
  {documents.length > 0 && (
    <DocumentNavigator projectId={projectId!} />
  )}

  <div className="flex-1 overflow-hidden">
    {isLoadingProject ? (
      <div className="flex items-center justify-center h-full text-gray-400">
        Loading...
      </div>
    ) : documents.length > 0 && activeDocument ? (
      // Per-document mode
      <EditorLayout
        key={activeDocument.id}
        projectId={projectId!}
        content={activeDocument.content as DocumentContent}
        onUpdate={handleDocumentContentUpdate}
      />
    ) : documents.length > 0 && !activeDocument ? (
      // Documents exist but none selected
      <div className="flex items-center justify-center h-full text-gray-400">
        {isLoadingDocument ? 'Loading document...' : 'Select a document from the sidebar.'}
      </div>
    ) : currentProject?.content ? (
      // Legacy monolithic mode
      <EditorLayout
        key={currentProject.id}
        projectId={projectId!}
        content={currentProject.content}
        onUpdate={handleContentUpdate}
      />
    ) : (
      <div className="flex items-center justify-center h-full text-gray-400">
        Project not found.
      </div>
    )}
  </div>
</div>
```

**Step 2: Verify client type check**

Run: `cd /home/gallison/workspace/DND_booker/client && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add client/src/pages/EditorPage.tsx
git commit -m "feat: adapt EditorPage for per-document mode with navigator sidebar"
```

---

### Task 7: Integration Verification

**Files:**
- No new files

**Step 1: Run client type check**

Run: `cd /home/gallison/workspace/DND_booker/client && npx tsc --noEmit`
Expected: PASS

**Step 2: Run server type check**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Run document tests**

Run: `cd /home/gallison/workspace/DND_booker/server && npx vitest run src/__tests__/documents.test.ts`
Expected: All tests PASS

**Step 4: Run generation tests (regression)**

Run: `cd /home/gallison/workspace/DND_booker/server && npx vitest run src/__tests__/generation/ 2>&1 | tail -10`
Expected: 95 passing + 1 pre-existing pubsub timeout
