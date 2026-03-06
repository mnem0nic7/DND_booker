# Phase 4: Intake + Campaign Bible — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn a user's freeform prompt into a structured generation profile and a complete campaign bible with extracted canon entities — the first AI-powered pipeline stages.

**Architecture:** Two services (`intake.service.ts`, `bible.service.ts`) that accept a Vercel AI SDK `LanguageModel` and a `GenerationRun` record, call `generateText()` with structured prompts, parse JSON responses, persist artifacts/bible/entities to PostgreSQL, and publish progress events via Redis pub/sub. Services are pure pipeline stages — no route dependencies — to be called by the BullMQ orchestrator (Phase 10) or test harness.

**Tech Stack:** Vercel AI SDK (`generateText`), Prisma 6, Zod (response validation), Redis pub/sub, vitest (with mocked AI, real DB)

**Depends on:** Phase 1-3 infrastructure (shared types, Prisma models, run/task services, pub/sub)

---

## Context for the Implementer

### How AI calls work in this codebase

The server uses Vercel AI SDK. The key function is `generateText()` from `'ai'`:

```typescript
import { generateText } from 'ai';

const { text } = await generateText({
  model,           // LanguageModel from ai-provider.service.ts
  system: '...',   // System prompt
  prompt: '...',   // User prompt
  maxOutputTokens: 8192,
});
```

The `model` parameter comes from `createModel()` in `server/src/services/ai-provider.service.ts`. For generation services, the model is passed as a parameter — the caller (orchestrator or test) is responsible for obtaining it.

### How generation services fit together

```
GenerationRun (DB record, created by Phase 3 routes)
  |
  v
executeIntake(run, model) → NormalizedInput + project_profile artifact
  |
  v
executeBibleGeneration(run, normalizedInput, model) → CampaignBible + campaign_bible artifact + CanonEntity[]
```

Services use:
- `prisma` from `../../config/prisma.js` for DB access
- `publishGenerationEvent()` from `./pubsub.service.js` for progress updates
- `as any` cast for Prisma JSON fields (documented project pattern)

### Test pattern

Tests mock `generateText` from `'ai'` and use the real PostgreSQL database:
```typescript
vi.mock('ai', () => ({ generateText: vi.fn() }));
const mockGenerateText = vi.mocked(generateText);
```

Tests create real User/Project/GenerationRun records, then verify that services parse AI responses correctly and persist the right records.

### Env vars for tests

Run from monorepo root `.env` is not auto-loaded in `server/`. Pass env inline:
```bash
REDIS_HOST=localhost REDIS_PORT=6380 REDIS_PASSWORD=dev-redis-password npx vitest run src/__tests__/generation/intake.test.ts
```

---

## Task 1: Add NormalizedInput and BibleContent shared types

**Files:**
- Create: `shared/src/types/normalized-input.ts`
- Modify: `shared/src/types/campaign-bible.ts`
- Modify: `shared/src/index.ts`

### Step 1: Create the NormalizedInput type

This is the structured output of intake normalization — what the AI extracts from a freeform prompt.

Create `shared/src/types/normalized-input.ts`:

```typescript
import type { GenerationMode } from './generation-run.js';

/**
 * Mode-specific defaults for page targets and content counts.
 * Used by intake to fill in gaps when the user doesn't specify.
 */
export const MODE_DEFAULTS: Record<GenerationMode, {
  pageRange: [number, number];
  chapterRange: [number, number];
  npcRange: [number, number];
  locationRange: [number, number];
}> = {
  one_shot: { pageRange: [8, 18], chapterRange: [2, 5], npcRange: [2, 6], locationRange: [2, 4] },
  module: { pageRange: [24, 60], chapterRange: [4, 8], npcRange: [4, 10], locationRange: [4, 8] },
  campaign: { pageRange: [80, 200], chapterRange: [8, 15], npcRange: [8, 20], locationRange: [8, 20] },
  sourcebook: { pageRange: [80, 250], chapterRange: [10, 20], npcRange: [4, 12], locationRange: [4, 12] },
};

/**
 * Structured output of the intake normalization step.
 * The AI extracts this from the user's freeform prompt.
 */
export interface NormalizedInput {
  title: string;
  summary: string;
  inferredMode: GenerationMode;
  tone: string;
  themes: string[];
  setting: string;
  premise: string;
  levelRange: { min: number; max: number } | null;
  pageTarget: number;
  chapterEstimate: number;
  constraints: {
    strict5e: boolean;
    includeHandouts: boolean;
    includeMaps: boolean;
  };
  keyElements: {
    npcs: string[];
    locations: string[];
    plotHooks: string[];
    items: string[];
  };
}
```

### Step 2: Add BibleContent sub-types to campaign-bible.ts

Read `shared/src/types/campaign-bible.ts` first, then add these interfaces after the existing `CampaignBible` interface:

```typescript
/** Structured world rules for the campaign bible. */
export interface WorldRules {
  setting: string;
  era: string;
  magicLevel: string;
  technologyLevel: string;
  toneDescriptors: string[];
  forbiddenElements: string[];
  worldSpecificRules: string[];
}

/** One story beat in the act structure. */
export interface ActBeat {
  act: number;
  title: string;
  summary: string;
  levelRange: { min: number; max: number };
  chapterSlugs: string[];
}

/** A key event in the campaign timeline. */
export interface TimelineEvent {
  order: number;
  event: string;
  timeframe: string;
  significance: string;
}

/** Page budget for one chapter. */
export interface ChapterBudget {
  slug: string;
  title: string;
  targetPages: number;
  sections: string[];
}

/** Voice and vocabulary rules. */
export interface StyleGuide {
  voice: string;
  vocabulary: string[];
  avoidTerms: string[];
  narrativePerspective: string;
  toneNotes: string;
}

/** An entity mentioned in the campaign bible that becomes a CanonEntity. */
export interface BibleEntitySeed {
  entityType: 'npc' | 'location' | 'faction' | 'item' | 'quest';
  name: string;
  slug: string;
  summary: string;
  details: Record<string, unknown>;
}

/** Full structured output from the campaign bible generation step. */
export interface BibleContent {
  title: string;
  summary: string;
  premise: string;
  worldRules: WorldRules;
  actStructure: ActBeat[];
  timeline: TimelineEvent[];
  levelProgression: { type: 'milestone' | 'xp'; milestones: string[] } | null;
  pageBudget: ChapterBudget[];
  styleGuide: StyleGuide;
  openThreads: string[];
  entities: BibleEntitySeed[];
}
```

### Step 3: Export from shared/src/index.ts

Add these two lines to `shared/src/index.ts`:

```typescript
export * from './types/normalized-input.js';
// campaign-bible.ts is already exported — new interfaces auto-export
```

### Step 4: Verify types compile

Run: `npm run typecheck --workspace=shared`
Expected: PASS

### Step 5: Commit

```bash
git add shared/src/types/normalized-input.ts shared/src/types/campaign-bible.ts shared/src/index.ts
git commit -m "feat: add NormalizedInput and BibleContent shared types for intake/bible pipeline"
```

---

## Task 2: Write normalize-input prompt builder

**Files:**
- Create: `server/src/services/generation/prompts/normalize-input.prompt.ts`

### Step 1: Create the prompts directory and file

```bash
mkdir -p server/src/services/generation/prompts
```

Create `server/src/services/generation/prompts/normalize-input.prompt.ts`:

```typescript
import type { GenerationConstraints } from '@dnd-booker/shared';

/**
 * Builds the system prompt for intake normalization.
 * The AI extracts structured data from a freeform creative brief.
 */
export function buildNormalizeInputSystemPrompt(): string {
  return `You are a D&D content planning assistant. Your job is to analyze a user's creative brief and extract structured information for a generation pipeline.

You MUST respond with ONLY a JSON object (no markdown fences, no commentary). The JSON must match this exact schema:

{
  "title": "Suggested title for the adventure/campaign",
  "summary": "1-2 sentence summary of what will be generated",
  "inferredMode": "one_shot | module | campaign | sourcebook",
  "tone": "Primary tone (e.g. 'dark fantasy', 'lighthearted comedy', 'gothic horror')",
  "themes": ["theme1", "theme2"],
  "setting": "Description of the setting",
  "premise": "The central premise or hook of the adventure",
  "levelRange": { "min": 1, "max": 5 } or null if not specified,
  "pageTarget": estimated total pages (number),
  "chapterEstimate": estimated number of chapters (number),
  "constraints": {
    "strict5e": true/false (whether to strictly follow 5e rules),
    "includeHandouts": true/false,
    "includeMaps": true/false
  },
  "keyElements": {
    "npcs": ["Named NPCs mentioned by the user"],
    "locations": ["Named locations mentioned"],
    "plotHooks": ["Specific plot hooks or events mentioned"],
    "items": ["Named items, artifacts, or treasure mentioned"]
  }
}

Rules for inference:
- If the user mentions "one-shot" or describes a single session, inferredMode = "one_shot"
- If the user mentions "campaign" or describes multiple sessions/levels, inferredMode = "campaign"
- If the user mentions "module" or "adventure", inferredMode = "module"
- If the user mentions "sourcebook", "supplement", or "setting guide", inferredMode = "sourcebook"
- If unclear, default to "one_shot" for short descriptions, "module" for medium, "campaign" for long
- Page targets by mode: one_shot 8-18, module 24-60, campaign 80-200, sourcebook 80-250
- Chapter estimates by mode: one_shot 2-5, module 4-8, campaign 8-15, sourcebook 10-20
- If the user specifies a level range, use it. Otherwise infer from context or leave null
- Default strict5e to true, includeHandouts to false, includeMaps to false unless stated
- Extract ALL named NPCs, locations, items, and plot hooks mentioned in the prompt
- Generate a creative title if the user doesn't provide one`;
}

/**
 * Builds the user prompt for intake normalization.
 * Combines the user's freeform prompt with any explicit constraints.
 */
export function buildNormalizeInputUserPrompt(
  prompt: string,
  constraints?: GenerationConstraints | null,
): string {
  let userPrompt = `Creative brief:\n${prompt}`;

  if (constraints) {
    const parts: string[] = [];
    if (constraints.tone) parts.push(`Tone: ${constraints.tone}`);
    if (constraints.levelRange) parts.push(`Level range: ${constraints.levelRange}`);
    if (constraints.settingPreference) parts.push(`Setting: ${constraints.settingPreference}`);
    if (constraints.strict5e !== undefined) parts.push(`Strict 5e: ${constraints.strict5e}`);
    if (constraints.includeHandouts !== undefined) parts.push(`Include handouts: ${constraints.includeHandouts}`);
    if (constraints.includeMaps !== undefined) parts.push(`Include maps: ${constraints.includeMaps}`);

    if (parts.length > 0) {
      userPrompt += `\n\nExplicit constraints:\n${parts.join('\n')}`;
    }
  }

  return userPrompt;
}
```

### Step 2: Verify it compiles

Run: `cd server && npx tsc --noEmit`
Expected: PASS (or existing errors only)

### Step 3: Commit

```bash
git add server/src/services/generation/prompts/normalize-input.prompt.ts
git commit -m "feat: add normalize-input prompt builder for intake pipeline"
```

---

## Task 3: Write intake service (tests + implementation)

**Files:**
- Create: `server/src/__tests__/generation/intake.test.ts`
- Create: `server/src/services/generation/intake.service.ts`

### Step 1: Write the tests

Create `server/src/__tests__/generation/intake.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { generateText } from 'ai';
import type { NormalizedInput } from '@dnd-booker/shared';
import { prisma } from '../../config/prisma.js';
import { executeIntake } from '../../services/generation/intake.service.js';
import { createRun } from '../../services/generation/run.service.js';

vi.mock('ai', () => ({ generateText: vi.fn() }));
const mockGenerateText = vi.mocked(generateText);

let testUser: { id: string };
let testProject: { id: string };

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `intake-test-${Date.now()}@test.com`,
      username: `intaketest${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: {
      title: 'Intake Test Project',
      userId: testUser.id,
    },
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
});

beforeEach(() => {
  vi.clearAllMocks();
});

const VALID_AI_RESPONSE: NormalizedInput = {
  title: 'The Goblin Caves of Duskhollow',
  summary: 'A level 4 one-shot adventure through goblin-infested caves.',
  inferredMode: 'one_shot',
  tone: 'classic fantasy',
  themes: ['exploration', 'combat'],
  setting: 'A network of caves beneath a quiet farming village.',
  premise: 'Goblins have been raiding the village and the adventurers must clear their caves.',
  levelRange: { min: 3, max: 5 },
  pageTarget: 12,
  chapterEstimate: 3,
  constraints: { strict5e: true, includeHandouts: false, includeMaps: false },
  keyElements: {
    npcs: ['Chief Gnarltooth', 'Elder Mara'],
    locations: ['Duskhollow Caves', 'Millbrook Village'],
    plotHooks: ['goblin raids on the village'],
    items: ['Amulet of the Deep'],
  },
};

describe('Intake Service — executeIntake', () => {
  it('should parse a valid AI response and create a project_profile artifact', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_AI_RESPONSE),
      usage: { promptTokens: 500, completionTokens: 300 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A level 4 goblin cave adventure',
    });

    const result = await executeIntake(run, {} as any, 4096);

    expect(result.normalizedInput.title).toBe('The Goblin Caves of Duskhollow');
    expect(result.normalizedInput.inferredMode).toBe('one_shot');
    expect(result.normalizedInput.levelRange).toEqual({ min: 3, max: 5 });

    // Verify artifact was created
    const artifact = await prisma.generatedArtifact.findFirst({
      where: { runId: run.id, artifactType: 'project_profile' },
    });
    expect(artifact).not.toBeNull();
    expect(artifact!.status).toBe('accepted');
    expect(artifact!.artifactKey).toBe('project-profile');
    expect(artifact!.version).toBe(1);
  });

  it('should update the run with inferred mode and page estimates', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_AI_RESPONSE),
      usage: { promptTokens: 500, completionTokens: 300 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A goblin adventure',
    });

    await executeIntake(run, {} as any, 4096);

    const updatedRun = await prisma.generationRun.findUnique({ where: { id: run.id } });
    expect(updatedRun!.mode).toBe('one_shot');
    expect(updatedRun!.estimatedPages).toBe(12);
  });

  it('should pass user constraints to the prompt', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_AI_RESPONSE),
      usage: { promptTokens: 500, completionTokens: 300 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A gothic horror campaign',
      constraints: { tone: 'gothic horror', levelRange: '3-10' },
    });

    await executeIntake(run, {} as any, 4096);

    // Verify generateText was called with a prompt containing the constraints
    const call = mockGenerateText.mock.calls[0][0];
    expect(call.prompt).toContain('gothic horror');
    expect(call.prompt).toContain('3-10');
  });

  it('should throw on malformed AI response', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'This is not JSON at all',
      usage: { promptTokens: 500, completionTokens: 100 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A test adventure',
    });

    await expect(executeIntake(run, {} as any, 4096)).rejects.toThrow();
  });

  it('should handle AI response with extra fields gracefully', async () => {
    const responseWithExtras = {
      ...VALID_AI_RESPONSE,
      extraField: 'should be ignored',
      anotherExtra: 42,
    };

    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(responseWithExtras),
      usage: { promptTokens: 500, completionTokens: 300 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A test adventure',
    });

    const result = await executeIntake(run, {} as any, 4096);
    expect(result.normalizedInput.title).toBe(VALID_AI_RESPONSE.title);
  });

  it('should record token usage on the artifact', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_AI_RESPONSE),
      usage: { promptTokens: 500, completionTokens: 300 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A test adventure',
    });

    await executeIntake(run, {} as any, 4096);

    const artifact = await prisma.generatedArtifact.findFirst({
      where: { runId: run.id, artifactType: 'project_profile' },
    });
    expect(artifact!.tokenCount).toBe(800); // 500 + 300
  });
});
```

### Step 2: Run tests to verify they fail

Run: `cd server && REDIS_HOST=localhost REDIS_PORT=6380 REDIS_PASSWORD=dev-redis-password npx vitest run src/__tests__/generation/intake.test.ts`
Expected: FAIL — `intake.service.ts` does not exist yet.

### Step 3: Write the implementation

Create `server/src/services/generation/intake.service.ts`:

```typescript
import { generateText, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { NormalizedInput, GenerationConstraints } from '@dnd-booker/shared';
import { prisma } from '../../config/prisma.js';
import { publishGenerationEvent } from './pubsub.service.js';
import {
  buildNormalizeInputSystemPrompt,
  buildNormalizeInputUserPrompt,
} from './prompts/normalize-input.prompt.js';

const NormalizedInputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  inferredMode: z.enum(['one_shot', 'module', 'campaign', 'sourcebook']),
  tone: z.string(),
  themes: z.array(z.string()),
  setting: z.string(),
  premise: z.string(),
  levelRange: z.object({ min: z.number(), max: z.number() }).nullable(),
  pageTarget: z.number(),
  chapterEstimate: z.number(),
  constraints: z.object({
    strict5e: z.boolean(),
    includeHandouts: z.boolean(),
    includeMaps: z.boolean(),
  }),
  keyElements: z.object({
    npcs: z.array(z.string()),
    locations: z.array(z.string()),
    plotHooks: z.array(z.string()),
    items: z.array(z.string()),
  }),
});

export interface IntakeResult {
  normalizedInput: NormalizedInput;
  artifactId: string;
}

/**
 * Execute the intake normalization step.
 * Takes a GenerationRun with a freeform inputPrompt, calls AI to extract
 * structured data, creates a project_profile artifact, and updates the run.
 */
export async function executeIntake(
  run: { id: string; projectId: string; userId: string; inputPrompt: string; inputParameters: unknown },
  model: LanguageModel,
  maxOutputTokens: number,
): Promise<IntakeResult> {
  const system = buildNormalizeInputSystemPrompt();
  const prompt = buildNormalizeInputUserPrompt(
    run.inputPrompt,
    run.inputParameters as GenerationConstraints | null,
  );

  const { text, usage } = await generateText({
    model,
    system,
    prompt,
    maxOutputTokens,
  });

  // Parse and validate the AI response
  const parsed = parseJsonResponse(text);
  const normalizedInput = NormalizedInputSchema.parse(parsed) as NormalizedInput;

  const totalTokens = (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0);

  // Create the project_profile artifact
  const artifact = await prisma.generatedArtifact.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'project_profile',
      artifactKey: 'project-profile',
      status: 'accepted',
      version: 1,
      title: normalizedInput.title,
      summary: normalizedInput.summary,
      jsonContent: normalizedInput as any,
      tokenCount: totalTokens,
    },
  });

  // Update the run with inferred mode and estimates
  await prisma.generationRun.update({
    where: { id: run.id },
    data: {
      mode: normalizedInput.inferredMode,
      estimatedPages: normalizedInput.pageTarget,
      actualTokens: { increment: totalTokens },
    },
  });

  // Publish progress event
  await publishGenerationEvent(run.id, {
    type: 'artifact_created',
    runId: run.id,
    artifactId: artifact.id,
    artifactType: 'project_profile',
    title: normalizedInput.title,
    version: 1,
  });

  return { normalizedInput, artifactId: artifact.id };
}

/**
 * Parse a JSON response from the AI, handling common issues
 * like markdown fences and trailing text.
 */
function parseJsonResponse(text: string): unknown {
  let cleaned = text.trim();

  // Strip markdown fences if present
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

### Step 4: Run tests to verify they pass

Run: `cd server && REDIS_HOST=localhost REDIS_PORT=6380 REDIS_PASSWORD=dev-redis-password npx vitest run src/__tests__/generation/intake.test.ts`
Expected: 6 tests PASS

### Step 5: Commit

```bash
git add server/src/__tests__/generation/intake.test.ts server/src/services/generation/intake.service.ts
git commit -m "feat: add intake service with NormalizedInput extraction and tests"
```

---

## Task 4: Write campaign-bible prompt builder

**Files:**
- Create: `server/src/services/generation/prompts/campaign-bible.prompt.ts`

### Step 1: Create the prompt builder

Create `server/src/services/generation/prompts/campaign-bible.prompt.ts`:

```typescript
import type { NormalizedInput } from '@dnd-booker/shared';

/**
 * Builds the system prompt for campaign bible generation.
 * The AI creates a comprehensive campaign bible from normalized input.
 */
export function buildCampaignBibleSystemPrompt(): string {
  return `You are a D&D campaign designer. You create comprehensive campaign bibles that serve as the canonical source of truth for an entire generation pipeline. Every NPC, location, faction, and plot element will be derived from what you produce here.

You MUST respond with ONLY a JSON object (no markdown fences, no commentary). The JSON must match this exact schema:

{
  "title": "Final title for the project",
  "summary": "2-3 sentence overview of the entire adventure/campaign",
  "premise": "The central hook that drives the narrative",
  "worldRules": {
    "setting": "Detailed setting description",
    "era": "Time period or era",
    "magicLevel": "low | standard | high | epic",
    "technologyLevel": "medieval | renaissance | steampunk | mixed",
    "toneDescriptors": ["dark", "mysterious"],
    "forbiddenElements": ["things that should NOT appear"],
    "worldSpecificRules": ["unique rules for this setting"]
  },
  "actStructure": [
    {
      "act": 1,
      "title": "Act title",
      "summary": "What happens in this act",
      "levelRange": { "min": 1, "max": 3 },
      "chapterSlugs": ["chapter-1", "chapter-2"]
    }
  ],
  "timeline": [
    {
      "order": 1,
      "event": "What happened",
      "timeframe": "When (relative or absolute)",
      "significance": "Why it matters to the adventure"
    }
  ],
  "levelProgression": {
    "type": "milestone | xp",
    "milestones": ["Level 2 after clearing the caves", "Level 3 after the boss fight"]
  },
  "pageBudget": [
    {
      "slug": "chapter-1-the-village",
      "title": "Chapter 1: The Village",
      "targetPages": 4,
      "sections": ["Arriving at the Village", "Meeting the Elder", "The Missing Farmers"]
    }
  ],
  "styleGuide": {
    "voice": "Description of the narrative voice",
    "vocabulary": ["words and phrases to use"],
    "avoidTerms": ["words and phrases to avoid"],
    "narrativePerspective": "second person | third person | mixed",
    "toneNotes": "Additional tone guidance"
  },
  "openThreads": ["Unresolved plot hooks for sequel potential"],
  "entities": [
    {
      "entityType": "npc | location | faction | item | quest",
      "name": "Canonical Name",
      "slug": "canonical-name",
      "summary": "1-2 sentence description",
      "details": { type-specific fields }
    }
  ]
}

Entity detail fields by type:
- npc: { race, class, level, alignment, role, personality, motivation, appearance }
- location: { locationType, atmosphere, features, dangers, connections }
- faction: { purpose, leader, alignment, resources, goals }
- item: { itemType, rarity, properties, lore }
- quest: { questType, objective, reward, stakes }

Rules:
- Create ALL significant NPCs, locations, and factions as entities
- Every chapter must have at least one associated entity
- Page budgets must sum to approximately the page target
- Act structure must cover the full level range
- Slugs must be lowercase-kebab-case, unique within their entity type
- Include 2-4 timeline events per act
- Style guide should match the specified tone
- Open threads are optional for one-shots, recommended for campaigns`;
}

/**
 * Builds the user prompt for campaign bible generation from normalized input.
 */
export function buildCampaignBibleUserPrompt(input: NormalizedInput): string {
  const parts = [
    `Project: "${input.title}"`,
    `Mode: ${input.inferredMode}`,
    `Tone: ${input.tone}`,
    `Themes: ${input.themes.join(', ')}`,
    `Setting: ${input.setting}`,
    `Premise: ${input.premise}`,
    `Target pages: ${input.pageTarget}`,
    `Estimated chapters: ${input.chapterEstimate}`,
  ];

  if (input.levelRange) {
    parts.push(`Level range: ${input.levelRange.min}–${input.levelRange.max}`);
  }

  parts.push(`Constraints: strict5e=${input.constraints.strict5e}, handouts=${input.constraints.includeHandouts}, maps=${input.constraints.includeMaps}`);

  if (input.keyElements.npcs.length > 0) {
    parts.push(`Must include NPCs: ${input.keyElements.npcs.join(', ')}`);
  }
  if (input.keyElements.locations.length > 0) {
    parts.push(`Must include locations: ${input.keyElements.locations.join(', ')}`);
  }
  if (input.keyElements.plotHooks.length > 0) {
    parts.push(`Must include plot hooks: ${input.keyElements.plotHooks.join(', ')}`);
  }
  if (input.keyElements.items.length > 0) {
    parts.push(`Must include items: ${input.keyElements.items.join(', ')}`);
  }

  return parts.join('\n');
}
```

### Step 2: Verify it compiles

Run: `cd server && npx tsc --noEmit`
Expected: PASS (or existing errors only)

### Step 3: Commit

```bash
git add server/src/services/generation/prompts/campaign-bible.prompt.ts
git commit -m "feat: add campaign-bible prompt builder for bible generation pipeline"
```

---

## Task 5: Write bible service (tests + implementation)

**Files:**
- Create: `server/src/__tests__/generation/bible.test.ts`
- Create: `server/src/services/generation/bible.service.ts`

### Step 1: Write the tests

Create `server/src/__tests__/generation/bible.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { generateText } from 'ai';
import type { NormalizedInput, BibleContent } from '@dnd-booker/shared';
import { prisma } from '../../config/prisma.js';
import { executeBibleGeneration } from '../../services/generation/bible.service.js';
import { createRun } from '../../services/generation/run.service.js';

vi.mock('ai', () => ({ generateText: vi.fn() }));
const mockGenerateText = vi.mocked(generateText);

let testUser: { id: string };
let testProject: { id: string };

const SAMPLE_INPUT: NormalizedInput = {
  title: 'The Goblin Caves of Duskhollow',
  summary: 'A level 4 one-shot adventure through goblin-infested caves.',
  inferredMode: 'one_shot',
  tone: 'classic fantasy',
  themes: ['exploration', 'combat'],
  setting: 'Caves beneath a farming village.',
  premise: 'Goblins raiding the village must be stopped.',
  levelRange: { min: 3, max: 5 },
  pageTarget: 12,
  chapterEstimate: 3,
  constraints: { strict5e: true, includeHandouts: false, includeMaps: false },
  keyElements: {
    npcs: ['Chief Gnarltooth'],
    locations: ['Duskhollow Caves'],
    plotHooks: ['goblin raids'],
    items: [],
  },
};

const VALID_BIBLE_RESPONSE: BibleContent = {
  title: 'The Goblin Caves of Duskhollow',
  summary: 'Adventurers delve into goblin-infested caves to save a village.',
  premise: 'Goblins have been raiding Millbrook Village from their cave network.',
  worldRules: {
    setting: 'The Duskhollow region, a pastoral area with ancient cave systems.',
    era: 'Standard medieval fantasy',
    magicLevel: 'standard',
    technologyLevel: 'medieval',
    toneDescriptors: ['adventurous', 'classic'],
    forbiddenElements: ['modern technology'],
    worldSpecificRules: ['The caves contain remnants of a dwarven outpost'],
  },
  actStructure: [
    {
      act: 1,
      title: 'The Village',
      summary: 'Adventurers arrive and learn of the goblin threat.',
      levelRange: { min: 3, max: 3 },
      chapterSlugs: ['chapter-1-the-village'],
    },
    {
      act: 2,
      title: 'The Caves',
      summary: 'Delving into the goblin caves.',
      levelRange: { min: 4, max: 4 },
      chapterSlugs: ['chapter-2-the-caves'],
    },
    {
      act: 3,
      title: 'The Throne Room',
      summary: 'Confronting Chief Gnarltooth.',
      levelRange: { min: 4, max: 5 },
      chapterSlugs: ['chapter-3-the-throne-room'],
    },
  ],
  timeline: [
    { order: 1, event: 'Goblins discover the cave system', timeframe: '3 months ago', significance: 'Origin of the problem' },
    { order: 2, event: 'First raids on Millbrook', timeframe: '2 weeks ago', significance: 'Inciting incident' },
  ],
  levelProgression: {
    type: 'milestone',
    milestones: ['Level 4 after clearing the upper caves', 'Level 5 after defeating Chief Gnarltooth'],
  },
  pageBudget: [
    { slug: 'chapter-1-the-village', title: 'Chapter 1: The Village', targetPages: 3, sections: ['Arrival', 'The Elder'] },
    { slug: 'chapter-2-the-caves', title: 'Chapter 2: The Caves', targetPages: 5, sections: ['Upper Caves', 'Traps'] },
    { slug: 'chapter-3-the-throne-room', title: 'Chapter 3: The Throne Room', targetPages: 4, sections: ['The Approach', 'Boss Fight'] },
  ],
  styleGuide: {
    voice: 'Adventurous and descriptive',
    vocabulary: ['delve', 'chamber', 'torchlight'],
    avoidTerms: ['video game', 'level up'],
    narrativePerspective: 'second person',
    toneNotes: 'Keep the tone classic and approachable for new players.',
  },
  openThreads: ['What were the dwarves mining?'],
  entities: [
    {
      entityType: 'npc',
      name: 'Chief Gnarltooth',
      slug: 'chief-gnarltooth',
      summary: 'The cunning goblin chief who leads the raiding parties.',
      details: { race: 'Goblin', class: 'Fighter', level: 4, alignment: 'CE', role: 'antagonist', personality: 'cunning and cruel', motivation: 'power', appearance: 'Large goblin with a broken tusk' },
    },
    {
      entityType: 'npc',
      name: 'Elder Mara',
      slug: 'elder-mara',
      summary: 'The village elder who hires the adventurers.',
      details: { race: 'Human', class: 'Commoner', level: 1, alignment: 'LG', role: 'quest giver', personality: 'worried but resolute', motivation: 'protect her village', appearance: 'Elderly woman with silver hair' },
    },
    {
      entityType: 'location',
      name: 'Duskhollow Caves',
      slug: 'duskhollow-caves',
      summary: 'An ancient cave network now occupied by goblins.',
      details: { locationType: 'dungeon', atmosphere: 'dark and damp', features: ['narrow passages', 'underground stream'], dangers: ['traps', 'goblin patrols'], connections: ['Millbrook Village'] },
    },
  ],
};

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `bible-test-${Date.now()}@test.com`,
      username: `bibletest${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: {
      title: 'Bible Test Project',
      userId: testUser.id,
    },
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Bible Service — executeBibleGeneration', () => {
  it('should create a CampaignBible record from valid AI response', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_BIBLE_RESPONSE),
      usage: { promptTokens: 1000, completionTokens: 2000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A goblin cave adventure',
    });

    const result = await executeBibleGeneration(run, SAMPLE_INPUT, {} as any, 8192);

    expect(result.bible.title).toBe('The Goblin Caves of Duskhollow');
    expect(result.bible.runId).toBe(run.id);

    // Verify CampaignBible record in DB
    const bible = await prisma.campaignBible.findUnique({ where: { runId: run.id } });
    expect(bible).not.toBeNull();
    expect(bible!.title).toBe('The Goblin Caves of Duskhollow');
    expect(bible!.summary).toBe(VALID_BIBLE_RESPONSE.summary);
  });

  it('should create a campaign_bible artifact', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_BIBLE_RESPONSE),
      usage: { promptTokens: 1000, completionTokens: 2000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A goblin cave adventure',
    });

    await executeBibleGeneration(run, SAMPLE_INPUT, {} as any, 8192);

    const artifact = await prisma.generatedArtifact.findFirst({
      where: { runId: run.id, artifactType: 'campaign_bible' },
    });
    expect(artifact).not.toBeNull();
    expect(artifact!.status).toBe('generated');
    expect(artifact!.artifactKey).toBe('campaign-bible');
    expect(artifact!.tokenCount).toBe(3000);
  });

  it('should create CanonEntity records for each entity in the bible', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_BIBLE_RESPONSE),
      usage: { promptTokens: 1000, completionTokens: 2000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A goblin cave adventure',
    });

    const result = await executeBibleGeneration(run, SAMPLE_INPUT, {} as any, 8192);

    expect(result.entities.length).toBe(3);

    // Check entities in DB
    const entities = await prisma.canonEntity.findMany({
      where: { runId: run.id },
      orderBy: { canonicalName: 'asc' },
    });
    expect(entities.length).toBe(3);

    const chief = entities.find(e => e.slug === 'chief-gnarltooth');
    expect(chief).not.toBeNull();
    expect(chief!.entityType).toBe('npc');
    expect(chief!.canonicalName).toBe('Chief Gnarltooth');
  });

  it('should store structured JSON fields on the CampaignBible', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_BIBLE_RESPONSE),
      usage: { promptTokens: 1000, completionTokens: 2000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A goblin cave adventure',
    });

    await executeBibleGeneration(run, SAMPLE_INPUT, {} as any, 8192);

    const bible = await prisma.campaignBible.findUnique({ where: { runId: run.id } });
    const worldRules = bible!.worldRules as any;
    expect(worldRules.magicLevel).toBe('standard');
    expect(worldRules.toneDescriptors).toContain('adventurous');

    const pageBudget = bible!.pageBudget as any;
    expect(pageBudget.length).toBe(3);
    expect(pageBudget[0].slug).toBe('chapter-1-the-village');
  });

  it('should throw on malformed AI response', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'Not valid JSON',
      usage: { promptTokens: 500, completionTokens: 100 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A test adventure',
    });

    await expect(
      executeBibleGeneration(run, SAMPLE_INPUT, {} as any, 8192),
    ).rejects.toThrow();
  });

  it('should update run token count', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_BIBLE_RESPONSE),
      usage: { promptTokens: 1000, completionTokens: 2000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A goblin cave adventure',
    });

    await executeBibleGeneration(run, SAMPLE_INPUT, {} as any, 8192);

    const updatedRun = await prisma.generationRun.findUnique({ where: { id: run.id } });
    expect(updatedRun!.actualTokens).toBe(3000);
  });

  it('should include NormalizedInput context in the AI prompt', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_BIBLE_RESPONSE),
      usage: { promptTokens: 1000, completionTokens: 2000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A goblin cave adventure',
    });

    await executeBibleGeneration(run, SAMPLE_INPUT, {} as any, 8192);

    const call = mockGenerateText.mock.calls[0][0];
    expect(call.prompt).toContain('The Goblin Caves of Duskhollow');
    expect(call.prompt).toContain('one_shot');
    expect(call.prompt).toContain('classic fantasy');
  });
});
```

### Step 2: Run tests to verify they fail

Run: `cd server && REDIS_HOST=localhost REDIS_PORT=6380 REDIS_PASSWORD=dev-redis-password npx vitest run src/__tests__/generation/bible.test.ts`
Expected: FAIL — `bible.service.ts` does not exist yet.

### Step 3: Write the implementation

Create `server/src/services/generation/bible.service.ts`:

```typescript
import { generateText, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { NormalizedInput, BibleContent } from '@dnd-booker/shared';
import { prisma } from '../../config/prisma.js';
import { publishGenerationEvent } from './pubsub.service.js';
import {
  buildCampaignBibleSystemPrompt,
  buildCampaignBibleUserPrompt,
} from './prompts/campaign-bible.prompt.js';

const BibleEntitySeedSchema = z.object({
  entityType: z.enum(['npc', 'location', 'faction', 'item', 'quest']),
  name: z.string(),
  slug: z.string(),
  summary: z.string(),
  details: z.record(z.unknown()),
});

const BibleContentSchema = z.object({
  title: z.string(),
  summary: z.string(),
  premise: z.string(),
  worldRules: z.object({
    setting: z.string(),
    era: z.string(),
    magicLevel: z.string(),
    technologyLevel: z.string(),
    toneDescriptors: z.array(z.string()),
    forbiddenElements: z.array(z.string()),
    worldSpecificRules: z.array(z.string()),
  }),
  actStructure: z.array(z.object({
    act: z.number(),
    title: z.string(),
    summary: z.string(),
    levelRange: z.object({ min: z.number(), max: z.number() }),
    chapterSlugs: z.array(z.string()),
  })),
  timeline: z.array(z.object({
    order: z.number(),
    event: z.string(),
    timeframe: z.string(),
    significance: z.string(),
  })),
  levelProgression: z.object({
    type: z.enum(['milestone', 'xp']),
    milestones: z.array(z.string()),
  }).nullable(),
  pageBudget: z.array(z.object({
    slug: z.string(),
    title: z.string(),
    targetPages: z.number(),
    sections: z.array(z.string()),
  })),
  styleGuide: z.object({
    voice: z.string(),
    vocabulary: z.array(z.string()),
    avoidTerms: z.array(z.string()),
    narrativePerspective: z.string(),
    toneNotes: z.string(),
  }),
  openThreads: z.array(z.string()),
  entities: z.array(BibleEntitySeedSchema),
});

export interface BibleResult {
  bible: { id: string; runId: string; title: string };
  artifactId: string;
  entities: { id: string; entityType: string; slug: string; canonicalName: string }[];
}

/**
 * Execute campaign bible generation.
 * Takes a NormalizedInput (from intake), calls AI to generate a full
 * campaign bible, creates CampaignBible + artifact + CanonEntity records.
 */
export async function executeBibleGeneration(
  run: { id: string; projectId: string; userId: string },
  normalizedInput: NormalizedInput,
  model: LanguageModel,
  maxOutputTokens: number,
): Promise<BibleResult> {
  const system = buildCampaignBibleSystemPrompt();
  const prompt = buildCampaignBibleUserPrompt(normalizedInput);

  const { text, usage } = await generateText({
    model,
    system,
    prompt,
    maxOutputTokens,
  });

  // Parse and validate the AI response
  const parsed = parseJsonResponse(text);
  const bibleContent = BibleContentSchema.parse(parsed) as BibleContent;

  const totalTokens = (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0);

  // Create CampaignBible record
  const bible = await prisma.campaignBible.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      title: bibleContent.title,
      summary: bibleContent.summary,
      premise: bibleContent.premise,
      worldRules: bibleContent.worldRules as any,
      actStructure: bibleContent.actStructure as any,
      timeline: bibleContent.timeline as any,
      levelProgression: bibleContent.levelProgression as any,
      pageBudget: bibleContent.pageBudget as any,
      styleGuide: bibleContent.styleGuide as any,
      openThreads: bibleContent.openThreads as any,
      status: 'draft',
    },
  });

  // Create the campaign_bible artifact
  const artifact = await prisma.generatedArtifact.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'campaign_bible',
      artifactKey: 'campaign-bible',
      status: 'generated',
      version: 1,
      title: bibleContent.title,
      summary: bibleContent.summary,
      jsonContent: bibleContent as any,
      tokenCount: totalTokens,
    },
  });

  // Create CanonEntity records for each entity seed
  const entities = await Promise.all(
    bibleContent.entities.map((seed) =>
      prisma.canonEntity.create({
        data: {
          projectId: run.projectId,
          runId: run.id,
          entityType: seed.entityType,
          slug: seed.slug,
          canonicalName: seed.name,
          aliases: [] as any,
          canonicalData: seed.details as any,
          summary: seed.summary,
          sourceArtifactId: artifact.id,
        },
      }),
    ),
  );

  // Update run token count
  await prisma.generationRun.update({
    where: { id: run.id },
    data: {
      actualTokens: { increment: totalTokens },
    },
  });

  // Publish progress events
  await publishGenerationEvent(run.id, {
    type: 'artifact_created',
    runId: run.id,
    artifactId: artifact.id,
    artifactType: 'campaign_bible',
    title: bibleContent.title,
    version: 1,
  });

  return {
    bible: { id: bible.id, runId: bible.runId, title: bible.title },
    artifactId: artifact.id,
    entities: entities.map((e) => ({
      id: e.id,
      entityType: e.entityType,
      slug: e.slug,
      canonicalName: e.canonicalName,
    })),
  };
}

/**
 * Parse a JSON response from the AI, handling common issues.
 */
function parseJsonResponse(text: string): unknown {
  let cleaned = text.trim();

  // Strip markdown fences if present
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

### Step 4: Run tests to verify they pass

Run: `cd server && REDIS_HOST=localhost REDIS_PORT=6380 REDIS_PASSWORD=dev-redis-password npx vitest run src/__tests__/generation/bible.test.ts`
Expected: 7 tests PASS

### Step 5: Commit

```bash
git add server/src/__tests__/generation/bible.test.ts server/src/services/generation/bible.service.ts
git commit -m "feat: add campaign bible service with entity extraction and tests"
```

---

## Task 6: Integration test — intake-to-bible pipeline

**Files:**
- Create: `server/src/__tests__/generation/pipeline.test.ts`

### Step 1: Write the pipeline integration test

This test verifies that intake output feeds correctly into bible generation.

Create `server/src/__tests__/generation/pipeline.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { generateText } from 'ai';
import type { NormalizedInput, BibleContent } from '@dnd-booker/shared';
import { prisma } from '../../config/prisma.js';
import { createRun, transitionRunStatus } from '../../services/generation/run.service.js';
import { executeIntake } from '../../services/generation/intake.service.js';
import { executeBibleGeneration } from '../../services/generation/bible.service.js';

vi.mock('ai', () => ({ generateText: vi.fn() }));
const mockGenerateText = vi.mocked(generateText);

let testUser: { id: string };
let testProject: { id: string };

const INTAKE_RESPONSE: NormalizedInput = {
  title: 'Shadows Over Ravenmoor',
  summary: 'A gothic horror campaign for levels 3-10.',
  inferredMode: 'campaign',
  tone: 'gothic horror',
  themes: ['horror', 'mystery', 'betrayal'],
  setting: 'The cursed land of Ravenmoor, a once-prosperous kingdom now shrouded in darkness.',
  premise: 'An ancient evil stirs beneath Castle Ravenmoor, corrupting the land and its people.',
  levelRange: { min: 3, max: 10 },
  pageTarget: 120,
  chapterEstimate: 10,
  constraints: { strict5e: true, includeHandouts: true, includeMaps: false },
  keyElements: {
    npcs: ['Lord Aldric Ravenmoor', 'Sister Elara'],
    locations: ['Castle Ravenmoor', 'The Blighted Marsh'],
    plotHooks: ['corruption spreading from the castle'],
    items: ['Bloodstone Pendant'],
  },
};

const BIBLE_RESPONSE: BibleContent = {
  title: 'Shadows Over Ravenmoor',
  summary: 'A gothic horror campaign where adventurers uncover the dark secret of Castle Ravenmoor.',
  premise: 'An ancient vampire lord is awakening beneath the castle, spreading corruption.',
  worldRules: {
    setting: 'The kingdom of Ravenmoor, inspired by Gothic horror.',
    era: 'Late medieval',
    magicLevel: 'standard',
    technologyLevel: 'medieval',
    toneDescriptors: ['dark', 'foreboding', 'atmospheric'],
    forbiddenElements: ['comedy relief', 'modern references'],
    worldSpecificRules: ['Undead are more powerful at night', 'Holy water is rare and valuable'],
  },
  actStructure: [
    { act: 1, title: 'The Gathering Dark', summary: 'Adventurers arrive and discover the corruption.', levelRange: { min: 3, max: 5 }, chapterSlugs: ['ch-1', 'ch-2', 'ch-3'] },
    { act: 2, title: 'Into the Depths', summary: 'Investigating the source of the corruption.', levelRange: { min: 5, max: 7 }, chapterSlugs: ['ch-4', 'ch-5', 'ch-6'] },
    { act: 3, title: 'The Final Night', summary: 'Confronting the vampire lord.', levelRange: { min: 8, max: 10 }, chapterSlugs: ['ch-7', 'ch-8', 'ch-9', 'ch-10'] },
  ],
  timeline: [
    { order: 1, event: 'Vampire lord sealed beneath castle', timeframe: '500 years ago', significance: 'Origin' },
    { order: 2, event: 'Seal weakens, corruption begins', timeframe: '1 month ago', significance: 'Inciting event' },
  ],
  levelProgression: { type: 'milestone', milestones: ['Level 4 after Act 1', 'Level 7 after Act 2'] },
  pageBudget: [
    { slug: 'ch-1', title: 'Chapter 1: Arrival', targetPages: 12, sections: ['The Road', 'The Village'] },
    { slug: 'ch-2', title: 'Chapter 2: First Signs', targetPages: 12, sections: ['The Blight', 'The Church'] },
  ],
  styleGuide: {
    voice: 'Dark and atmospheric, building dread.',
    vocabulary: ['shroud', 'blight', 'whisper', 'decay'],
    avoidTerms: ['fun', 'awesome', 'cool'],
    narrativePerspective: 'second person',
    toneNotes: 'Maintain constant unease. Even safe moments should feel temporary.',
  },
  openThreads: ['What other evils were sealed with the vampire lord?'],
  entities: [
    { entityType: 'npc', name: 'Lord Aldric Ravenmoor', slug: 'lord-aldric-ravenmoor', summary: 'The tragic lord of Castle Ravenmoor.', details: { race: 'Human', alignment: 'LN', role: 'tragic figure' } },
    { entityType: 'npc', name: 'Sister Elara', slug: 'sister-elara', summary: 'A priest investigating the corruption.', details: { race: 'Human', alignment: 'LG', role: 'ally' } },
    { entityType: 'location', name: 'Castle Ravenmoor', slug: 'castle-ravenmoor', summary: 'An ancient castle above the sealed evil.', details: { locationType: 'castle', atmosphere: 'oppressive' } },
  ],
};

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `pipeline-test-${Date.now()}@test.com`,
      username: `pipelinetest${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: {
      title: 'Pipeline Test Project',
      userId: testUser.id,
    },
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Intake → Bible Pipeline', () => {
  it('should chain intake output into bible generation', async () => {
    // Mock both AI calls in sequence
    mockGenerateText
      .mockResolvedValueOnce({
        text: JSON.stringify(INTAKE_RESPONSE),
        usage: { promptTokens: 500, completionTokens: 300 },
      } as any)
      .mockResolvedValueOnce({
        text: JSON.stringify(BIBLE_RESPONSE),
        usage: { promptTokens: 1500, completionTokens: 3000 },
      } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'Create a gothic horror campaign for levels 3-10 set in a cursed kingdom',
      constraints: { tone: 'gothic horror', levelRange: '3-10' },
    });

    // Step 1: Intake
    const intakeResult = await executeIntake(run, {} as any, 4096);
    expect(intakeResult.normalizedInput.inferredMode).toBe('campaign');
    expect(intakeResult.normalizedInput.pageTarget).toBe(120);

    // Step 2: Bible generation (uses intake output)
    const bibleResult = await executeBibleGeneration(
      run,
      intakeResult.normalizedInput,
      {} as any,
      8192,
    );
    expect(bibleResult.bible.title).toBe('Shadows Over Ravenmoor');
    expect(bibleResult.entities.length).toBe(3);

    // Verify full state in DB
    const artifacts = await prisma.generatedArtifact.findMany({
      where: { runId: run.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(artifacts.length).toBe(2);
    expect(artifacts[0].artifactType).toBe('project_profile');
    expect(artifacts[1].artifactType).toBe('campaign_bible');

    const bible = await prisma.campaignBible.findUnique({ where: { runId: run.id } });
    expect(bible).not.toBeNull();

    const entities = await prisma.canonEntity.findMany({ where: { runId: run.id } });
    expect(entities.length).toBe(3);

    // Verify cumulative token tracking
    const updatedRun = await prisma.generationRun.findUnique({ where: { id: run.id } });
    expect(updatedRun!.actualTokens).toBe(5300); // 800 + 4500
    expect(updatedRun!.mode).toBe('campaign');
    expect(updatedRun!.estimatedPages).toBe(120);
  });

  it('should fail bible gracefully if intake produced bad data', async () => {
    // Intake returns data missing required bible fields
    const minimalInput: NormalizedInput = {
      ...INTAKE_RESPONSE,
      keyElements: { npcs: [], locations: [], plotHooks: [], items: [] },
    };

    // Bible AI returns valid response despite minimal input
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(BIBLE_RESPONSE),
      usage: { promptTokens: 1000, completionTokens: 2000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A simple adventure',
    });

    // Should still work — bible generation should handle sparse input
    const result = await executeBibleGeneration(run, minimalInput, {} as any, 8192);
    expect(result.bible.title).toBe('Shadows Over Ravenmoor');
  });
});
```

### Step 2: Run the pipeline test

Run: `cd server && REDIS_HOST=localhost REDIS_PORT=6380 REDIS_PASSWORD=dev-redis-password npx vitest run src/__tests__/generation/pipeline.test.ts`
Expected: 2 tests PASS

### Step 3: Run ALL generation tests to verify no regressions

Run: `cd server && REDIS_HOST=localhost REDIS_PORT=6380 REDIS_PASSWORD=dev-redis-password npx vitest run src/__tests__/generation/`
Expected: All tests PASS (35 existing + 6 intake + 7 bible + 2 pipeline = 50 tests)

### Step 4: Commit

```bash
git add server/src/__tests__/generation/pipeline.test.ts
git commit -m "test: add intake-to-bible pipeline integration test"
```

---

## Task 7: Full integration validation

**Files:** None (verification only)

### Step 1: Run all generation tests

Run: `cd server && REDIS_HOST=localhost REDIS_PORT=6380 REDIS_PASSWORD=dev-redis-password npx vitest run src/__tests__/generation/`
Expected: 50 tests PASS across 6 test files

### Step 2: Run the full server test suite

Run: `cd server && REDIS_HOST=localhost REDIS_PORT=6380 REDIS_PASSWORD=dev-redis-password npx vitest run`
Expected: Same baseline as main branch (296/301 pass, 5 pre-existing failures)

### Step 3: Type check

Run: `cd server && npx tsc --noEmit && npm run typecheck --workspace=shared`
Expected: PASS

### Step 4: Verify no regressions

Compare the 5 pre-existing failures to confirm they are the same ones as on main (Ollama not running, API key issues, wizard test).

---

## Summary

| Task | Tests | Files Created | Files Modified |
|------|-------|--------------|----------------|
| 1. Shared types | 0 | `normalized-input.ts` | `campaign-bible.ts`, `index.ts` |
| 2. Normalize prompt | 0 | `normalize-input.prompt.ts` | — |
| 3. Intake service | 6 | `intake.test.ts`, `intake.service.ts` | — |
| 4. Bible prompt | 0 | `campaign-bible.prompt.ts` | — |
| 5. Bible service | 7 | `bible.test.ts`, `bible.service.ts` | — |
| 6. Pipeline test | 2 | `pipeline.test.ts` | — |
| 7. Validation | 0 | — | — |
| **Total** | **15** | **7 files** | **2 files** |
