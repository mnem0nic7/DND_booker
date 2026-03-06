# Export Adaptation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adapt the export pipeline to read from `ProjectDocument[]` records when they exist, falling back to monolithic `Project.content` for legacy projects.

**Architecture:** The assemblers (`assembleTypst`, `assembleHtml`) already accept a `documents: Array<{ title, content, sortOrder }>` array. Currently `export.job.ts` wraps the single `Project.content` into a one-element array. The change: query `ProjectDocument[]` from DB; if any exist, use them; otherwise fall back to the legacy single-document wrapper.

**Tech Stack:** Prisma 6, BullMQ worker, Typst assembler, HTML assembler

---

### Task 1: Write failing test for per-document export

**Files:**
- Modify: `worker/src/__tests__/export-job.test.ts` (or create if no export job test exists)

**Step 1: Find existing export job test file**

Run: `find worker/src/__tests__ -name '*export*' -o -name '*job*' 2>/dev/null; ls worker/src/__tests__/`
Check what test infrastructure exists for the export job.

**Step 2: Write the failing test**

The test should verify that when `ProjectDocument` records exist for a project, the export job uses them instead of `Project.content`. Since this is a worker job that calls Prisma directly, we need to mock Prisma.

```typescript
// In the export job test file
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
vi.mock('../../lib/prisma', () => ({
  default: {
    exportJob: { findUnique: (...args: unknown[]) => mockFindUnique(...args), update: (...args: unknown[]) => mockUpdate(...args) },
    projectDocument: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}));

describe('processExportJob - per-document support', () => {
  it('should use ProjectDocument records when they exist', async () => {
    const projectId = 'proj-1';
    const chapter1Content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Chapter 1' }] }] };
    const chapter2Content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Chapter 2' }] }] };

    mockFindUnique.mockResolvedValue({
      id: 'job-1',
      projectId,
      format: 'pdf',
      project: { id: projectId, title: 'Test Project', content: { type: 'doc', content: [] }, settings: { theme: 'classic' } },
    });

    mockFindMany.mockResolvedValue([
      { id: 'doc-1', title: 'Introduction', content: chapter1Content, sortOrder: 0, kind: 'front_matter' },
      { id: 'doc-2', title: 'The Dark Forest', content: chapter2Content, sortOrder: 1, kind: 'chapter' },
    ]);

    // ... exercise processExportJob and verify assembleTypst received 2 documents
  });

  it('should fall back to Project.content when no ProjectDocuments exist', async () => {
    // mockFindMany returns []
    // Verify assembler receives single-element array with Project.content
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd worker && npm test -- --testNamePattern="per-document" -v`
Expected: FAIL (function doesn't query ProjectDocument yet)

**Step 4: Commit**

```bash
git add worker/src/__tests__/export-job.test.ts
git commit -m "test: add failing tests for per-document export support"
```

---

### Task 2: Modify export.job.ts to query ProjectDocument records

**Files:**
- Modify: `worker/src/jobs/export.job.ts:~25-45` (the docs array construction)

**Step 1: Read the current export.job.ts**

Read the full file to understand imports and the exact location of the docs array construction.

**Step 2: Add ProjectDocument query and fallback logic**

After fetching the ExportJob with its Project, add:

```typescript
// After fetching exportJob...
const projectDocuments = await prisma.projectDocument.findMany({
  where: { projectId: exportJob.projectId },
  orderBy: { sortOrder: 'asc' },
  select: { title: true, content: true, sortOrder: true },
});

const docs = projectDocuments.length > 0
  ? projectDocuments.map(doc => ({
      title: doc.title,
      content: doc.content as DocumentContent | null,
      sortOrder: doc.sortOrder,
    }))
  : [{
      title: exportJob.project.title,
      content: exportJob.project.content as DocumentContent | null,
      sortOrder: 0,
    }];
```

**Step 3: Run tests to verify they pass**

Run: `cd worker && npm test -- --testNamePattern="per-document" -v`
Expected: PASS

**Step 4: Run full worker test suite for regression**

Run: `cd worker && npm test`
Expected: All existing tests still pass

**Step 5: Commit**

```bash
git add worker/src/jobs/export.job.ts
git commit -m "feat: export pipeline reads from ProjectDocument[] with legacy fallback"
```

---

### Task 3: Integration verification

**Step 1: Type check worker**

Run: `cd worker && npx tsc --noEmit`
Expected: No errors

**Step 2: Type check server** (ensure Prisma schema is consistent)

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Run full worker test suite**

Run: `cd worker && npm test`
Expected: All pass

**Step 4: Run server tests for regression**

Run: `cd server && npx vitest run src/__tests__/documents.test.ts`
Expected: All pass
