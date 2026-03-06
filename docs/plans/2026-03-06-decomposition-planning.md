# Phase 5: Decomposition + Planning Artifacts — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn a campaign bible into a detailed chapter outline and per-chapter plans with section specs — the decomposition step that bridges planning to prose generation.

**Architecture:** Two services (`outline.service.ts`, `chapter-plan.service.ts`) following the Phase 4 pattern: accept `LanguageModel` + pipeline inputs, call `generateText()`, validate with Zod, persist artifacts via Prisma, publish progress events. The outline service produces a single `chapter_outline` artifact. The chapter plan service produces one `chapter_plan` artifact per chapter, each with detailed section specs including block types needed, entity references, and encounter specs.

**Tech Stack:** Vercel AI SDK (`generateText`), Prisma 6, Zod, Redis pub/sub, vitest

**Depends on:** Phase 4 (intake + campaign bible)

---

## Context for the Implementer

### Established patterns from Phase 4

All generation services follow this structure:

```typescript
import { generateText, type LanguageModel } from 'ai';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';

// 1. Define Zod schema for AI response validation
// 2. Export result interface
// 3. Export async execute function that:
//    a. Builds system + user prompts
//    b. Calls generateText({ model, system, prompt, maxOutputTokens })
//    c. Parses JSON with parseJsonResponse() (strips markdown fences)
//    d. Validates with Zod schema
//    e. Creates artifact(s) in DB
//    f. Updates run actualTokens with { increment: totalTokens }
//    g. Publishes progress events
//    h. Returns result
```

Token usage: `(usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0)` (Vercel AI SDK property names).

### Test patterns

```typescript
vi.mock('ai', () => ({ generateText: vi.fn() }));
vi.mock('../../services/generation/pubsub.service.js', () => ({
  publishGenerationEvent: vi.fn(),
}));
// User: { email, displayName, passwordHash }
// Prisma from: '../../config/database.js'
// createRun from: '../../services/generation/run.service.js'
```

### Test commands

```bash
cd /home/gallison/workspace/DND_booker/server
REDIS_HOST=localhost REDIS_PORT=6380 REDIS_PASSWORD=dev-redis-password npx vitest run src/__tests__/generation/<file>.test.ts
```

### Pipeline flow

```
NormalizedInput (from intake)
  ↓
CampaignBible (from bible service) — has pageBudget, actStructure, entities
  ↓
ChapterOutline (THIS PHASE) — formal outline with sections, appendices
  ↓
ChapterPlan[] (THIS PHASE) — one per chapter, detailed section specs
```

---

## Task 1: Add ChapterOutline + ChapterPlan shared types

**Files:**
- Create: `shared/src/types/chapter-outline.ts`
- Create: `shared/src/types/chapter-plan.ts`
- Modify: `shared/src/index.ts`

### Step 1: Create the ChapterOutline types

Create `shared/src/types/chapter-outline.ts`:

```typescript
/** One section in a chapter outline. */
export interface SectionOutlineEntry {
  slug: string;
  title: string;
  sortOrder: number;
  targetPages: number;
  contentType: 'narrative' | 'encounter' | 'exploration' | 'social' | 'transition';
  summary: string;
}

/** One chapter in the outline. */
export interface ChapterOutlineEntry {
  slug: string;
  title: string;
  act: number;
  sortOrder: number;
  levelRange: { min: number; max: number };
  targetPages: number;
  summary: string;
  keyEntities: string[];
  sections: SectionOutlineEntry[];
}

/** One appendix in the outline. */
export interface AppendixOutlineEntry {
  slug: string;
  title: string;
  targetPages: number;
  sourceEntityTypes: string[];
  summary: string;
}

/** Full chapter outline — the structured output from the outline service. */
export interface ChapterOutline {
  chapters: ChapterOutlineEntry[];
  appendices: AppendixOutlineEntry[];
  totalPageEstimate: number;
}
```

### Step 2: Create the ChapterPlan types

Create `shared/src/types/chapter-plan.ts`:

```typescript
/** Specification for one encounter in a chapter. */
export interface EncounterSpec {
  name: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'deadly';
  enemies: { name: string; count: number; cr: string }[];
  environment: string;
  tactics: string;
  rewards: string[];
}

/** Specification for one section within a chapter plan. */
export interface SectionSpec {
  slug: string;
  title: string;
  contentType: 'narrative' | 'encounter' | 'exploration' | 'social' | 'transition';
  targetWords: number;
  outline: string;
  keyBeats: string[];
  entityReferences: string[];
  blocksNeeded: string[];
}

/** Detailed plan for one chapter — produced by the chapter plan service. */
export interface ChapterPlan {
  chapterSlug: string;
  chapterTitle: string;
  sections: SectionSpec[];
  encounters: EncounterSpec[];
  entityReferences: string[];
  readAloudCount: number;
  dmTipCount: number;
  difficultyProgression: string;
}
```

### Step 3: Export from shared/src/index.ts

Read the file first, then add:

```typescript
export * from './types/chapter-outline.js';
export * from './types/chapter-plan.js';
```

### Step 4: Verify types compile

Run: `npm run typecheck --workspace=shared`
Expected: PASS

### Step 5: Commit

```bash
git add shared/src/types/chapter-outline.ts shared/src/types/chapter-plan.ts shared/src/index.ts
git commit -m "feat: add ChapterOutline and ChapterPlan shared types"
```

---

## Task 2: Outline service — prompt, tests, implementation

**Files:**
- Create: `server/src/services/generation/prompts/chapter-outline.prompt.ts`
- Create: `server/src/__tests__/generation/outline.test.ts`
- Create: `server/src/services/generation/outline.service.ts`

### Step 1: Create the prompt builder

Create `server/src/services/generation/prompts/chapter-outline.prompt.ts`:

```typescript
import type { BibleContent } from '@dnd-booker/shared';

export function buildChapterOutlineSystemPrompt(): string {
  return `You are a D&D content architect. You create detailed chapter outlines from a campaign bible. The outline defines the exact structure that prose writers will follow.

You MUST respond with ONLY a JSON object (no markdown fences, no commentary). The JSON must match this schema:

{
  "chapters": [
    {
      "slug": "chapter-1-the-village",
      "title": "Chapter 1: The Village",
      "act": 1,
      "sortOrder": 1,
      "levelRange": { "min": 1, "max": 3 },
      "targetPages": 12,
      "summary": "2-3 sentences describing this chapter's role in the adventure",
      "keyEntities": ["elder-mara", "millbrook-village"],
      "sections": [
        {
          "slug": "arrival-at-the-village",
          "title": "Arrival at the Village",
          "sortOrder": 1,
          "targetPages": 3,
          "contentType": "narrative | encounter | exploration | social | transition",
          "summary": "1-2 sentences about this section"
        }
      ]
    }
  ],
  "appendices": [
    {
      "slug": "appendix-a-npcs",
      "title": "Appendix A: NPCs",
      "targetPages": 4,
      "sourceEntityTypes": ["npc"],
      "summary": "Compiled NPC roster with stat blocks"
    }
  ],
  "totalPageEstimate": 120
}

Rules:
- Chapter slugs must match the bible's pageBudget slugs where they exist
- Section page targets within a chapter must sum to the chapter's targetPages
- Total page estimate must be within 10% of the bible's target
- Every entity referenced in keyEntities must exist in the bible's entities
- Content types: narrative (story/description), encounter (combat), exploration (dungeon/hex), social (roleplay/dialogue), transition (travel/summary)
- Each chapter needs 2-6 sections
- Appendices: include NPC appendix if 4+ NPCs, item appendix if 3+ items, monster appendix if encounters exist
- Sort order must be sequential starting from 1
- One-shots: 2-5 chapters, 0-1 appendices
- Modules: 4-8 chapters, 1-2 appendices
- Campaigns: 8-15 chapters, 2-4 appendices
- Sourcebooks: 10-20 chapters, 3-6 appendices`;
}

export function buildChapterOutlineUserPrompt(bible: BibleContent): string {
  const parts = [
    `Title: "${bible.title}"`,
    `Premise: ${bible.premise}`,
    `Total target pages: ${bible.pageBudget.reduce((sum, ch) => sum + ch.targetPages, 0)}`,
    '',
    'Act Structure:',
    ...bible.actStructure.map(a =>
      `  Act ${a.act}: "${a.title}" — ${a.summary} (levels ${a.levelRange.min}-${a.levelRange.max}, chapters: ${a.chapterSlugs.join(', ')})`
    ),
    '',
    'Page Budget from Bible:',
    ...bible.pageBudget.map(ch =>
      `  ${ch.slug}: "${ch.title}" — ${ch.targetPages} pages, sections: [${ch.sections.join(', ')}]`
    ),
    '',
    'Entities:',
    ...bible.entities.map(e =>
      `  [${e.entityType}] ${e.name} (${e.slug}): ${e.summary}`
    ),
    '',
    `Style: ${bible.styleGuide.voice}`,
    `Open threads: ${bible.openThreads.join(', ') || 'none'}`,
  ];

  return parts.join('\n');
}
```

### Step 2: Write the tests

Create `server/src/__tests__/generation/outline.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { generateText } from 'ai';
import type { BibleContent, ChapterOutline } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { executeOutlineGeneration } from '../../services/generation/outline.service.js';
import { createRun } from '../../services/generation/run.service.js';

vi.mock('ai', () => ({ generateText: vi.fn() }));
vi.mock('../../services/generation/pubsub.service.js', () => ({
  publishGenerationEvent: vi.fn(),
}));
const mockGenerateText = vi.mocked(generateText);

let testUser: { id: string };
let testProject: { id: string };

const SAMPLE_BIBLE: BibleContent = {
  title: 'The Goblin Caves',
  summary: 'A one-shot goblin adventure.',
  premise: 'Clear the goblin caves.',
  worldRules: {
    setting: 'Fantasy', era: 'Medieval', magicLevel: 'standard',
    technologyLevel: 'medieval', toneDescriptors: ['classic'],
    forbiddenElements: [], worldSpecificRules: [],
  },
  actStructure: [
    { act: 1, title: 'The Village', summary: 'Arrive and learn.', levelRange: { min: 3, max: 3 }, chapterSlugs: ['ch-1'] },
    { act: 2, title: 'The Caves', summary: 'Explore and fight.', levelRange: { min: 4, max: 5 }, chapterSlugs: ['ch-2', 'ch-3'] },
  ],
  timeline: [{ order: 1, event: 'Goblins arrive', timeframe: '1 month ago', significance: 'Origin' }],
  levelProgression: { type: 'milestone', milestones: ['Level 4 after ch-1'] },
  pageBudget: [
    { slug: 'ch-1', title: 'Chapter 1: The Village', targetPages: 3, sections: ['Arrival', 'The Elder'] },
    { slug: 'ch-2', title: 'Chapter 2: Upper Caves', targetPages: 5, sections: ['Entry', 'Traps', 'Patrol'] },
    { slug: 'ch-3', title: 'Chapter 3: Throne Room', targetPages: 4, sections: ['Approach', 'Boss Fight'] },
  ],
  styleGuide: {
    voice: 'Adventurous', vocabulary: [], avoidTerms: [],
    narrativePerspective: 'second person', toneNotes: '',
  },
  openThreads: [],
  entities: [
    { entityType: 'npc', name: 'Chief Gnarltooth', slug: 'chief-gnarltooth', summary: 'Goblin chief.', details: {} },
    { entityType: 'location', name: 'The Caves', slug: 'the-caves', summary: 'Goblin lair.', details: {} },
  ],
};

const VALID_OUTLINE: ChapterOutline = {
  chapters: [
    {
      slug: 'ch-1', title: 'Chapter 1: The Village', act: 1, sortOrder: 1,
      levelRange: { min: 3, max: 3 }, targetPages: 3, summary: 'Adventurers arrive.',
      keyEntities: ['the-caves'],
      sections: [
        { slug: 'arrival', title: 'Arrival', sortOrder: 1, targetPages: 1, contentType: 'narrative', summary: 'PCs arrive.' },
        { slug: 'the-elder', title: 'The Elder', sortOrder: 2, targetPages: 2, contentType: 'social', summary: 'Meet the elder.' },
      ],
    },
    {
      slug: 'ch-2', title: 'Chapter 2: Upper Caves', act: 2, sortOrder: 2,
      levelRange: { min: 4, max: 4 }, targetPages: 5, summary: 'Exploring the caves.',
      keyEntities: ['the-caves'],
      sections: [
        { slug: 'entry', title: 'Entry', sortOrder: 1, targetPages: 1, contentType: 'exploration', summary: 'Enter the caves.' },
        { slug: 'traps', title: 'Traps', sortOrder: 2, targetPages: 2, contentType: 'exploration', summary: 'Navigate traps.' },
        { slug: 'patrol', title: 'Patrol', sortOrder: 3, targetPages: 2, contentType: 'encounter', summary: 'Fight goblin patrol.' },
      ],
    },
    {
      slug: 'ch-3', title: 'Chapter 3: Throne Room', act: 2, sortOrder: 3,
      levelRange: { min: 4, max: 5 }, targetPages: 4, summary: 'Final confrontation.',
      keyEntities: ['chief-gnarltooth'],
      sections: [
        { slug: 'approach', title: 'The Approach', sortOrder: 1, targetPages: 1, contentType: 'narrative', summary: 'Approach the throne.' },
        { slug: 'boss-fight', title: 'Boss Fight', sortOrder: 2, targetPages: 3, contentType: 'encounter', summary: 'Fight the chief.' },
      ],
    },
  ],
  appendices: [],
  totalPageEstimate: 12,
};

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `outline-test-${Date.now()}@test.com`,
      displayName: `Outline Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: { title: 'Outline Test Project', userId: testUser.id },
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
  await prisma.$disconnect();
});

beforeEach(() => { vi.clearAllMocks(); });

describe('Outline Service — executeOutlineGeneration', () => {
  it('should create a chapter_outline artifact from valid AI response', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_OUTLINE),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    const result = await executeOutlineGeneration(run!, SAMPLE_BIBLE, {} as any, 8192);

    expect(result.outline.chapters.length).toBe(3);
    expect(result.outline.totalPageEstimate).toBe(12);

    const artifact = await prisma.generatedArtifact.findFirst({
      where: { runId: run!.id, artifactType: 'chapter_outline' },
    });
    expect(artifact).not.toBeNull();
    expect(artifact!.status).toBe('generated');
    expect(artifact!.artifactKey).toBe('chapter-outline');
  });

  it('should include bible context in the AI prompt', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_OUTLINE),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    await executeOutlineGeneration(run!, SAMPLE_BIBLE, {} as any, 8192);

    const call = mockGenerateText.mock.calls[0][0];
    expect(call.prompt).toContain('The Goblin Caves');
    expect(call.prompt).toContain('ch-1');
    expect(call.prompt).toContain('chief-gnarltooth');
  });

  it('should update run token count', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_OUTLINE),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    await executeOutlineGeneration(run!, SAMPLE_BIBLE, {} as any, 8192);

    const updated = await prisma.generationRun.findUnique({ where: { id: run!.id } });
    expect(updated!.actualTokens).toBe(2000);
  });

  it('should throw on malformed AI response', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'not json', usage: { inputTokens: 100, outputTokens: 50 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    await expect(executeOutlineGeneration(run!, SAMPLE_BIBLE, {} as any, 8192)).rejects.toThrow();
  });

  it('should handle appendices in the outline', async () => {
    const outlineWithAppendices: ChapterOutline = {
      ...VALID_OUTLINE,
      appendices: [{
        slug: 'appendix-a-npcs', title: 'Appendix A: NPCs',
        targetPages: 2, sourceEntityTypes: ['npc'], summary: 'NPC roster.',
      }],
    };

    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(outlineWithAppendices),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    const result = await executeOutlineGeneration(run!, SAMPLE_BIBLE, {} as any, 8192);
    expect(result.outline.appendices.length).toBe(1);
    expect(result.outline.appendices[0].slug).toBe('appendix-a-npcs');
  });
});
```

### Step 3: Write the implementation

Create `server/src/services/generation/outline.service.ts`:

```typescript
import { generateText, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { BibleContent, ChapterOutline } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import {
  buildChapterOutlineSystemPrompt,
  buildChapterOutlineUserPrompt,
} from './prompts/chapter-outline.prompt.js';

const SectionOutlineSchema = z.object({
  slug: z.string(),
  title: z.string(),
  sortOrder: z.number(),
  targetPages: z.number(),
  contentType: z.enum(['narrative', 'encounter', 'exploration', 'social', 'transition']),
  summary: z.string(),
});

const ChapterOutlineEntrySchema = z.object({
  slug: z.string(),
  title: z.string(),
  act: z.number(),
  sortOrder: z.number(),
  levelRange: z.object({ min: z.number(), max: z.number() }),
  targetPages: z.number(),
  summary: z.string(),
  keyEntities: z.array(z.string()),
  sections: z.array(SectionOutlineSchema),
});

const AppendixOutlineSchema = z.object({
  slug: z.string(),
  title: z.string(),
  targetPages: z.number(),
  sourceEntityTypes: z.array(z.string()),
  summary: z.string(),
});

const ChapterOutlineSchema = z.object({
  chapters: z.array(ChapterOutlineEntrySchema),
  appendices: z.array(AppendixOutlineSchema),
  totalPageEstimate: z.number(),
});

export interface OutlineResult {
  outline: ChapterOutline;
  artifactId: string;
}

export async function executeOutlineGeneration(
  run: { id: string; projectId: string },
  bible: BibleContent,
  model: LanguageModel,
  maxOutputTokens: number,
): Promise<OutlineResult> {
  const system = buildChapterOutlineSystemPrompt();
  const prompt = buildChapterOutlineUserPrompt(bible);

  const { text, usage } = await generateText({
    model, system, prompt, maxOutputTokens,
  });

  const parsed = parseJsonResponse(text);
  const outline = ChapterOutlineSchema.parse(parsed) as ChapterOutline;

  const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

  const artifact = await prisma.generatedArtifact.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'chapter_outline',
      artifactKey: 'chapter-outline',
      status: 'generated',
      version: 1,
      title: `${bible.title} — Chapter Outline`,
      summary: `${outline.chapters.length} chapters, ${outline.appendices.length} appendices, ~${outline.totalPageEstimate} pages`,
      jsonContent: outline as any,
      tokenCount: totalTokens,
      pageEstimate: outline.totalPageEstimate,
    },
  });

  await prisma.generationRun.update({
    where: { id: run.id },
    data: { actualTokens: { increment: totalTokens } },
  });

  await publishGenerationEvent(run.id, {
    type: 'artifact_created',
    runId: run.id,
    artifactId: artifact.id,
    artifactType: 'chapter_outline',
    title: artifact.title,
    version: 1,
  });

  return { outline, artifactId: artifact.id };
}

function parseJsonResponse(text: string): unknown {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    cleaned = cleaned.slice(firstNewline + 1);
    const lastFence = cleaned.lastIndexOf('```');
    if (lastFence > 0) cleaned = cleaned.slice(0, lastFence);
    cleaned = cleaned.trim();
  }
  return JSON.parse(cleaned);
}
```

### Step 4: Run tests

Run: `cd server && REDIS_HOST=localhost REDIS_PORT=6380 REDIS_PASSWORD=dev-redis-password npx vitest run src/__tests__/generation/outline.test.ts`
Expected: 5 tests PASS

### Step 5: Commit

```bash
git add server/src/services/generation/prompts/chapter-outline.prompt.ts server/src/__tests__/generation/outline.test.ts server/src/services/generation/outline.service.ts
git commit -m "feat: add chapter outline service with prompt builder and tests"
```

---

## Task 3: Chapter plan service — prompt, tests, implementation

**Files:**
- Create: `server/src/services/generation/prompts/chapter-plan.prompt.ts`
- Create: `server/src/__tests__/generation/chapter-plan.test.ts`
- Create: `server/src/services/generation/chapter-plan.service.ts`

### Step 1: Create the prompt builder

Create `server/src/services/generation/prompts/chapter-plan.prompt.ts`:

```typescript
import type { BibleContent, ChapterOutlineEntry } from '@dnd-booker/shared';

export function buildChapterPlanSystemPrompt(): string {
  return `You are a D&D content architect. You create detailed chapter plans that prose writers will follow to write chapter drafts. Each plan specifies exact sections, encounters, entity references, and content blocks needed.

You MUST respond with ONLY a JSON object (no markdown fences, no commentary). The JSON must match this schema:

{
  "chapterSlug": "ch-1-the-village",
  "chapterTitle": "Chapter 1: The Village",
  "sections": [
    {
      "slug": "arrival",
      "title": "Arrival at the Village",
      "contentType": "narrative | encounter | exploration | social | transition",
      "targetWords": 800,
      "outline": "2-3 sentences describing exactly what this section covers",
      "keyBeats": ["PCs arrive via the forest road", "First signs of goblin damage"],
      "entityReferences": ["millbrook-village", "elder-mara"],
      "blocksNeeded": ["readAloud", "dmTips"]
    }
  ],
  "encounters": [
    {
      "name": "Goblin Patrol",
      "difficulty": "easy | medium | hard | deadly",
      "enemies": [{ "name": "Goblin", "count": 4, "cr": "1/4" }],
      "environment": "Forest clearing near the cave entrance",
      "tactics": "Goblins try to ambush from the trees",
      "rewards": ["10 gp each", "Crude map of the caves"]
    }
  ],
  "entityReferences": ["elder-mara", "millbrook-village"],
  "readAloudCount": 3,
  "dmTipCount": 2,
  "difficultyProgression": "Starts easy with social encounters, builds to a medium combat"
}

blocksNeeded options (D&D editor block types):
- readAloud: boxed text for the DM to read aloud
- dmTips: DM advice/strategy boxes
- statBlock: creature stat blocks
- encounterTable: encounter details
- npcProfile: NPC reference card
- magicItem: magic item card
- spellCard: spell reference
- randomTable: random encounter/loot table

Rules:
- targetWords per section: narrative 600-1200, encounter 800-1500, exploration 600-1000, social 400-800, transition 200-400
- Every encounter section MUST have a matching encounter spec
- entityReferences must use slugs from the campaign bible
- readAloudCount: 1-2 per narrative section, 1 per encounter
- dmTipCount: 1-2 per chapter
- Difficulty should escalate within the chapter and across the adventure`;
}

export function buildChapterPlanUserPrompt(
  chapter: ChapterOutlineEntry,
  bible: BibleContent,
  entitySummaries: { slug: string; entityType: string; name: string; summary: string }[],
): string {
  const parts = [
    `Chapter: "${chapter.title}" (${chapter.slug})`,
    `Act: ${chapter.act}`,
    `Level range: ${chapter.levelRange.min}-${chapter.levelRange.max}`,
    `Target pages: ${chapter.targetPages}`,
    `Summary: ${chapter.summary}`,
    '',
    'Sections from outline:',
    ...chapter.sections.map(s =>
      `  ${s.sortOrder}. "${s.title}" (${s.contentType}, ${s.targetPages} pages) — ${s.summary}`
    ),
    '',
    `World tone: ${bible.styleGuide.voice}`,
    `Setting: ${bible.worldRules.setting}`,
    '',
    'Available entities:',
    ...entitySummaries.map(e => `  [${e.entityType}] ${e.name} (${e.slug}): ${e.summary}`),
    '',
    `Key entities for this chapter: ${chapter.keyEntities.join(', ')}`,
  ];

  return parts.join('\n');
}
```

### Step 2: Write the tests

Create `server/src/__tests__/generation/chapter-plan.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { generateText } from 'ai';
import type { BibleContent, ChapterOutlineEntry, ChapterPlan } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { executeChapterPlanGeneration } from '../../services/generation/chapter-plan.service.js';
import { createRun } from '../../services/generation/run.service.js';

vi.mock('ai', () => ({ generateText: vi.fn() }));
vi.mock('../../services/generation/pubsub.service.js', () => ({
  publishGenerationEvent: vi.fn(),
}));
const mockGenerateText = vi.mocked(generateText);

let testUser: { id: string };
let testProject: { id: string };

const SAMPLE_BIBLE: BibleContent = {
  title: 'The Goblin Caves', summary: 'Adventure.', premise: 'Clear caves.',
  worldRules: {
    setting: 'Fantasy', era: 'Medieval', magicLevel: 'standard',
    technologyLevel: 'medieval', toneDescriptors: ['classic'],
    forbiddenElements: [], worldSpecificRules: [],
  },
  actStructure: [{ act: 1, title: 'Act 1', summary: 'Begin.', levelRange: { min: 3, max: 5 }, chapterSlugs: ['ch-1'] }],
  timeline: [], levelProgression: null,
  pageBudget: [{ slug: 'ch-1', title: 'Chapter 1', targetPages: 5, sections: ['Arrival', 'Fight'] }],
  styleGuide: { voice: 'Adventurous', vocabulary: [], avoidTerms: [], narrativePerspective: 'second person', toneNotes: '' },
  openThreads: [],
  entities: [
    { entityType: 'npc', name: 'Chief Gnarltooth', slug: 'chief-gnarltooth', summary: 'Goblin chief.', details: {} },
  ],
};

const SAMPLE_CHAPTER: ChapterOutlineEntry = {
  slug: 'ch-1', title: 'Chapter 1: The Village', act: 1, sortOrder: 1,
  levelRange: { min: 3, max: 3 }, targetPages: 5, summary: 'Arrive and explore.',
  keyEntities: ['chief-gnarltooth'],
  sections: [
    { slug: 'arrival', title: 'Arrival', sortOrder: 1, targetPages: 2, contentType: 'narrative', summary: 'PCs arrive.' },
    { slug: 'ambush', title: 'Goblin Ambush', sortOrder: 2, targetPages: 3, contentType: 'encounter', summary: 'Surprise attack.' },
  ],
};

const VALID_PLAN: ChapterPlan = {
  chapterSlug: 'ch-1',
  chapterTitle: 'Chapter 1: The Village',
  sections: [
    {
      slug: 'arrival', title: 'Arrival', contentType: 'narrative', targetWords: 800,
      outline: 'The party arrives at the village and sees signs of recent goblin attacks.',
      keyBeats: ['PCs arrive', 'See damaged buildings', 'Meet villagers'],
      entityReferences: ['chief-gnarltooth'],
      blocksNeeded: ['readAloud', 'dmTips'],
    },
    {
      slug: 'ambush', title: 'Goblin Ambush', contentType: 'encounter', targetWords: 1200,
      outline: 'Goblins ambush the party at the village outskirts.',
      keyBeats: ['Goblins attack from cover', 'Villagers flee', 'Chief watches from afar'],
      entityReferences: ['chief-gnarltooth'],
      blocksNeeded: ['readAloud', 'encounterTable', 'statBlock'],
    },
  ],
  encounters: [
    {
      name: 'Goblin Ambush',
      difficulty: 'medium',
      enemies: [{ name: 'Goblin', count: 6, cr: '1/4' }],
      environment: 'Village outskirts, scattered barricades',
      tactics: 'Goblins use hit-and-run from cover.',
      rewards: ['15 gp', 'Crude cave map'],
    },
  ],
  entityReferences: ['chief-gnarltooth'],
  readAloudCount: 2,
  dmTipCount: 1,
  difficultyProgression: 'Starts with peaceful exploration, escalates to medium combat.',
};

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `chplan-test-${Date.now()}@test.com`,
      displayName: `ChPlan Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: { title: 'ChPlan Test Project', userId: testUser.id },
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
  await prisma.$disconnect();
});

beforeEach(() => { vi.clearAllMocks(); });

describe('Chapter Plan Service — executeChapterPlanGeneration', () => {
  it('should create a chapter_plan artifact from valid AI response', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_PLAN),
      usage: { inputTokens: 1000, outputTokens: 1500 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    const result = await executeChapterPlanGeneration(
      run!, SAMPLE_CHAPTER, SAMPLE_BIBLE,
      SAMPLE_BIBLE.entities.map(e => ({ slug: e.slug, entityType: e.entityType, name: e.name, summary: e.summary })),
      {} as any, 8192,
    );

    expect(result.plan.chapterSlug).toBe('ch-1');
    expect(result.plan.sections.length).toBe(2);
    expect(result.plan.encounters.length).toBe(1);

    const artifact = await prisma.generatedArtifact.findFirst({
      where: { runId: run!.id, artifactType: 'chapter_plan' },
    });
    expect(artifact).not.toBeNull();
    expect(artifact!.artifactKey).toBe('chapter-plan-ch-1');
    expect(artifact!.tokenCount).toBe(2500);
  });

  it('should include chapter and entity context in the prompt', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_PLAN),
      usage: { inputTokens: 1000, outputTokens: 1500 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    await executeChapterPlanGeneration(
      run!, SAMPLE_CHAPTER, SAMPLE_BIBLE,
      SAMPLE_BIBLE.entities.map(e => ({ slug: e.slug, entityType: e.entityType, name: e.name, summary: e.summary })),
      {} as any, 8192,
    );

    const call = mockGenerateText.mock.calls[0][0];
    expect(call.prompt).toContain('ch-1');
    expect(call.prompt).toContain('chief-gnarltooth');
    expect(call.prompt).toContain('Arrival');
  });

  it('should update run token count', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_PLAN),
      usage: { inputTokens: 1000, outputTokens: 1500 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    await executeChapterPlanGeneration(
      run!, SAMPLE_CHAPTER, SAMPLE_BIBLE,
      SAMPLE_BIBLE.entities.map(e => ({ slug: e.slug, entityType: e.entityType, name: e.name, summary: e.summary })),
      {} as any, 8192,
    );

    const updated = await prisma.generationRun.findUnique({ where: { id: run!.id } });
    expect(updated!.actualTokens).toBe(2500);
  });

  it('should throw on malformed AI response', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'not json', usage: { inputTokens: 100, outputTokens: 50 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    await expect(
      executeChapterPlanGeneration(
        run!, SAMPLE_CHAPTER, SAMPLE_BIBLE, [], {} as any, 8192,
      ),
    ).rejects.toThrow();
  });

  it('should generate unique artifact keys per chapter', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({ ...VALID_PLAN, chapterSlug: 'ch-2', chapterTitle: 'Chapter 2' }),
      usage: { inputTokens: 1000, outputTokens: 1500 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    const ch2 = { ...SAMPLE_CHAPTER, slug: 'ch-2', title: 'Chapter 2', sortOrder: 2 };
    const result = await executeChapterPlanGeneration(
      run!, ch2, SAMPLE_BIBLE, [], {} as any, 8192,
    );

    const artifact = await prisma.generatedArtifact.findFirst({
      where: { runId: run!.id, artifactType: 'chapter_plan' },
    });
    expect(artifact!.artifactKey).toBe('chapter-plan-ch-2');
  });
});
```

### Step 3: Write the implementation

Create `server/src/services/generation/chapter-plan.service.ts`:

```typescript
import { generateText, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { BibleContent, ChapterOutlineEntry, ChapterPlan } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import {
  buildChapterPlanSystemPrompt,
  buildChapterPlanUserPrompt,
} from './prompts/chapter-plan.prompt.js';

const SectionSpecSchema = z.object({
  slug: z.string(),
  title: z.string(),
  contentType: z.enum(['narrative', 'encounter', 'exploration', 'social', 'transition']),
  targetWords: z.number(),
  outline: z.string(),
  keyBeats: z.array(z.string()),
  entityReferences: z.array(z.string()),
  blocksNeeded: z.array(z.string()),
});

const EncounterSpecSchema = z.object({
  name: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard', 'deadly']),
  enemies: z.array(z.object({ name: z.string(), count: z.number(), cr: z.string() })),
  environment: z.string(),
  tactics: z.string(),
  rewards: z.array(z.string()),
});

const ChapterPlanSchema = z.object({
  chapterSlug: z.string(),
  chapterTitle: z.string(),
  sections: z.array(SectionSpecSchema),
  encounters: z.array(EncounterSpecSchema),
  entityReferences: z.array(z.string()),
  readAloudCount: z.number(),
  dmTipCount: z.number(),
  difficultyProgression: z.string(),
});

export interface ChapterPlanResult {
  plan: ChapterPlan;
  artifactId: string;
}

export async function executeChapterPlanGeneration(
  run: { id: string; projectId: string },
  chapter: ChapterOutlineEntry,
  bible: BibleContent,
  entitySummaries: { slug: string; entityType: string; name: string; summary: string }[],
  model: LanguageModel,
  maxOutputTokens: number,
): Promise<ChapterPlanResult> {
  const system = buildChapterPlanSystemPrompt();
  const prompt = buildChapterPlanUserPrompt(chapter, bible, entitySummaries);

  const { text, usage } = await generateText({
    model, system, prompt, maxOutputTokens,
  });

  const parsed = parseJsonResponse(text);
  const plan = ChapterPlanSchema.parse(parsed) as ChapterPlan;

  const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

  const artifact = await prisma.generatedArtifact.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'chapter_plan',
      artifactKey: `chapter-plan-${chapter.slug}`,
      status: 'generated',
      version: 1,
      title: `Plan: ${chapter.title}`,
      summary: `${plan.sections.length} sections, ${plan.encounters.length} encounters`,
      jsonContent: plan as any,
      tokenCount: totalTokens,
      pageEstimate: chapter.targetPages,
    },
  });

  await prisma.generationRun.update({
    where: { id: run.id },
    data: { actualTokens: { increment: totalTokens } },
  });

  await publishGenerationEvent(run.id, {
    type: 'artifact_created',
    runId: run.id,
    artifactId: artifact.id,
    artifactType: 'chapter_plan',
    title: artifact.title,
    version: 1,
  });

  return { plan, artifactId: artifact.id };
}

function parseJsonResponse(text: string): unknown {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    cleaned = cleaned.slice(firstNewline + 1);
    const lastFence = cleaned.lastIndexOf('```');
    if (lastFence > 0) cleaned = cleaned.slice(0, lastFence);
    cleaned = cleaned.trim();
  }
  return JSON.parse(cleaned);
}
```

### Step 4: Run tests

Run: `cd server && REDIS_HOST=localhost REDIS_PORT=6380 REDIS_PASSWORD=dev-redis-password npx vitest run src/__tests__/generation/chapter-plan.test.ts`
Expected: 5 tests PASS

### Step 5: Commit

```bash
git add server/src/services/generation/prompts/chapter-plan.prompt.ts server/src/__tests__/generation/chapter-plan.test.ts server/src/services/generation/chapter-plan.service.ts
git commit -m "feat: add chapter plan service with encounter specs and tests"
```

---

## Task 4: Extract shared parseJsonResponse utility

The `parseJsonResponse` function is duplicated in intake, bible, outline, and chapter-plan services. Extract it.

**Files:**
- Create: `server/src/services/generation/parse-json.ts`
- Modify: `server/src/services/generation/intake.service.ts`
- Modify: `server/src/services/generation/bible.service.ts`
- Modify: `server/src/services/generation/outline.service.ts`
- Modify: `server/src/services/generation/chapter-plan.service.ts`

### Step 1: Create the utility

Create `server/src/services/generation/parse-json.ts`:

```typescript
/**
 * Parse a JSON response from the AI, handling common issues
 * like markdown fences and trailing text.
 */
export function parseJsonResponse(text: string): unknown {
  let cleaned = text.trim();

  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    cleaned = cleaned.slice(firstNewline + 1);
    const lastFence = cleaned.lastIndexOf('```');
    if (lastFence > 0) cleaned = cleaned.slice(0, lastFence);
    cleaned = cleaned.trim();
  }

  return JSON.parse(cleaned);
}
```

### Step 2: Update all four services

In each service, remove the local `parseJsonResponse` function and add:

```typescript
import { parseJsonResponse } from './parse-json.js';
```

Remove the duplicate function from: `intake.service.ts`, `bible.service.ts`, `outline.service.ts`, `chapter-plan.service.ts`.

### Step 3: Run all generation tests

Run: `cd server && REDIS_HOST=localhost REDIS_PORT=6380 REDIS_PASSWORD=dev-redis-password npx vitest run src/__tests__/generation/`
Expected: All tests PASS

### Step 4: Commit

```bash
git add server/src/services/generation/parse-json.ts server/src/services/generation/intake.service.ts server/src/services/generation/bible.service.ts server/src/services/generation/outline.service.ts server/src/services/generation/chapter-plan.service.ts
git commit -m "refactor: extract parseJsonResponse into shared utility"
```

---

## Task 5: Full integration validation

**Files:** None (verification only)

### Step 1: Run all generation tests

Run: `cd server && REDIS_HOST=localhost REDIS_PORT=6380 REDIS_PASSWORD=dev-redis-password npx vitest run src/__tests__/generation/`
Expected: 60 tests PASS across 9 test files (50 existing + 5 outline + 5 chapter-plan)

### Step 2: Type check

Run: `npm run typecheck --workspace=shared && cd server && npx tsc --noEmit`
Expected: PASS

### Step 3: Run full server suite

Run: `cd server && REDIS_HOST=localhost REDIS_PORT=6380 REDIS_PASSWORD=dev-redis-password npx vitest run`
Expected: Same baseline (311/316 pass, 5 pre-existing)

---

## Summary

| Task | Tests | Files Created | Files Modified |
|------|-------|--------------|----------------|
| 1. Shared types | 0 | `chapter-outline.ts`, `chapter-plan.ts` | `index.ts` |
| 2. Outline service | 5 | prompt, test, service (3 files) | — |
| 3. Chapter plan service | 5 | prompt, test, service (3 files) | — |
| 4. Extract parseJsonResponse | 0 | `parse-json.ts` | 4 services |
| 5. Validation | 0 | — | — |
| **Total** | **10** | **8 files** | **5 files** |
