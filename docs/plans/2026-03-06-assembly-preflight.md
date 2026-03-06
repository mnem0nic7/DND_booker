# Phase 9: Assembly + Preflight Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn accepted artifacts into ProjectDocuments and an AssemblyManifest, with preflight checks to catch issues before the pipeline declares success.

**Architecture:** The assembler queries all accepted artifacts for a run, groups them by document kind (front_matter, chapter, appendix), builds an AssemblyManifest mapping artifact keys to document slots, then creates ProjectDocument records with the artifact's TipTap/JSON content. The preflight service runs validation checks: all chapters have drafts, page budgets are reasonable, no orphan entities, no duplicate slugs. Both services are pure business logic with Prisma + pub/sub — no AI calls.

**Tech Stack:** Prisma 6, Redis pub/sub, Zod validation

---

### Task 1: Assembler Service

**Files:**
- Create: `server/src/services/generation/assembler.service.ts`

**Step 1: Create the assembler service**

This service:
1. Fetches the ChapterOutline artifact to know expected documents
2. Queries all accepted artifacts (latest version per key) for the run
3. Builds an AssemblyManifest (document order, artifact mapping)
4. Creates ProjectDocument records from artifact content
5. Publishes progress events

```typescript
// server/src/services/generation/assembler.service.ts
import type { ChapterOutline, AssemblyDocumentSpec } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';

export interface AssemblyResult {
  manifestId: string;
  documentIds: string[];
}

// Map artifact types to document kinds
const ARTIFACT_TO_DOC_KIND: Record<string, 'front_matter' | 'chapter' | 'appendix' | 'back_matter'> = {
  front_matter_draft: 'front_matter',
  chapter_draft: 'chapter',
  appendix_draft: 'appendix',
};

/**
 * Get the latest accepted version of each artifact key for a run.
 */
async function getAcceptedArtifacts(runId: string) {
  const artifacts = await prisma.generatedArtifact.findMany({
    where: { runId, status: 'accepted' },
    orderBy: [{ artifactKey: 'asc' }, { version: 'desc' }],
  });

  // Deduplicate: keep only latest version per artifactKey
  const seen = new Set<string>();
  return artifacts.filter((a) => {
    if (seen.has(a.artifactKey)) return false;
    seen.add(a.artifactKey);
    return true;
  });
}

/**
 * Build the document manifest from the outline and accepted artifacts.
 */
export function buildManifestDocuments(
  outline: ChapterOutline,
  acceptedKeys: Set<string>,
): AssemblyDocumentSpec[] {
  const docs: AssemblyDocumentSpec[] = [];
  let sortOrder = 0;

  // Front matter (title page, credits, ToC) — sortOrder 0
  if (acceptedKeys.has('front-matter')) {
    docs.push({
      documentSlug: 'front-matter',
      title: 'Front Matter',
      kind: 'front_matter',
      artifactKeys: ['front-matter'],
      sortOrder: sortOrder++,
    });
  }

  // Chapters in outline order
  for (const ch of outline.chapters) {
    const draftKey = `chapter-draft-${ch.slug}`;
    const planKey = `chapter-plan-${ch.slug}`;
    const keys = [draftKey, planKey].filter((k) => acceptedKeys.has(k));
    docs.push({
      documentSlug: ch.slug,
      title: ch.title,
      kind: 'chapter',
      artifactKeys: keys.length > 0 ? keys : [draftKey],
      sortOrder: sortOrder++,
      targetPageCount: ch.targetPages,
    });
  }

  // Appendices in outline order
  for (const app of outline.appendices) {
    const draftKey = `appendix-draft-${app.slug}`;
    docs.push({
      documentSlug: app.slug,
      title: app.title,
      kind: 'appendix',
      artifactKeys: [draftKey],
      sortOrder: sortOrder++,
      targetPageCount: app.targetPages,
    });
  }

  return docs;
}

/**
 * Assemble accepted artifacts into ProjectDocuments.
 */
export async function assembleDocuments(
  run: { id: string; projectId: string },
): Promise<AssemblyResult> {
  // 1. Get the chapter outline
  const outlineArtifact = await prisma.generatedArtifact.findFirst({
    where: { runId: run.id, artifactType: 'chapter_outline', status: 'accepted' },
    orderBy: { version: 'desc' },
  });
  if (!outlineArtifact?.jsonContent) {
    throw new Error('No accepted chapter outline found for run');
  }
  const outline = outlineArtifact.jsonContent as unknown as ChapterOutline;

  // 2. Get all accepted artifacts
  const accepted = await getAcceptedArtifacts(run.id);
  const acceptedByKey = new Map(accepted.map((a) => [a.artifactKey, a]));
  const acceptedKeys = new Set(accepted.map((a) => a.artifactKey));

  // 3. Build manifest
  const manifestDocs = buildManifestDocuments(outline, acceptedKeys);

  const manifest = await prisma.assemblyManifest.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      version: 1,
      documents: manifestDocs as any,
      status: 'draft',
    },
  });

  // 4. Create ProjectDocument records
  const documentIds: string[] = [];

  for (const spec of manifestDocs) {
    // Find the primary content artifact (draft > plan)
    const draftKey = spec.artifactKeys[0];
    const artifact = acceptedByKey.get(draftKey);

    const content = artifact?.tiptapContent ?? artifact?.jsonContent ?? {};

    const doc = await prisma.projectDocument.create({
      data: {
        projectId: run.projectId,
        runId: run.id,
        kind: spec.kind,
        title: spec.title,
        slug: spec.documentSlug,
        sortOrder: spec.sortOrder,
        targetPageCount: spec.targetPageCount ?? null,
        outlineJson: artifact?.jsonContent as any ?? null,
        content: content as any,
        status: 'draft',
        sourceArtifactId: artifact?.id ?? null,
      },
    });

    documentIds.push(doc.id);
  }

  // 5. Update manifest status
  await prisma.assemblyManifest.update({
    where: { id: manifest.id },
    data: { status: 'assembled' },
  });

  // 6. Publish event
  await publishGenerationEvent(run.id, {
    type: 'run_status',
    runId: run.id,
    status: 'assembling',
    stage: 'assembly',
    progressPercent: 90,
  });

  return { manifestId: manifest.id, documentIds };
}
```

**Step 2: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/services/generation/assembler.service.ts
git commit -m "feat: add assembler service to build ProjectDocuments from accepted artifacts"
```

---

### Task 2: Preflight Service

**Files:**
- Create: `server/src/services/generation/preflight.service.ts`

**Step 1: Create the preflight service**

The preflight service validates the assembly before the run is marked complete:
1. All expected chapters have drafts (completeness check)
2. No duplicate document slugs (uniqueness check)
3. Page budget within tolerance (±20% of target)
4. All entity references in drafts exist in CanonEntity table (consistency check)

```typescript
// server/src/services/generation/preflight.service.ts
import type { ChapterOutline } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';

export type PreflightSeverity = 'error' | 'warning' | 'info';

export interface PreflightIssue {
  severity: PreflightSeverity;
  code: string;
  message: string;
  documentSlug?: string;
}

export interface PreflightResult {
  passed: boolean;
  issues: PreflightIssue[];
  stats: {
    documentsCreated: number;
    chaptersExpected: number;
    chaptersFound: number;
    totalPageEstimate: number;
  };
}

/**
 * Run preflight checks on the assembled documents for a generation run.
 */
export async function runPreflight(
  run: { id: string; projectId: string },
): Promise<PreflightResult> {
  const issues: PreflightIssue[] = [];

  // Load outline for expected structure
  const outlineArtifact = await prisma.generatedArtifact.findFirst({
    where: { runId: run.id, artifactType: 'chapter_outline', status: 'accepted' },
    orderBy: { version: 'desc' },
  });

  if (!outlineArtifact?.jsonContent) {
    return {
      passed: false,
      issues: [{ severity: 'error', code: 'NO_OUTLINE', message: 'No accepted chapter outline found' }],
      stats: { documentsCreated: 0, chaptersExpected: 0, chaptersFound: 0, totalPageEstimate: 0 },
    };
  }

  const outline = outlineArtifact.jsonContent as unknown as ChapterOutline;

  // Load created documents
  const documents = await prisma.projectDocument.findMany({
    where: { runId: run.id, projectId: run.projectId },
    orderBy: { sortOrder: 'asc' },
  });

  const docsBySlug = new Map(documents.map((d) => [d.slug, d]));

  // Check 1: Completeness — every chapter in outline has a document
  const chapterDocs = documents.filter((d) => d.kind === 'chapter');
  for (const ch of outline.chapters) {
    if (!docsBySlug.has(ch.slug)) {
      issues.push({
        severity: 'error',
        code: 'MISSING_CHAPTER',
        message: `Chapter "${ch.title}" (${ch.slug}) has no assembled document`,
        documentSlug: ch.slug,
      });
    }
  }

  // Check 2: Duplicate slugs
  const slugCounts = new Map<string, number>();
  for (const doc of documents) {
    slugCounts.set(doc.slug, (slugCounts.get(doc.slug) ?? 0) + 1);
  }
  for (const [slug, count] of slugCounts) {
    if (count > 1) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_SLUG',
        message: `Document slug "${slug}" appears ${count} times`,
        documentSlug: slug,
      });
    }
  }

  // Check 3: Page budget tolerance (±20%)
  for (const ch of outline.chapters) {
    const doc = docsBySlug.get(ch.slug);
    if (doc?.targetPageCount && ch.targetPages) {
      const ratio = doc.targetPageCount / ch.targetPages;
      if (ratio < 0.8 || ratio > 1.2) {
        issues.push({
          severity: 'warning',
          code: 'PAGE_BUDGET_DRIFT',
          message: `Chapter "${ch.title}" target ${doc.targetPageCount}pp vs outline ${ch.targetPages}pp (${Math.round(ratio * 100)}%)`,
          documentSlug: ch.slug,
        });
      }
    }
  }

  // Check 4: Entity references exist
  const artifacts = await prisma.generatedArtifact.findMany({
    where: { runId: run.id, status: 'accepted', artifactType: 'chapter_draft' },
    include: { canonReferences: { include: { entity: true } } },
  });

  for (const artifact of artifacts) {
    for (const ref of artifact.canonReferences) {
      if (!ref.entity) {
        issues.push({
          severity: 'warning',
          code: 'ORPHAN_REFERENCE',
          message: `Artifact "${artifact.title}" references missing entity ${ref.entityId}`,
        });
      }
    }
  }

  // Compute stats
  const totalPageEstimate = outline.chapters.reduce((sum, ch) => sum + ch.targetPages, 0)
    + outline.appendices.reduce((sum, app) => sum + app.targetPages, 0);

  const hasErrors = issues.some((i) => i.severity === 'error');

  return {
    passed: !hasErrors,
    issues,
    stats: {
      documentsCreated: documents.length,
      chaptersExpected: outline.chapters.length,
      chaptersFound: chapterDocs.length,
      totalPageEstimate,
    },
  };
}
```

**Step 2: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/services/generation/preflight.service.ts
git commit -m "feat: add preflight service with completeness, uniqueness, and budget checks"
```

---

### Task 3: Assembler Tests

**Files:**
- Create: `server/src/__tests__/generation/assembler.test.ts`

**Step 1: Write the assembler tests**

Tests cover:
1. `buildManifestDocuments` pure function — correct ordering, kinds, key mapping
2. `assembleDocuments` integration — creates manifest + ProjectDocuments
3. Missing outline throws error
4. Documents created with correct sortOrder and kind

```typescript
// server/src/__tests__/generation/assembler.test.ts
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import type { ChapterOutline } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import {
  assembleDocuments,
  buildManifestDocuments,
} from '../../services/generation/assembler.service.js';
import { createRun } from '../../services/generation/run.service.js';

vi.mock('../../services/generation/pubsub.service.js', () => ({
  publishGenerationEvent: vi.fn(),
}));

let testUser: { id: string };
let testProject: { id: string };

const SAMPLE_OUTLINE: ChapterOutline = {
  chapters: [
    {
      slug: 'goblin-ambush',
      title: 'The Goblin Ambush',
      act: 1,
      sortOrder: 0,
      levelRange: { min: 1, max: 2 },
      targetPages: 10,
      summary: 'Goblins attack the party.',
      keyEntities: ['goblin-chief'],
      sections: [],
    },
    {
      slug: 'dark-forest',
      title: 'Into the Dark Forest',
      act: 1,
      sortOrder: 1,
      levelRange: { min: 2, max: 3 },
      targetPages: 12,
      summary: 'Party enters the forest.',
      keyEntities: [],
      sections: [],
    },
  ],
  appendices: [
    {
      slug: 'monster-index',
      title: 'Monster Index',
      targetPages: 5,
      sourceEntityTypes: ['npc'],
      summary: 'All monsters.',
    },
  ],
  totalPageEstimate: 27,
};

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `asm-test-${Date.now()}@test.com`,
      displayName: `Asm Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: { title: 'Assembly Test Project', userId: testUser.id },
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Assembler — buildManifestDocuments', () => {
  it('orders chapters then appendices with correct kinds', () => {
    const keys = new Set(['chapter-draft-goblin-ambush', 'chapter-draft-dark-forest', 'appendix-draft-monster-index']);
    const docs = buildManifestDocuments(SAMPLE_OUTLINE, keys);

    expect(docs).toHaveLength(3);
    expect(docs[0].kind).toBe('chapter');
    expect(docs[0].documentSlug).toBe('goblin-ambush');
    expect(docs[0].sortOrder).toBe(0);
    expect(docs[1].kind).toBe('chapter');
    expect(docs[1].documentSlug).toBe('dark-forest');
    expect(docs[1].sortOrder).toBe(1);
    expect(docs[2].kind).toBe('appendix');
    expect(docs[2].documentSlug).toBe('monster-index');
    expect(docs[2].sortOrder).toBe(2);
  });

  it('includes front matter when present', () => {
    const keys = new Set(['front-matter', 'chapter-draft-goblin-ambush']);
    const docs = buildManifestDocuments(SAMPLE_OUTLINE, keys);

    expect(docs[0].kind).toBe('front_matter');
    expect(docs[0].documentSlug).toBe('front-matter');
    expect(docs[1].kind).toBe('chapter');
  });

  it('includes chapter even when draft key is missing', () => {
    const keys = new Set<string>();
    const docs = buildManifestDocuments(SAMPLE_OUTLINE, keys);

    // All chapters and appendices still appear
    expect(docs).toHaveLength(3);
    expect(docs[0].documentSlug).toBe('goblin-ambush');
  });
});

describe('Assembler — assembleDocuments', () => {
  it('creates manifest and ProjectDocuments from accepted artifacts', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test assembly',
    });

    // Create accepted outline artifact
    await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_outline',
        artifactKey: 'chapter-outline',
        status: 'accepted',
        version: 1,
        title: 'Outline',
        jsonContent: SAMPLE_OUTLINE as any,
      },
    });

    // Create accepted chapter draft
    await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'chapter-draft-goblin-ambush',
        status: 'accepted',
        version: 1,
        title: 'The Goblin Ambush',
        tiptapContent: { type: 'doc', content: [{ type: 'paragraph' }] } as any,
        jsonContent: { wordCount: 2500 } as any,
      },
    });

    const result = await assembleDocuments(run!);

    expect(result.manifestId).toBeDefined();
    // 2 chapters + 1 appendix = 3 documents
    expect(result.documentIds).toHaveLength(3);

    // Verify manifest
    const manifest = await prisma.assemblyManifest.findUnique({ where: { id: result.manifestId } });
    expect(manifest).not.toBeNull();
    expect(manifest!.status).toBe('assembled');

    // Verify documents created
    const docs = await prisma.projectDocument.findMany({
      where: { runId: run!.id },
      orderBy: { sortOrder: 'asc' },
    });
    expect(docs).toHaveLength(3);
    expect(docs[0].kind).toBe('chapter');
    expect(docs[0].slug).toBe('goblin-ambush');
    expect(docs[0].sourceArtifactId).not.toBeNull();
    expect(docs[1].kind).toBe('chapter');
    expect(docs[1].slug).toBe('dark-forest');
  });

  it('throws when no accepted outline exists', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'no outline test',
    });

    await expect(assembleDocuments(run!)).rejects.toThrow('No accepted chapter outline found');
  });
});
```

**Step 2: Run tests**

Run: `cd /home/gallison/workspace/DND_booker/server && npx vitest run src/__tests__/generation/assembler.test.ts`
Expected: All 5 tests PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/__tests__/generation/assembler.test.ts
git commit -m "test: add assembler service tests"
```

---

### Task 4: Preflight Tests

**Files:**
- Create: `server/src/__tests__/generation/preflight.test.ts`

**Step 1: Write the preflight tests**

Tests cover:
1. Returns error when no outline exists
2. Detects missing chapters
3. Passes when all chapters present
4. Detects duplicate slugs (create docs manually, check result)

```typescript
// server/src/__tests__/generation/preflight.test.ts
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import type { ChapterOutline } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { runPreflight } from '../../services/generation/preflight.service.js';
import { createRun } from '../../services/generation/run.service.js';

vi.mock('../../services/generation/pubsub.service.js', () => ({
  publishGenerationEvent: vi.fn(),
}));

let testUser: { id: string };
let testProject: { id: string };

const SAMPLE_OUTLINE: ChapterOutline = {
  chapters: [
    {
      slug: 'ch-one',
      title: 'Chapter One',
      act: 1,
      sortOrder: 0,
      levelRange: { min: 1, max: 2 },
      targetPages: 10,
      summary: 'First chapter.',
      keyEntities: [],
      sections: [],
    },
    {
      slug: 'ch-two',
      title: 'Chapter Two',
      act: 1,
      sortOrder: 1,
      levelRange: { min: 2, max: 3 },
      targetPages: 8,
      summary: 'Second chapter.',
      keyEntities: [],
      sections: [],
    },
  ],
  appendices: [],
  totalPageEstimate: 18,
};

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `preflight-test-${Date.now()}@test.com`,
      displayName: `Preflight Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: { title: 'Preflight Test Project', userId: testUser.id },
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Preflight Service', () => {
  it('returns error when no accepted outline exists', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'no outline',
    });

    const result = await runPreflight(run!);

    expect(result.passed).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'NO_OUTLINE', severity: 'error' }),
    );
  });

  it('detects missing chapters', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'missing chapters',
    });

    // Create outline
    await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_outline',
        artifactKey: 'chapter-outline',
        status: 'accepted',
        version: 1,
        title: 'Outline',
        jsonContent: SAMPLE_OUTLINE as any,
      },
    });

    // Create only one of the two expected documents
    await prisma.projectDocument.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        kind: 'chapter',
        title: 'Chapter One',
        slug: 'ch-one',
        sortOrder: 0,
        content: {} as any,
      },
    });

    const result = await runPreflight(run!);

    expect(result.passed).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'MISSING_CHAPTER', documentSlug: 'ch-two' }),
    );
    expect(result.stats.chaptersExpected).toBe(2);
    expect(result.stats.chaptersFound).toBe(1);
  });

  it('passes when all chapters present', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'all present',
    });

    await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_outline',
        artifactKey: 'chapter-outline',
        status: 'accepted',
        version: 1,
        title: 'Outline',
        jsonContent: SAMPLE_OUTLINE as any,
      },
    });

    // Create both documents
    await prisma.projectDocument.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        kind: 'chapter',
        title: 'Chapter One',
        slug: 'ch-one',
        sortOrder: 0,
        targetPageCount: 10,
        content: {} as any,
      },
    });
    await prisma.projectDocument.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        kind: 'chapter',
        title: 'Chapter Two',
        slug: 'ch-two',
        sortOrder: 1,
        targetPageCount: 8,
        content: {} as any,
      },
    });

    const result = await runPreflight(run!);

    expect(result.passed).toBe(true);
    expect(result.stats.documentsCreated).toBe(2);
    expect(result.stats.chaptersFound).toBe(2);
    expect(result.stats.totalPageEstimate).toBe(18);
  });
});
```

**Step 2: Run tests**

Run: `cd /home/gallison/workspace/DND_booker/server && npx vitest run src/__tests__/generation/preflight.test.ts`
Expected: All 3 tests PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/__tests__/generation/preflight.test.ts
git commit -m "test: add preflight service tests"
```

---

### Task 5: Integration Verification

**Files:**
- No new files

**Step 1: Run full server type check**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 2: Run all generation tests**

Run: `cd /home/gallison/workspace/DND_booker/server && npx vitest run src/__tests__/generation/`
Expected: All tests PASS (previous 86 + new 8 = 94 passing, plus 1 pre-existing pubsub timeout)
