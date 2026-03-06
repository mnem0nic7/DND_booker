# Phase 7: Chapter Draft Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate chapter prose with full canon context — taking a chapter plan + bible + entity dossiers + prior chapter summaries, producing markdown with D&D blocks (:::readAloud, :::statBlock, etc.), converting to TipTap JSON, and persisting as `chapter_draft` artifacts.

**Architecture:** A context-assembler gathers all needed data (entity dossiers, prior chapter summaries). A prompt builder constructs the AI prompt. The chapter-writer service calls `generateText()`, converts markdown→TipTap via the existing `markdownToTipTap()`, and creates artifacts + CanonReferences.

**Tech Stack:** Vercel AI SDK (`generateText`), Zod, Prisma 6, existing `markdownToTipTap` from `ai-wizard.service.ts`

---

### Task 1: Context Assembler Service

**Files:**
- Create: `server/src/services/generation/context-assembler.service.ts`

**Step 1: Create the context assembler**

This service fetches all context needed for chapter writing: entity dossiers from CanonEntity table and prior chapter draft summaries from GeneratedArtifact table.

```typescript
// server/src/services/generation/context-assembler.service.ts
import type { ChapterPlan } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';

export interface EntityContext {
  slug: string;
  name: string;
  entityType: string;
  summary: string;
  canonicalData: unknown;
}

export interface PriorChapterSummary {
  slug: string;
  title: string;
  summary: string;
}

export interface ChapterWriteContext {
  entityDetails: EntityContext[];
  priorChapterSummaries: PriorChapterSummary[];
}

/**
 * Assemble context for chapter draft generation.
 * Fetches entity dossiers and prior chapter summaries from the database.
 */
export async function assembleChapterContext(
  runId: string,
  projectId: string,
  chapterPlan: ChapterPlan,
  priorChapterSlugs: string[],
): Promise<ChapterWriteContext> {
  // Fetch canon entity details for all referenced entities
  const entitySlugs = chapterPlan.entityReferences;
  const entities = entitySlugs.length > 0
    ? await prisma.canonEntity.findMany({
        where: {
          projectId,
          slug: { in: entitySlugs },
        },
        select: {
          slug: true,
          canonicalName: true,
          entityType: true,
          summary: true,
          canonicalData: true,
        },
      })
    : [];

  // Fetch prior chapter draft summaries for continuity
  const priorSummaries = priorChapterSlugs.length > 0
    ? await prisma.generatedArtifact.findMany({
        where: {
          runId,
          artifactType: 'chapter_draft',
          artifactKey: { in: priorChapterSlugs.map((s) => `chapter-draft-${s}`) },
        },
        select: {
          artifactKey: true,
          title: true,
          summary: true,
        },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  return {
    entityDetails: entities.map((e) => ({
      slug: e.slug,
      name: e.canonicalName,
      entityType: e.entityType,
      summary: e.summary,
      canonicalData: e.canonicalData,
    })),
    priorChapterSummaries: priorSummaries.map((a) => ({
      slug: a.artifactKey.replace('chapter-draft-', ''),
      title: a.title,
      summary: a.summary ?? '',
    })),
  };
}
```

**Step 2: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/services/generation/context-assembler.service.ts
git commit -m "feat: add context assembler service for chapter writing"
```

---

### Task 2: Chapter Draft Prompt Builder

**Files:**
- Create: `server/src/services/generation/prompts/chapter-draft.prompt.ts`

**Step 1: Create the chapter draft prompt builder**

The system prompt instructs the AI to write chapter prose in markdown with `:::blockType` markers for D&D blocks. The user prompt provides the chapter plan, bible context, entity dossiers, and prior chapter summaries.

```typescript
// server/src/services/generation/prompts/chapter-draft.prompt.ts
import type { BibleContent, ChapterPlan, ChapterOutlineEntry } from '@dnd-booker/shared';
import type { EntityContext, PriorChapterSummary } from '../context-assembler.service.js';

export function buildChapterDraftSystemPrompt(): string {
  return `You are a D&D adventure writer. You write chapter prose following a detailed chapter plan. Your output is markdown with special :::blockType markers for D&D editor blocks.

Output rules:
- Write in the specified narrative perspective and voice
- Use markdown headings (## for chapter title, ### for sections)
- Use **bold** for important names, locations, and game terms
- Use *italic* for read-aloud emphasis and flavor text

D&D block markers (use these for special content):
- :::readAloud ... ::: — Boxed text for the DM to read aloud to players
- :::dmTips ... ::: — DM advice and strategy boxes
- :::statBlock {"name":"...", "size":"...", "type":"...", ...} ::: — Creature stat blocks (JSON attrs on first line)
- :::encounterTable {"name":"...", "difficulty":"...", ...} ::: — Encounter details
- :::npcProfile {"name":"...", "race":"...", ...} ::: — NPC reference cards
- :::magicItem {"name":"...", "rarity":"...", ...} ::: — Magic item cards
- :::sidebarCallout ... ::: — Sidebar notes and callouts

Content rules:
- Follow the chapter plan's section order exactly
- Hit the target word count for each section (within 20%)
- Include all read-aloud boxes and DM tips specified in the plan
- Reference entities by their canonical names
- Maintain continuity with prior chapter events
- Include encounter details where the plan specifies encounter sections
- End sections with narrative hooks to the next section
- Do NOT include JSON wrapping — output raw markdown only`;
}

export function buildChapterDraftUserPrompt(
  chapter: ChapterOutlineEntry,
  plan: ChapterPlan,
  bible: BibleContent,
  entityDetails: EntityContext[],
  priorSummaries: PriorChapterSummary[],
): string {
  const parts: string[] = [
    `# Chapter: "${chapter.title}" (${chapter.slug})`,
    `Act: ${chapter.act} | Level range: ${chapter.levelRange.min}–${chapter.levelRange.max}`,
    `Target pages: ${chapter.targetPages}`,
    '',
    '## World Context',
    `Setting: ${bible.worldRules.setting}`,
    `Era: ${bible.worldRules.era}`,
    `Tone: ${bible.worldRules.toneDescriptors.join(', ')}`,
    `Voice: ${bible.styleGuide.voice}`,
    `Perspective: ${bible.styleGuide.narrativePerspective}`,
    `Premise: ${bible.premise}`,
  ];

  if (bible.styleGuide.vocabulary.length > 0) {
    parts.push(`Preferred vocabulary: ${bible.styleGuide.vocabulary.join(', ')}`);
  }
  if (bible.styleGuide.avoidTerms.length > 0) {
    parts.push(`Avoid: ${bible.styleGuide.avoidTerms.join(', ')}`);
  }

  parts.push('', '## Sections to Write');
  for (const section of plan.sections) {
    parts.push(
      `### ${section.title} (${section.contentType}, ~${section.targetWords} words)`,
      `Outline: ${section.outline}`,
      `Key beats: ${section.keyBeats.join('; ')}`,
      `Blocks needed: ${section.blocksNeeded.join(', ') || 'none'}`,
      `Entity references: ${section.entityReferences.join(', ') || 'none'}`,
      '',
    );
  }

  if (plan.encounters.length > 0) {
    parts.push('## Encounters');
    for (const enc of plan.encounters) {
      parts.push(
        `**${enc.name}** (${enc.difficulty})`,
        `Enemies: ${enc.enemies.map((e) => `${e.count}x ${e.name} (CR ${e.cr})`).join(', ')}`,
        `Environment: ${enc.environment}`,
        `Tactics: ${enc.tactics}`,
        `Rewards: ${enc.rewards.join(', ')}`,
        '',
      );
    }
  }

  if (entityDetails.length > 0) {
    parts.push('## Entity Reference');
    for (const entity of entityDetails) {
      parts.push(
        `**${entity.name}** [${entity.entityType}] (${entity.slug})`,
        `${entity.summary}`,
        '',
      );
    }
  }

  if (priorSummaries.length > 0) {
    parts.push('## Prior Chapter Summaries (for continuity)');
    for (const prior of priorSummaries) {
      parts.push(`- **${prior.title}**: ${prior.summary}`);
    }
    parts.push('');
  }

  parts.push(
    `## Instructions`,
    `Write the full chapter prose. Target: ${plan.readAloudCount} read-aloud boxes, ${plan.dmTipCount} DM tips.`,
    `Difficulty progression: ${plan.difficultyProgression}`,
  );

  return parts.join('\n');
}
```

**Step 2: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/services/generation/prompts/chapter-draft.prompt.ts
git commit -m "feat: add chapter draft prompt builder"
```

---

### Task 3: Chapter Writer Service

**Files:**
- Create: `server/src/services/generation/chapter-writer.service.ts`

**Step 1: Create the chapter writer service**

```typescript
// server/src/services/generation/chapter-writer.service.ts
import { generateText, type LanguageModel } from 'ai';
import type { BibleContent, ChapterPlan, ChapterOutlineEntry } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import { markdownToTipTap } from '../ai-wizard.service.js';
import { assembleChapterContext } from './context-assembler.service.js';
import {
  buildChapterDraftSystemPrompt,
  buildChapterDraftUserPrompt,
} from './prompts/chapter-draft.prompt.js';

export interface ChapterDraftResult {
  artifactId: string;
  chapterSlug: string;
  title: string;
  wordCount: number;
}

/**
 * Generate a chapter draft.
 * Assembles context, calls AI for markdown prose, converts to TipTap JSON,
 * creates a chapter_draft artifact with both markdown and TipTap content.
 */
export async function executeChapterDraftGeneration(
  run: { id: string; projectId: string },
  chapter: ChapterOutlineEntry,
  plan: ChapterPlan,
  bible: BibleContent,
  priorChapterSlugs: string[],
  model: LanguageModel,
  maxOutputTokens: number,
): Promise<ChapterDraftResult> {
  // Assemble context (entity dossiers + prior chapter summaries)
  const context = await assembleChapterContext(
    run.id,
    run.projectId,
    plan,
    priorChapterSlugs,
  );

  const system = buildChapterDraftSystemPrompt();
  const prompt = buildChapterDraftUserPrompt(
    chapter,
    plan,
    bible,
    context.entityDetails,
    context.priorChapterSummaries,
  );

  const { text, usage } = await generateText({
    model, system, prompt, maxOutputTokens,
  });

  // Convert markdown to TipTap JSON
  const tiptapContent = markdownToTipTap(text);

  // Count words in the markdown
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

  // Create the chapter_draft artifact
  const artifact = await prisma.generatedArtifact.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'chapter_draft',
      artifactKey: `chapter-draft-${chapter.slug}`,
      status: 'generated',
      version: 1,
      title: chapter.title,
      summary: `${wordCount} words, ${plan.sections.length} sections`,
      markdownContent: text,
      tiptapContent: tiptapContent as any,
      jsonContent: {
        chapterSlug: chapter.slug,
        act: chapter.act,
        wordCount,
        sectionCount: plan.sections.length,
        encounterCount: plan.encounters.length,
      } as any,
      tokenCount: totalTokens,
      pageEstimate: chapter.targetPages,
    },
  });

  // Create CanonReferences for entities used in this chapter
  const entitySlugs = plan.entityReferences;
  if (entitySlugs.length > 0) {
    const entities = await prisma.canonEntity.findMany({
      where: { projectId: run.projectId, slug: { in: entitySlugs } },
      select: { id: true },
    });

    await Promise.all(
      entities.map((entity) =>
        prisma.canonReference.create({
          data: {
            entityId: entity.id,
            artifactId: artifact.id,
            referenceType: 'mentions',
          },
        }),
      ),
    );
  }

  // Update run token count
  await prisma.generationRun.update({
    where: { id: run.id },
    data: { actualTokens: { increment: totalTokens } },
  });

  // Publish progress event
  await publishGenerationEvent(run.id, {
    type: 'artifact_created',
    runId: run.id,
    artifactId: artifact.id,
    artifactType: 'chapter_draft',
    title: chapter.title,
    version: 1,
  });

  return {
    artifactId: artifact.id,
    chapterSlug: chapter.slug,
    title: chapter.title,
    wordCount,
  };
}
```

**Step 2: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/services/generation/chapter-writer.service.ts
git commit -m "feat: add chapter writer service for prose generation"
```

---

### Task 4: Chapter Writer Tests

**Files:**
- Create: `server/src/__tests__/generation/chapter-writer.test.ts`

**Context:** Mock `ai`, `pubsub.service`, and `ai-wizard.service` (`markdownToTipTap`). Use real DB for Prisma operations. Follow the established bible/canon test patterns.

**Step 1: Write the test file**

```typescript
// server/src/__tests__/generation/chapter-writer.test.ts
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { generateText } from 'ai';
import type { BibleContent, ChapterOutlineEntry, ChapterPlan } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { executeChapterDraftGeneration } from '../../services/generation/chapter-writer.service.js';
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
  summary: 'A one-shot adventure.',
  premise: 'Goblins raiding the village.',
  worldRules: {
    setting: 'The Duskhollow region',
    era: 'Medieval fantasy',
    magicLevel: 'standard',
    technologyLevel: 'medieval',
    toneDescriptors: ['adventurous'],
    forbiddenElements: [],
    worldSpecificRules: [],
  },
  actStructure: [
    { act: 1, title: 'Act 1', summary: 'Begin', levelRange: { min: 3, max: 5 }, chapterSlugs: ['ch-1'] },
  ],
  timeline: [],
  levelProgression: null,
  pageBudget: [],
  styleGuide: {
    voice: 'Adventurous',
    vocabulary: ['delve', 'torchlight'],
    avoidTerms: ['video game'],
    narrativePerspective: 'second person',
    toneNotes: 'Classic.',
  },
  openThreads: [],
  entities: [
    {
      entityType: 'npc',
      name: 'Chief Gnarltooth',
      slug: 'chief-gnarltooth',
      summary: 'Goblin chief.',
      details: { race: 'Goblin' },
    },
  ],
};

const SAMPLE_CHAPTER: ChapterOutlineEntry = {
  slug: 'ch-1-the-village',
  title: 'Chapter 1: The Village',
  act: 1,
  sortOrder: 1,
  levelRange: { min: 3, max: 3 },
  targetPages: 4,
  summary: 'Adventurers arrive and learn of the goblin threat.',
  keyEntities: ['chief-gnarltooth'],
  sections: [
    { slug: 'arrival', title: 'Arrival', sortOrder: 1, targetPages: 2, contentType: 'narrative', summary: 'PCs arrive at the village.' },
    { slug: 'the-elder', title: 'The Elder', sortOrder: 2, targetPages: 2, contentType: 'social', summary: 'PCs meet Elder Mara.' },
  ],
};

const SAMPLE_PLAN: ChapterPlan = {
  chapterSlug: 'ch-1-the-village',
  chapterTitle: 'Chapter 1: The Village',
  sections: [
    { slug: 'arrival', title: 'Arrival', contentType: 'narrative', targetWords: 800, outline: 'PCs arrive at the village.', keyBeats: ['arrival', 'first signs of damage'], entityReferences: ['chief-gnarltooth'], blocksNeeded: ['readAloud'] },
    { slug: 'the-elder', title: 'The Elder', contentType: 'social', targetWords: 600, outline: 'PCs meet Elder Mara.', keyBeats: ['introduction', 'quest offer'], entityReferences: [], blocksNeeded: ['dmTips'] },
  ],
  encounters: [],
  entityReferences: ['chief-gnarltooth'],
  readAloudCount: 2,
  dmTipCount: 1,
  difficultyProgression: 'No combat in this chapter.',
};

const SAMPLE_MARKDOWN = `## Chapter 1: The Village

### Arrival

:::readAloud
The winding forest road opens into a small valley. Before you lies Millbrook Village, its thatched roofs glinting in the afternoon sun.
:::

You arrive at Millbrook Village to find signs of recent goblin raids. Broken fences line the fields, and the villagers eye you with a mixture of hope and suspicion.

**Chief Gnarltooth** has been sending raiding parties from the caves to the north. The attacks have grown bolder over the past two weeks.

### The Elder

Elder Mara approaches your group with determined steps. Her silver hair catches the light as she speaks.

:::dmTips
Elder Mara is desperate but proud. She will not beg for help, instead framing the quest as a business arrangement.
:::

She explains the situation and offers a reward of 50 gold pieces per adventurer to deal with the goblin threat.`;

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `chwriter-test-${Date.now()}@test.com`,
      displayName: `ChWriter Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: { title: 'ChWriter Test Project', userId: testUser.id },
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

describe('Chapter Writer Service — executeChapterDraftGeneration', () => {
  it('should create a chapter_draft artifact with markdown and TipTap content', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: SAMPLE_MARKDOWN,
      usage: { inputTokens: 2000, outputTokens: 3000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const result = await executeChapterDraftGeneration(
      run!,
      SAMPLE_CHAPTER,
      SAMPLE_PLAN,
      SAMPLE_BIBLE,
      [],
      {} as any,
      16384,
    );

    expect(result.chapterSlug).toBe('ch-1-the-village');
    expect(result.wordCount).toBeGreaterThan(0);

    const artifact = await prisma.generatedArtifact.findUnique({ where: { id: result.artifactId } });
    expect(artifact).not.toBeNull();
    expect(artifact!.artifactType).toBe('chapter_draft');
    expect(artifact!.artifactKey).toBe('chapter-draft-ch-1-the-village');
    expect(artifact!.markdownContent).toContain('Chapter 1: The Village');
    expect(artifact!.tiptapContent).not.toBeNull();
    expect(artifact!.tokenCount).toBe(5000);
    expect(artifact!.pageEstimate).toBe(4);
  });

  it('should create CanonReferences for entities referenced in the plan', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: SAMPLE_MARKDOWN,
      usage: { inputTokens: 2000, outputTokens: 3000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    // Create a canon entity that will be referenced
    const entity = await prisma.canonEntity.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        entityType: 'npc',
        slug: 'chief-gnarltooth',
        canonicalName: 'Chief Gnarltooth',
        aliases: [] as any,
        canonicalData: {} as any,
        summary: 'Goblin chief.',
      },
    });

    const result = await executeChapterDraftGeneration(
      run!,
      SAMPLE_CHAPTER,
      SAMPLE_PLAN,
      SAMPLE_BIBLE,
      [],
      {} as any,
      16384,
    );

    const refs = await prisma.canonReference.findMany({
      where: { artifactId: result.artifactId },
    });
    expect(refs.length).toBe(1);
    expect(refs[0].entityId).toBe(entity.id);
    expect(refs[0].referenceType).toBe('mentions');
  });

  it('should update run token count', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: SAMPLE_MARKDOWN,
      usage: { inputTokens: 2000, outputTokens: 3000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    await executeChapterDraftGeneration(
      run!,
      SAMPLE_CHAPTER,
      SAMPLE_PLAN,
      SAMPLE_BIBLE,
      [],
      {} as any,
      16384,
    );

    const updatedRun = await prisma.generationRun.findUnique({ where: { id: run!.id } });
    expect(updatedRun!.actualTokens).toBe(5000);
  });

  it('should include bible context in the AI prompt', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: SAMPLE_MARKDOWN,
      usage: { inputTokens: 2000, outputTokens: 3000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    await executeChapterDraftGeneration(
      run!,
      SAMPLE_CHAPTER,
      SAMPLE_PLAN,
      SAMPLE_BIBLE,
      [],
      {} as any,
      16384,
    );

    const call = mockGenerateText.mock.calls[0][0];
    expect(call.prompt).toContain('The Duskhollow region');
    expect(call.prompt).toContain('second person');
    expect(call.prompt).toContain('ch-1-the-village');
  });

  it('should store word count in artifact metadata', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: SAMPLE_MARKDOWN,
      usage: { inputTokens: 2000, outputTokens: 3000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const result = await executeChapterDraftGeneration(
      run!,
      SAMPLE_CHAPTER,
      SAMPLE_PLAN,
      SAMPLE_BIBLE,
      [],
      {} as any,
      16384,
    );

    const artifact = await prisma.generatedArtifact.findUnique({ where: { id: result.artifactId } });
    const meta = artifact!.jsonContent as any;
    expect(meta.wordCount).toBe(result.wordCount);
    expect(meta.sectionCount).toBe(2);
  });

  it('should convert TipTap content with D&D blocks', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: SAMPLE_MARKDOWN,
      usage: { inputTokens: 2000, outputTokens: 3000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const result = await executeChapterDraftGeneration(
      run!,
      SAMPLE_CHAPTER,
      SAMPLE_PLAN,
      SAMPLE_BIBLE,
      [],
      {} as any,
      16384,
    );

    const artifact = await prisma.generatedArtifact.findUnique({ where: { id: result.artifactId } });
    const tiptap = artifact!.tiptapContent as any;
    expect(tiptap.type).toBe('doc');
    expect(tiptap.content.length).toBeGreaterThan(0);

    // Should contain heading and readAloud blocks
    const types = tiptap.content.map((n: any) => n.type);
    expect(types).toContain('heading');
    expect(types).toContain('readAloudBox');
  });
});
```

**Step 2: Run the tests**

Run: `cd /home/gallison/workspace/DND_booker/server && npx vitest run src/__tests__/generation/chapter-writer.test.ts`
Expected: All 6 tests PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/__tests__/generation/chapter-writer.test.ts
git commit -m "test: add chapter writer service tests"
```

---

### Task 5: Type-check + Integration Verification

**Files:**
- No new files

**Step 1: Run full server type check**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 2: Run all generation tests**

Run: `cd /home/gallison/workspace/DND_booker/server && npx vitest run src/__tests__/generation/`
Expected: All tests PASS (previous 68 + new 6 = 74 passing)

**Step 3: Commit if any fixes were needed**
