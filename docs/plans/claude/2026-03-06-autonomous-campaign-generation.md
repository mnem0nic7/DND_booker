# Autonomous Campaign Generation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable fully autonomous D&D content generation from a single user prompt — from 5-page one-shots to 200+ page sourcebooks — with configurable quality (quick draft vs polished) and a phased agent hybrid architecture.

**Architecture:** Server-driven phase pipeline (Plan → World Bible → Generate → Assemble → Review) executed as a BullMQ background job. Within each phase, the AI operates as an agent with tool access, deciding what content to create. The server enforces phase transitions, tracks progress in the database, and survives connection drops. The existing wizard infrastructure is extended rather than replaced.

**Tech Stack:** Express 5, Prisma 6, BullMQ, Vercel AI SDK (`streamText`/`generateText`), Zod, React 19, Zustand 5, existing ToolRegistry

---

## Gap Analysis Summary

| What Exists | What's Missing |
|---|---|
| Wizard: flat 4-8 sections, sequential | Hierarchical outline (Book → Chapters → Sections), 60+ sections |
| 300-char section summaries | World bible (NPCs, locations, items, factions tracked across chapters) |
| Foreground SSE streaming only | Background BullMQ job with DB-persisted progress |
| Single `generateText` per section | Multi-phase orchestration with agent loops per phase |
| No post-generation review | Configurable review pipeline (consistency, balance, cross-refs) |
| MAX_SSE_BYTES 500KB cap | No cap needed — background job writes directly to DB |
| Wizard rate limit 5/5min | Internal generation bypasses HTTP rate limits |
| 8192 max tokens/section | Chunked generation for long chapters |

---

## Design

### Phase Pipeline

```
User Prompt
    ↓
[Conversation Phase] — AI asks clarifying questions (0-N rounds, user can skip)
    ↓ user says "go" or AI has enough context
[Planning Phase] — AI generates hierarchical outline + world bible skeleton
    ↓
[World Bible Phase] — AI fleshes out NPCs, locations, items, factions
    ↓
[Generation Phase] — AI generates chapters sequentially, each section has full world bible context
    ↓
[Assembly Phase] — Server builds final document: front matter + body + appendices + back matter
    ↓
[Review Phase] (optional, "polished" mode only) — AI reviews for consistency, balance, cross-refs, then patches
    ↓
Done — content written to Project.content
```

### Key Concepts

**GenerationJob** — A persistent DB record tracking the entire generation lifecycle. Contains the phase, outline, world bible, progress, quality mode, and generated content. Survives server restarts and connection drops.

**Hierarchical Outline** — Replaces flat section list:
```
Book
├── Front Matter (titlePage, tableOfContents, creditsPage)
├── Chapter 1: "The Call to Adventure"
│   ├── Section 1.1: "The Tavern Hook"
│   ├── Section 1.2: "The Road to Thornfield"
│   └── Section 1.3: "Arrival at Thornfield"
├── Chapter 2: "Into the Ruins"
│   ├── Section 2.1: "The Outer Courtyard"
│   └── Section 2.2: "The Catacombs"
├── ...
├── Appendix A: "Monster Compendium"
├── Appendix B: "Magic Items"
└── Back Matter (creditsPage, backCover)
```

**World Bible** — Structured reference document accumulated during generation:
```json
{
  "setting": { "name": "...", "description": "...", "era": "..." },
  "npcs": [{ "name": "...", "role": "...", "location": "...", "statBlockRef": "section-2.1", ... }],
  "locations": [{ "name": "...", "description": "...", "connections": [...] }],
  "items": [{ "name": "...", "type": "...", "rarity": "...", "location": "..." }],
  "factions": [{ "name": "...", "goals": "...", "allies": [...], "enemies": [...] }],
  "plotThreads": [{ "name": "...", "status": "...", "chapters": [...] }]
}
```

Each chapter generation receives the full world bible as context. After each chapter, new entities are extracted and added.

**Quality Modes:**
- `quick` — Single generation pass per section, no review phase
- `polished` — Generation pass + AI self-review for consistency/balance/cross-references + patch pass

### Scale Profiles

The outline size scales with project type and user input:

| Project Type | Chapters | Sections/Chapter | Estimated Pages | Estimated Time (quick) |
|---|---|---|---|---|
| One-shot | 1 | 3-5 | 5-15 | 2-5 min |
| Short adventure | 3-5 | 3-5 | 20-40 | 5-15 min |
| Full campaign | 8-15 | 3-6 | 60-150 | 20-45 min |
| Sourcebook | 10-20 | 4-8 | 100-250 | 30-90 min |

### Conversation Phase (Chat-Integrated)

The existing chat flow handles conversation. The AI asks clarifying questions based on the prompt. At any point, the user can say "go for it" or "generate it." The AI emits a new control block `_autonomousGenerate` (or uses the existing `generateAdventure` tool with an extended schema) to kick off the background job.

The key difference from today: instead of emitting a flat `_wizardGenerate` outline, the AI (or server) generates a **hierarchical** outline and the generation runs as a **background job** rather than a foreground SSE stream.

### Background Job Architecture

```
Server (Express)                    Worker (BullMQ)
─────────────────                   ────────────────
POST /ai/generate
  → validate + create
    GenerationJob (DB)
  → enqueue BullMQ job ──────────→  processGenerationJob()
  → return { jobId }                  │
                                      ├─ Phase: planning
GET /ai/generate/:jobId               │   └─ AI generates outline
  → return current progress           ├─ Phase: world-bible
                                      │   └─ AI fleshes out entities
SSE /ai/generate/:jobId/stream        ├─ Phase: generating
  → stream progress updates           │   └─ For each chapter:
    from DB polling or pub/sub         │       ├─ Generate sections
                                      │       └─ Extract entities → world bible
POST /ai/generate/:jobId/cancel       ├─ Phase: assembly
  → set cancelled flag                │   └─ Build final document
                                      ├─ Phase: review (if polished)
                                      │   └─ AI reviews + patches
                                      └─ Write Project.content
```

The worker reuses the existing `generateText()` and `markdownToTipTap()` infrastructure. AI calls happen directly in the worker (not via HTTP), bypassing rate limits.

### Database Schema Changes

New model `GenerationJob` tracks the full lifecycle:

```prisma
enum GenerationPhase {
  conversation    // still chatting with user
  planning        // generating hierarchical outline
  world_bible     // fleshing out entities
  generating      // producing chapter content
  assembly        // building final document
  review          // AI self-review (polished mode only)
  completed
  failed
  cancelled
}

enum GenerationQuality {
  quick
  polished
}

model GenerationJob {
  id            String            @id @default(uuid())
  projectId     String            @map("project_id")
  userId        String            @map("user_id")
  phase         GenerationPhase   @default(planning)
  quality       GenerationQuality @default(quick)
  prompt        String                              // original user prompt
  outline       Json?                               // hierarchical outline
  worldBible    Json?             @map("world_bible") // accumulated entities
  chapters      Json              @default("[]")    // array of GeneratedChapter
  progress      Int               @default(0)       // 0-100
  currentStep   String?           @map("current_step") // human-readable status
  errorMsg      String?           @map("error_msg")
  reviewNotes   Json?             @map("review_notes") // AI review findings
  createdAt     DateTime          @default(now()) @map("created_at")
  updatedAt     DateTime          @updatedAt @map("updated_at")
  completedAt   DateTime?         @map("completed_at")

  project       Project           @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user          User              @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@index([userId])
  @@index([phase])
  @@map("generation_jobs")
}
```

### Shared Types

```typescript
// shared/src/types/generation.ts

export type GenerationPhase =
  | 'planning' | 'world_bible' | 'generating'
  | 'assembly' | 'review' | 'completed' | 'failed' | 'cancelled';

export type GenerationQuality = 'quick' | 'polished';

export interface HierarchicalOutline {
  title: string;
  summary: string;
  projectType: string;
  targetPageCount?: number;
  frontMatter: FrontMatterConfig;
  chapters: ChapterOutline[];
  appendices: AppendixOutline[];
  backMatter: BackMatterConfig;
}

export interface FrontMatterConfig {
  titlePage: { title: string; subtitle: string; author: string };
  includeTableOfContents: boolean;
}

export interface BackMatterConfig {
  includeCreditsPage: boolean;
  includeBackCover: boolean;
  credits?: string;
  backCoverBlurb?: string;
}

export interface ChapterOutline {
  id: string;           // "chapter-1"
  title: string;
  chapterNumber: number;
  description: string;  // 2-3 sentences
  sections: SectionOutline[];
}

export interface SectionOutline {
  id: string;           // "chapter-1.section-1"
  title: string;
  description: string;
  blockHints: string[];
  estimatedLength: 'short' | 'medium' | 'long';  // ~1 page, ~2-3 pages, ~4+ pages
}

export interface AppendixOutline {
  id: string;           // "appendix-a"
  title: string;
  type: 'monster_compendium' | 'magic_items' | 'maps' | 'handouts' | 'custom';
  description: string;
  autoGenerate: boolean; // true = built from world bible data
}

export interface WorldBible {
  setting: {
    name: string;
    description: string;
    era?: string;
    tone?: string;
  };
  npcs: WorldBibleNPC[];
  locations: WorldBibleLocation[];
  items: WorldBibleItem[];
  factions: WorldBibleFaction[];
  plotThreads: WorldBiblePlotThread[];
}

export interface WorldBibleNPC {
  name: string;
  role: string;          // "villain", "ally", "quest giver", etc.
  race: string;
  class?: string;
  location: string;
  description: string;
  personality: string;
  cr?: string;
  appearsIn: string[];   // chapter/section IDs
}

export interface WorldBibleLocation {
  name: string;
  type: string;          // "dungeon", "town", "wilderness", etc.
  description: string;
  connections: string[]; // other location names
  appearsIn: string[];
}

export interface WorldBibleItem {
  name: string;
  type: string;
  rarity: string;
  description: string;
  foundIn: string;       // section ID where it appears
}

export interface WorldBibleFaction {
  name: string;
  goals: string;
  allies: string[];
  enemies: string[];
  appearsIn: string[];
}

export interface WorldBiblePlotThread {
  name: string;
  description: string;
  status: 'introduced' | 'developing' | 'climax' | 'resolved';
  chapters: string[];    // chapter IDs involved
}

export interface GeneratedChapter {
  chapterId: string;
  title: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  sections: GeneratedSection[];
  extractedEntities?: ExtractedEntities; // NPCs, items, etc. found during generation
  error?: string;
}

export interface GeneratedSection {
  sectionId: string;
  title: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  content: unknown;      // TipTap JSON
  markdown?: string;
  error?: string;
}

export interface ExtractedEntities {
  npcs: string[];       // names — matched against world bible
  locations: string[];
  items: string[];
}

export interface GenerationProgress {
  jobId: string;
  phase: GenerationPhase;
  quality: GenerationQuality;
  progress: number;      // 0-100
  currentStep: string;   // "Generating Chapter 3: The Catacombs"
  outline: HierarchicalOutline | null;
  chapters: { id: string; title: string; status: string }[];
  reviewNotes: ReviewFindings | null;
  error: string | null;
}

export interface ReviewFindings {
  overallScore: number;
  issues: ReviewIssue[];
  patchesApplied: number;
}

export interface ReviewIssue {
  type: 'consistency' | 'balance' | 'cross_reference' | 'narrative' | 'missing_content';
  severity: 'error' | 'warning' | 'info';
  description: string;
  location?: string;     // chapter/section reference
  fixed: boolean;
}

/** SSE events for real-time progress streaming */
export type GenerationEvent =
  | { type: 'phase_change'; phase: GenerationPhase }
  | { type: 'outline_ready'; outline: HierarchicalOutline }
  | { type: 'world_bible_ready'; worldBible: WorldBible }
  | { type: 'chapter_start'; chapterId: string; title: string }
  | { type: 'section_start'; sectionId: string; title: string }
  | { type: 'section_done'; sectionId: string }
  | { type: 'chapter_done'; chapterId: string }
  | { type: 'progress'; percent: number; currentStep: string }
  | { type: 'review_start' }
  | { type: 'review_done'; findings: ReviewFindings }
  | { type: 'completed' }
  | { type: 'error'; error: string };
```

### AI Prompt Strategy

Each phase uses a specialized system prompt:

**Planning prompt** — Given user prompt + conversation context, generate a `HierarchicalOutline`. The AI decides chapter count and section granularity based on project type.

**World bible prompt** — Given outline, generate a full `WorldBible`. The AI invents NPCs, locations, items, factions, and plot threads that match the outline.

**Chapter generation prompt** — Given:
1. The full world bible (compacted)
2. The chapter outline (sections, descriptions, block hints)
3. Summaries of all previous chapters (~500 chars each, not 300)
4. The overall adventure summary

Generate all sections for this chapter as markdown with `:::blockType` fences.

**Entity extraction prompt** — After each chapter, extract any new NPCs, locations, items mentioned and merge into the world bible.

**Review prompt** (polished mode) — Given the full generated document outline + world bible, identify:
- Consistency issues (NPC name spelled differently, stat block CR mismatches)
- Balance issues (too many encounters in one chapter, missing rest opportunities)
- Cross-reference gaps (item mentioned but never given, NPC referenced but not introduced)
- Narrative gaps (plot threads unresolved, pacing issues)

**Patch prompt** — For each issue found, generate a targeted fix (updateAttrs, replace text, add missing content).

### API Endpoints

```
POST   /projects/:projectId/ai/generate          — Start a generation job
GET    /projects/:projectId/ai/generate/:jobId    — Get job status + progress
GET    /projects/:projectId/ai/generate/:jobId/stream — SSE progress stream
POST   /projects/:projectId/ai/generate/:jobId/apply  — Apply results to project
POST   /projects/:projectId/ai/generate/:jobId/cancel — Cancel job
DELETE /projects/:projectId/ai/generate/:jobId    — Delete job
```

### Client Integration

The AI chat panel gets a new `GenerationProgress` component (similar to `WizardChatProgress` but richer). The AI emits a trigger (tool call or control block), the server creates the background job, and the client polls or streams progress.

The existing wizard flow (`_wizardGenerate`) continues to work for quick inline generation. The new autonomous generation is a separate, more powerful pipeline triggered when the AI determines the scope warrants it (or when the user explicitly requests full generation).

---

## Implementation Tasks

### Task 1: Shared Types

**Files:**
- Create: `shared/src/types/generation.ts`
- Modify: `shared/src/index.ts` (add export)

**Step 1: Create the generation types file**

Write `shared/src/types/generation.ts` with all types defined in the "Shared Types" section above: `GenerationPhase`, `GenerationQuality`, `HierarchicalOutline`, `FrontMatterConfig`, `BackMatterConfig`, `ChapterOutline`, `SectionOutline`, `AppendixOutline`, `WorldBible`, `WorldBibleNPC`, `WorldBibleLocation`, `WorldBibleItem`, `WorldBibleFaction`, `WorldBiblePlotThread`, `GeneratedChapter`, `GeneratedSection`, `ExtractedEntities`, `GenerationProgress`, `ReviewFindings`, `ReviewIssue`, `GenerationEvent`.

**Step 2: Export from shared index**

Add `export * from './types/generation.js';` to `shared/src/index.ts`.

**Step 3: Verify types compile**

Run: `npm run typecheck --workspace=shared`
Expected: PASS

**Step 4: Commit**

```bash
git add shared/src/types/generation.ts shared/src/index.ts
git commit -m "feat: add shared types for autonomous generation pipeline"
```

---

### Task 2: Database Migration

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: migration via `prisma migrate dev`

**Step 1: Add enums and model to schema**

Add to `server/prisma/schema.prisma`:

```prisma
enum GenerationPhase {
  planning
  world_bible
  generating
  assembly
  review
  completed
  failed
  cancelled
}

enum GenerationQuality {
  quick
  polished
}

model GenerationJob {
  id            String            @id @default(uuid())
  projectId     String            @map("project_id")
  userId        String            @map("user_id")
  phase         GenerationPhase   @default(planning)
  quality       GenerationQuality @default(quick)
  prompt        String
  outline       Json?
  worldBible    Json?             @map("world_bible")
  chapters      Json              @default("[]")
  progress      Int               @default(0)
  currentStep   String?           @map("current_step")
  errorMsg      String?           @map("error_msg")
  reviewNotes   Json?             @map("review_notes")
  createdAt     DateTime          @default(now()) @map("created_at")
  updatedAt     DateTime          @updatedAt @map("updated_at")
  completedAt   DateTime?         @map("completed_at")

  project       Project           @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user          User              @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@index([userId])
  @@index([phase])
  @@map("generation_jobs")
}
```

Add `generationJobs GenerationJob[]` to the `Project` model and `User` model relations.

**Step 2: Run migration**

Run: `DATABASE_URL="..." npx prisma migrate dev --name add-generation-job --schema=server/prisma/schema.prisma`
Expected: Migration applied successfully

**Step 3: Verify Prisma client**

Run: `DATABASE_URL="..." npx prisma generate --schema=server/prisma/schema.prisma`
Expected: Generated Prisma Client

**Step 4: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat: add GenerationJob model for autonomous generation"
```

---

### Task 3: Generation Job Service (CRUD)

**Files:**
- Create: `server/src/services/generation-job.service.ts`
- Test: `server/src/__tests__/generation-job.test.ts`

**Step 1: Write tests for job CRUD**

Test file `server/src/__tests__/generation-job.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../config/database.js';
import * as genService from '../services/generation-job.service.js';

// Test helpers — create user + project in beforeAll, clean up in afterAll

describe('GenerationJob Service', () => {
  it('should create a generation job', async () => {
    const job = await genService.createJob(projectId, userId, 'Create a level 5 one-shot', 'quick');
    expect(job.id).toBeDefined();
    expect(job.phase).toBe('planning');
    expect(job.quality).toBe('quick');
    expect(job.prompt).toBe('Create a level 5 one-shot');
    expect(job.progress).toBe(0);
  });

  it('should get a job by id', async () => { ... });
  it('should update job phase and progress', async () => { ... });
  it('should update outline', async () => { ... });
  it('should update world bible', async () => { ... });
  it('should update chapters with generated content', async () => { ... });
  it('should cancel a job', async () => { ... });
  it('should list jobs for a project', async () => { ... });
  it('should not return jobs for wrong user', async () => { ... });
  it('should delete a job', async () => { ... });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/__tests__/generation-job.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the service**

Create `server/src/services/generation-job.service.ts`:

```typescript
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import type { GenerationPhase, GenerationQuality, HierarchicalOutline, WorldBible, GeneratedChapter, ReviewFindings } from '@dnd-booker/shared';

export async function createJob(
  projectId: string,
  userId: string,
  prompt: string,
  quality: GenerationQuality,
) {
  return prisma.generationJob.create({
    data: { projectId, userId, prompt, quality },
  });
}

export async function getJob(jobId: string, userId: string) {
  return prisma.generationJob.findFirst({
    where: { id: jobId, userId },
  });
}

export async function listJobs(projectId: string, userId: string, limit = 10) {
  return prisma.generationJob.findMany({
    where: { projectId, userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function updatePhase(
  jobId: string,
  phase: GenerationPhase,
  currentStep?: string,
) {
  const data: Record<string, unknown> = { phase, currentStep: currentStep ?? null };
  if (phase === 'completed' || phase === 'failed' || phase === 'cancelled') {
    data.completedAt = new Date();
  }
  return prisma.generationJob.update({ where: { id: jobId }, data });
}

export async function updateProgress(jobId: string, progress: number, currentStep?: string) {
  return prisma.generationJob.update({
    where: { id: jobId },
    data: { progress, currentStep: currentStep ?? undefined },
  });
}

export async function updateOutline(jobId: string, outline: HierarchicalOutline) {
  return prisma.generationJob.update({
    where: { id: jobId },
    data: { outline: outline as unknown as Prisma.InputJsonValue },
  });
}

export async function updateWorldBible(jobId: string, worldBible: WorldBible) {
  return prisma.generationJob.update({
    where: { id: jobId },
    data: { worldBible: worldBible as unknown as Prisma.InputJsonValue },
  });
}

export async function updateChapters(jobId: string, chapters: GeneratedChapter[]) {
  return prisma.generationJob.update({
    where: { id: jobId },
    data: { chapters: chapters as unknown as Prisma.InputJsonValue },
  });
}

export async function updateReviewNotes(jobId: string, reviewNotes: ReviewFindings) {
  return prisma.generationJob.update({
    where: { id: jobId },
    data: { reviewNotes: reviewNotes as unknown as Prisma.InputJsonValue },
  });
}

export async function failJob(jobId: string, errorMsg: string) {
  return prisma.generationJob.update({
    where: { id: jobId },
    data: { phase: 'failed', errorMsg, completedAt: new Date() },
  });
}

export async function cancelJob(jobId: string) {
  return prisma.generationJob.update({
    where: { id: jobId },
    data: { phase: 'cancelled', completedAt: new Date() },
  });
}

export async function deleteJob(jobId: string, userId: string) {
  const job = await prisma.generationJob.findFirst({ where: { id: jobId, userId } });
  if (!job) return null;
  return prisma.generationJob.delete({ where: { id: jobId } });
}
```

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/__tests__/generation-job.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/src/services/generation-job.service.ts server/src/__tests__/generation-job.test.ts
git commit -m "feat: add GenerationJob service with CRUD operations"
```

---

### Task 4: AI Prompt Builders for Each Phase

**Files:**
- Create: `server/src/services/generation-prompts.service.ts`
- Test: `server/src/__tests__/generation-prompts.test.ts`

**Step 1: Write tests for prompt builders**

Test that each prompt builder returns a well-formed string containing the expected context. Test the outline parser returns a valid `HierarchicalOutline`. Test the world bible parser returns a valid `WorldBible`. Test the entity extractor pulls names from markdown.

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/__tests__/generation-prompts.test.ts`
Expected: FAIL

**Step 3: Implement prompt builders**

Create `server/src/services/generation-prompts.service.ts` with:

- `buildPlanningPrompt(userPrompt, projectType?, conversationContext?)` → string
  - Instructs AI to produce a `HierarchicalOutline` JSON
  - Scales chapter/section count based on scope words in prompt ("one-shot" vs "campaign" vs "sourcebook")
  - Includes all available block types
  - Returns ONLY JSON, no explanation

- `buildWorldBiblePrompt(outline: HierarchicalOutline)` → string
  - Given the outline, generate a complete `WorldBible` JSON
  - Instructs AI to invent NPCs, locations, items, factions for every chapter
  - Cross-reference entities across chapters

- `buildChapterPrompt(outline, chapter, worldBible, previousChapterSummaries)` → string
  - Full world bible as context (compacted — names + roles, not full descriptions)
  - Chapter outline with section descriptions and block hints
  - Previous chapter summaries (~500 chars each)
  - :::blockType syntax instructions (reuse from existing wizard)

- `buildEntityExtractionPrompt(chapterMarkdown, worldBible)` → string
  - Extract new NPCs, locations, items mentioned in the chapter
  - Return as JSON to merge into world bible

- `buildReviewPrompt(outline, worldBible, chapterSummaries)` → string
  - Review for consistency, balance, cross-references, narrative coherence
  - Return structured `ReviewFindings` JSON

- `buildPatchPrompt(issue: ReviewIssue, relevantContent)` → string
  - Generate a targeted fix for one review issue

- `parseHierarchicalOutline(rawText)` → `HierarchicalOutline | null`
- `parseWorldBible(rawText)` → `WorldBible | null`
- `parseExtractedEntities(rawText)` → `ExtractedEntities | null`
- `parseReviewFindings(rawText)` → `ReviewFindings | null`

Each parser: strip markdown fences, find JSON boundaries, parse, validate shape, return null on failure.

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/__tests__/generation-prompts.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/src/services/generation-prompts.service.ts server/src/__tests__/generation-prompts.test.ts
git commit -m "feat: add AI prompt builders and parsers for generation phases"
```

---

### Task 5: Generation Orchestrator (Core Engine)

**Files:**
- Create: `server/src/services/generation-orchestrator.service.ts`
- Test: `server/src/__tests__/generation-orchestrator.test.ts`

This is the main engine that drives the phase pipeline. It's called by the BullMQ worker job.

**Step 1: Write tests**

Test the orchestrator with mocked AI calls:
- `it('should run planning phase and produce an outline')`
- `it('should run world bible phase and produce entities')`
- `it('should generate a chapter with world bible context')`
- `it('should extract entities after chapter generation')`
- `it('should assemble final document from chapters')`
- `it('should run review phase in polished mode')`
- `it('should skip review phase in quick mode')`
- `it('should handle cancelled jobs')`
- `it('should handle AI failures gracefully')`

Mock `generateText` from Vercel AI SDK to return predictable responses.

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/__tests__/generation-orchestrator.test.ts`
Expected: FAIL

**Step 3: Implement the orchestrator**

Create `server/src/services/generation-orchestrator.service.ts`:

```typescript
import { generateText } from 'ai';
import * as genJob from './generation-job.service.js';
import * as genPrompts from './generation-prompts.service.js';
import * as wizard from './ai-wizard.service.js'; // reuse markdownToTipTap
import { getModelForUser } from './ai-provider.service.js';
import type { HierarchicalOutline, WorldBible, GeneratedChapter, GeneratedSection } from '@dnd-booker/shared';

interface OrchestrationContext {
  jobId: string;
  userId: string;
  projectId: string;
  abortSignal?: AbortSignal;
  onProgress?: (percent: number, step: string) => void;
}

export async function runGeneration(ctx: OrchestrationContext): Promise<void> {
  const job = await genJob.getJob(ctx.jobId, ctx.userId);
  if (!job) throw new Error('Job not found');

  const userModel = await getModelForUser(ctx.userId);
  if (!userModel) {
    await genJob.failJob(ctx.jobId, 'AI not configured');
    return;
  }

  try {
    // Phase 1: Planning
    await genJob.updatePhase(ctx.jobId, 'planning', 'Generating adventure outline...');
    const outline = await runPlanningPhase(job.prompt, userModel.model, ctx);
    await genJob.updateOutline(ctx.jobId, outline);
    reportProgress(ctx, 10, 'Outline complete');

    // Phase 2: World Bible
    await genJob.updatePhase(ctx.jobId, 'world_bible', 'Building world bible...');
    const worldBible = await runWorldBiblePhase(outline, userModel.model, ctx);
    await genJob.updateWorldBible(ctx.jobId, worldBible);
    reportProgress(ctx, 20, 'World bible complete');

    // Phase 3: Chapter Generation
    await genJob.updatePhase(ctx.jobId, 'generating', 'Generating chapters...');
    const { chapters, updatedWorldBible } = await runGenerationPhase(
      outline, worldBible, userModel, ctx
    );
    await genJob.updateChapters(ctx.jobId, chapters);
    await genJob.updateWorldBible(ctx.jobId, updatedWorldBible);

    // Phase 4: Assembly
    await genJob.updatePhase(ctx.jobId, 'assembly', 'Assembling document...');
    const documentContent = assembleDocument(outline, chapters);
    // Write to project
    await prisma.project.update({
      where: { id: ctx.projectId },
      data: { content: documentContent },
    });
    reportProgress(ctx, 90, 'Document assembled');

    // Phase 5: Review (polished mode only)
    if (job.quality === 'polished') {
      await genJob.updatePhase(ctx.jobId, 'review', 'Reviewing for consistency...');
      const findings = await runReviewPhase(outline, updatedWorldBible, chapters, userModel.model, ctx);
      await genJob.updateReviewNotes(ctx.jobId, findings);
      reportProgress(ctx, 100, 'Review complete');
    }

    await genJob.updatePhase(ctx.jobId, 'completed', 'Generation complete');
    reportProgress(ctx, 100, 'Done');

  } catch (err) {
    if (ctx.abortSignal?.aborted) {
      await genJob.cancelJob(ctx.jobId);
    } else {
      await genJob.failJob(ctx.jobId, err instanceof Error ? err.message : 'Unknown error');
    }
  }
}
```

Key implementation details:

- **`runPlanningPhase`**: Calls `generateText` with planning prompt, parses outline, retries once on parse failure
- **`runWorldBiblePhase`**: Calls `generateText` with world bible prompt, parses response
- **`runGenerationPhase`**: Iterates chapters sequentially. For each chapter, generates all sections (reuses `markdownToTipTap`). After each chapter, runs entity extraction and merges into world bible. Progress 20-85%.
- **`assembleDocument`**: Builds final TipTap JSON:
  1. Front matter (titlePage, tableOfContents)
  2. For each chapter: chapterHeader + pageBreak + sections with pageBreaks
  3. Appendices (auto-generated from world bible: monster compendium, magic items, etc.)
  4. Back matter (creditsPage, backCover)
- **`runReviewPhase`**: Calls `generateText` with review prompt. Parses findings. For each fixable issue, generates a patch and applies it. Progress 85-100%.
- **`reportProgress`**: Calls `genJob.updateProgress` and `ctx.onProgress` callback.

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/__tests__/generation-orchestrator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/src/services/generation-orchestrator.service.ts server/src/__tests__/generation-orchestrator.test.ts
git commit -m "feat: add generation orchestrator with phased pipeline"
```

---

### Task 6: BullMQ Worker Job

**Files:**
- Create: `worker/src/jobs/generation.job.ts`
- Modify: `worker/src/index.ts` (register new worker)
- Create: `server/src/services/generation-queue.service.ts` (enqueue from server)

**Step 1: Create the worker job**

Create `worker/src/jobs/generation.job.ts`:

```typescript
import { Job } from 'bullmq';
import { runGeneration } from '../../server/src/services/generation-orchestrator.service.js';
// NOTE: The worker needs access to server services. Two options:
// A) Import directly (worker already shares the monorepo)
// B) Extract orchestrator to shared package
// Use option A for now — worker already imports prisma from server config

export async function processGenerationJob(job: Job<{ jobId: string; userId: string; projectId: string }>) {
  const { jobId, userId, projectId } = job.data;
  const abortController = new AbortController();

  // Listen for job cancellation
  // BullMQ doesn't have native cancel — check DB flag periodically
  const cancelCheck = setInterval(async () => {
    const genJob = await prisma.generationJob.findUnique({ where: { id: jobId } });
    if (genJob?.phase === 'cancelled') {
      abortController.abort();
      clearInterval(cancelCheck);
    }
  }, 5000);

  try {
    await runGeneration({
      jobId,
      userId,
      projectId,
      abortSignal: abortController.signal,
      onProgress: async (percent, step) => {
        await job.updateProgress(percent);
        // Also publish to Redis pub/sub for SSE streaming
        await publishProgress(jobId, percent, step);
      },
    });
  } finally {
    clearInterval(cancelCheck);
  }
}
```

**Step 2: Register in worker index**

Add to `worker/src/index.ts`:
- Import `processGenerationJob`
- Create new `Worker('generation', processGenerationJob, { connection, concurrency: 1 })`
- Add to shutdown sequence

**Step 3: Create server-side queue service**

Create `server/src/services/generation-queue.service.ts`:

```typescript
import { Queue, ConnectionOptions } from 'bullmq';
import { redis } from '../config/redis.js';

const generationQueue = new Queue('generation', { connection: redis as unknown as ConnectionOptions });

export async function enqueueGeneration(jobId: string, userId: string, projectId: string) {
  await generationQueue.add('generate', { jobId, userId, projectId }, {
    attempts: 1,        // no auto-retry — failures are handled in orchestrator
    removeOnComplete: { age: 86400 }, // keep completed jobs for 24h
    removeOnFail: { age: 86400 },
  });
}
```

**Step 4: Commit**

```bash
git add worker/src/jobs/generation.job.ts worker/src/index.ts server/src/services/generation-queue.service.ts
git commit -m "feat: add BullMQ generation worker job and queue service"
```

---

### Task 7: API Routes

**Files:**
- Create: `server/src/routes/generation.ts`
- Modify: `server/src/index.ts` (mount routes)
- Test: `server/src/__tests__/generation-routes.test.ts`

**Step 1: Write route tests**

Test each endpoint:
- `POST /projects/:id/ai/generate` — creates job, returns jobId
- `GET /projects/:id/ai/generate/:jobId` — returns progress
- `GET /projects/:id/ai/generate/:jobId/stream` — SSE connection
- `POST /projects/:id/ai/generate/:jobId/apply` — applies content to project
- `POST /projects/:id/ai/generate/:jobId/cancel` — cancels job
- `DELETE /projects/:id/ai/generate/:jobId` — deletes job

Test auth, ownership checks, invalid states.

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/__tests__/generation-routes.test.ts`
Expected: FAIL

**Step 3: Implement routes**

Create `server/src/routes/generation.ts`:

```typescript
import { Router, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async-handler.js';
import { validateUuid } from '../middleware/validate-uuid.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import * as genJob from '../services/generation-job.service.js';
import { enqueueGeneration } from '../services/generation-queue.service.js';

export const generationRoutes = Router({ mergeParams: true });
generationRoutes.use(requireAuth);

const startSchema = z.object({
  prompt: z.string().min(10).max(10000),
  quality: z.enum(['quick', 'polished']).default('quick'),
});

// POST /projects/:projectId/ai/generate
generationRoutes.post('/', validateUuid('projectId'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  // Verify project ownership
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: req.userId! } });
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  // Check for existing active job
  const active = await genJob.getActiveJob(projectId, req.userId!);
  if (active) { res.status(409).json({ error: 'A generation job is already running', jobId: active.id }); return; }

  const job = await genJob.createJob(projectId, req.userId!, parsed.data.prompt, parsed.data.quality);
  await enqueueGeneration(job.id, req.userId!, projectId);

  res.status(201).json({ jobId: job.id, phase: job.phase, progress: 0 });
}));

// GET /projects/:projectId/ai/generate/:jobId
generationRoutes.get('/:jobId', validateUuid('projectId'), validateUuid('jobId'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const job = await genJob.getJob(req.params.jobId as string, req.userId!);
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  res.json(toProgressResponse(job));
}));

// GET /projects/:projectId/ai/generate/:jobId/stream — SSE
generationRoutes.get('/:jobId/stream', validateUuid('projectId'), validateUuid('jobId'), asyncHandler(async (req: AuthRequest, res: Response) => {
  // Set up SSE, poll DB every 2s or use Redis pub/sub
  // Send GenerationEvent objects as newline-delimited JSON
  // Close when job reaches terminal phase
}));

// POST /projects/:projectId/ai/generate/:jobId/apply
generationRoutes.post('/:jobId/apply', validateUuid('projectId'), validateUuid('jobId'), asyncHandler(async (req: AuthRequest, res: Response) => {
  // Only works when phase = 'completed'
  // Reads generated content from job, writes to Project.content
  // (Content was already written during assembly, but this allows re-apply)
}));

// POST /projects/:projectId/ai/generate/:jobId/cancel
generationRoutes.post('/:jobId/cancel', validateUuid('projectId'), validateUuid('jobId'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const job = await genJob.getJob(req.params.jobId as string, req.userId!);
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  await genJob.cancelJob(job.id);
  res.json({ cancelled: true });
}));

// DELETE /projects/:projectId/ai/generate/:jobId
generationRoutes.delete('/:jobId', validateUuid('projectId'), validateUuid('jobId'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await genJob.deleteJob(req.params.jobId as string, req.userId!);
  if (!result) { res.status(404).json({ error: 'Job not found' }); return; }
  res.json({ deleted: true });
}));
```

**Step 4: Mount routes in server index**

Add to `server/src/index.ts`:
```typescript
import { generationRoutes } from './routes/generation.js';
app.use('/api/projects/:projectId/ai/generate', generationRoutes);
```

**Step 5: Run tests to verify they pass**

Run: `cd server && npx vitest run src/__tests__/generation-routes.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add server/src/routes/generation.ts server/src/index.ts server/src/__tests__/generation-routes.test.ts
git commit -m "feat: add generation API routes with SSE streaming"
```

---

### Task 8: Document Assembler

**Files:**
- Create: `server/src/services/generation-assembler.service.ts`
- Test: `server/src/__tests__/generation-assembler.test.ts`

The assembler builds a complete TipTap document from generated chapters.

**Step 1: Write tests**

- `it('should assemble front matter (titlePage, TOC)')`
- `it('should insert chapter headers with page breaks between chapters')`
- `it('should generate monster compendium appendix from world bible NPCs with CR')`
- `it('should generate magic items appendix from world bible items')`
- `it('should add credits page and back cover')`
- `it('should handle one-shot (single chapter, minimal front/back matter)')`
- `it('should handle sourcebook with many appendices')`

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/__tests__/generation-assembler.test.ts`
Expected: FAIL

**Step 3: Implement assembler**

Create `server/src/services/generation-assembler.service.ts`:

```typescript
import type { HierarchicalOutline, GeneratedChapter, WorldBible } from '@dnd-booker/shared';

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: Array<{ type: string }>;
}

export function assembleDocument(
  outline: HierarchicalOutline,
  chapters: GeneratedChapter[],
  worldBible: WorldBible,
): { type: 'doc'; content: TipTapNode[] } {
  const nodes: TipTapNode[] = [];

  // 1. Front matter
  nodes.push({
    type: 'titlePage',
    attrs: {
      title: outline.frontMatter.titlePage.title,
      subtitle: outline.frontMatter.titlePage.subtitle,
      author: outline.frontMatter.titlePage.author,
      coverImageUrl: '',
    },
  });

  if (outline.frontMatter.includeTableOfContents) {
    nodes.push({ type: 'pageBreak' });
    nodes.push({ type: 'tableOfContents', attrs: { title: 'Table of Contents' } });
  }

  // 2. Chapters
  for (const chapter of chapters) {
    if (chapter.status !== 'completed') continue;
    nodes.push({ type: 'pageBreak' });
    nodes.push({
      type: 'chapterHeader',
      attrs: {
        title: chapter.title,
        chapterNumber: String(outline.chapters.find(c => c.id === chapter.chapterId)?.chapterNumber ?? ''),
        subtitle: '',
        backgroundImage: '',
      },
    });

    for (const section of chapter.sections) {
      if (section.status !== 'completed' || !section.content) continue;
      const sectionContent = section.content as { content?: TipTapNode[] };
      if (sectionContent.content) {
        nodes.push(...sectionContent.content);
      }
    }
  }

  // 3. Appendices (auto-generated from world bible)
  for (const appendix of outline.appendices) {
    if (!appendix.autoGenerate) continue;
    nodes.push({ type: 'pageBreak' });
    const appendixNodes = generateAppendix(appendix, worldBible);
    nodes.push(...appendixNodes);
  }

  // 4. Back matter
  if (outline.backMatter.includeCreditsPage) {
    nodes.push({ type: 'pageBreak' });
    nodes.push({
      type: 'creditsPage',
      attrs: {
        credits: outline.backMatter.credits || 'Written by the author',
        legalText: 'This work includes material taken from the System Reference Document 5.1.',
        copyrightYear: new Date().getFullYear().toString(),
      },
    });
  }

  if (outline.backMatter.includeBackCover) {
    nodes.push({ type: 'pageBreak' });
    nodes.push({
      type: 'backCover',
      attrs: {
        blurb: outline.backMatter.backCoverBlurb || outline.summary,
        authorBio: '',
        authorImageUrl: '',
      },
    });
  }

  return { type: 'doc', content: nodes };
}

function generateAppendix(appendix: AppendixOutline, worldBible: WorldBible): TipTapNode[] {
  // Generate stat blocks for monster compendium, magic items for items appendix, etc.
  // Uses world bible data to create actual TipTap block nodes
}
```

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/__tests__/generation-assembler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/src/services/generation-assembler.service.ts server/src/__tests__/generation-assembler.test.ts
git commit -m "feat: add document assembler for front/back matter and appendices"
```

---

### Task 9: Chat Integration (AI Trigger)

**Files:**
- Modify: `server/src/services/ai-content.service.ts` (update system prompt)
- Create: `server/src/services/ai-tools/content/start-generation.ts` (new tool)
- Modify: `server/src/services/ai-tools/register-all.ts` (register tool)
- Test: `server/src/__tests__/ai-tools/start-generation.test.ts`

**Step 1: Write tests for the start-generation tool**

```typescript
it('should create a generation job and enqueue it');
it('should reject if a job is already active');
it('should accept quick and polished quality modes');
it('should store the prompt from tool params');
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/__tests__/ai-tools/start-generation.test.ts`
Expected: FAIL

**Step 3: Create the start-generation tool**

Create `server/src/services/ai-tools/content/start-generation.ts`:

```typescript
import { z } from 'zod';
import type { ToolDefinition } from '../types.js';
import * as genJob from '../../generation-job.service.js';
import { enqueueGeneration } from '../../generation-queue.service.js';

export const startGenerationTool: ToolDefinition = {
  name: 'startGeneration',
  description: 'Start autonomous content generation for a project. Use when the user wants to create a full adventure, campaign, or sourcebook. The generation runs as a background job.',
  parameters: z.object({
    prompt: z.string().min(10).max(10000).describe('Detailed description of what to generate, incorporating all user answers and context'),
    quality: z.enum(['quick', 'polished']).default('quick').describe('quick = single pass, polished = generation + review passes'),
    projectType: z.enum(['one_shot', 'campaign', 'supplement', 'sourcebook']).optional().describe('Helps calibrate chapter/section counts'),
  }),
  contexts: ['project-chat'],
  execute: async (params, ctx) => {
    const { prompt, quality } = params as { prompt: string; quality: 'quick' | 'polished' };

    // Check for active job
    const active = await genJob.getActiveJob(ctx.projectId, ctx.userId);
    if (active) {
      return { success: false, error: { code: 'CONFLICT' as const, message: 'A generation job is already running.' } };
    }

    const job = await genJob.createJob(ctx.projectId, ctx.userId, prompt, quality);
    await enqueueGeneration(job.id, ctx.userId, ctx.projectId);

    return {
      success: true,
      data: {
        jobId: job.id,
        message: `Generation started in ${quality} mode. The content will be generated in the background.`,
      },
    };
  },
};
```

**Step 4: Register the tool**

Add to `server/src/services/ai-tools/register-all.ts`:
```typescript
import { startGenerationTool } from './content/start-generation.js';
// In createRegistry():
registry.register(startGenerationTool);
```

**Step 5: Update system prompt**

Add to `SYSTEM_PROMPT` in `server/src/services/ai-content.service.ts`:

```
=== AUTONOMOUS GENERATION ===
For creating full adventures, campaigns, or sourcebooks, use the `startGeneration` tool instead of the _wizardGenerate control block. This runs as a background job that:
- Generates a hierarchical outline (chapters + sections)
- Builds a world bible (NPCs, locations, items, factions)
- Generates all chapters with full cross-referencing
- Optionally reviews for consistency (polished mode)

Use startGeneration when:
- User asks to create a full adventure, campaign, module, or sourcebook
- The scope is more than a quick scene or encounter
- User says "go for it", "just make it", "generate everything"

When using startGeneration, compile ALL context from the conversation into the prompt parameter — user preferences, theme, level range, tone, special requests, answers to your questions. The background job won't have access to chat history.

For small, focused content (a single stat block, one scene), continue using individual block generation or _wizardGenerate.
=== END AUTONOMOUS GENERATION ===
```

**Step 6: Run tests to verify they pass**

Run: `cd server && npx vitest run src/__tests__/ai-tools/start-generation.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add server/src/services/ai-tools/content/start-generation.ts server/src/services/ai-tools/register-all.ts server/src/services/ai-content.service.ts server/src/__tests__/ai-tools/start-generation.test.ts
git commit -m "feat: add startGeneration tool and update system prompt"
```

---

### Task 10: Client — Generation Progress Component

**Files:**
- Create: `client/src/components/ai/GenerationProgress.tsx`
- Modify: `client/src/stores/aiStore.ts` (add generation state)

**Step 1: Add generation state to aiStore**

Add to `aiStore.ts`:

```typescript
// New state
generationJob: GenerationProgress | null;
startGeneration: (projectId: string, prompt: string, quality: GenerationQuality) => Promise<void>;
pollGenerationProgress: (projectId: string, jobId: string) => void;
cancelGeneration: (projectId: string, jobId: string) => Promise<void>;
```

Implement:
- `startGeneration`: POST to `/projects/:id/ai/generate`, store jobId, start polling
- `pollGenerationProgress`: GET `/projects/:id/ai/generate/:jobId` every 3 seconds, update store
- `cancelGeneration`: POST to `/projects/:id/ai/generate/:jobId/cancel`, clear store

**Step 2: Create GenerationProgress component**

Create `client/src/components/ai/GenerationProgress.tsx`:

Displays:
- Phase indicator (planning → world bible → generating → assembly → review → done)
- Overall progress bar (0-100%)
- Current step text ("Generating Chapter 3: The Catacombs")
- Chapter completion list (checkmarks as chapters complete)
- Quality mode badge (quick/polished)
- Cancel button
- When completed: "Generation Complete — View Document" button

Style: match existing WizardChatProgress purple accent, Tailwind utilities.

**Step 3: Integrate into AiChatPanel**

When the AI calls `startGeneration` tool and it returns success, the chat panel detects the tool result and renders `<GenerationProgress>` in the message stream (similar to how `WizardChatProgress` renders today).

**Step 4: Commit**

```bash
git add client/src/components/ai/GenerationProgress.tsx client/src/stores/aiStore.ts
git commit -m "feat: add GenerationProgress component and store integration"
```

---

### Task 11: Entity Extraction and World Bible Merging

**Files:**
- Create: `server/src/services/generation-worldbible.service.ts`
- Test: `server/src/__tests__/generation-worldbible.test.ts`

**Step 1: Write tests**

```typescript
it('should merge new NPCs into world bible without duplicates');
it('should update appearsIn when existing NPC appears in new chapter');
it('should add new locations and items');
it('should compact world bible for prompt context (under token limit)');
it('should handle empty extraction results');
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/__tests__/generation-worldbible.test.ts`
Expected: FAIL

**Step 3: Implement world bible service**

Create `server/src/services/generation-worldbible.service.ts`:

```typescript
import type { WorldBible, ExtractedEntities, WorldBibleNPC, WorldBibleLocation, WorldBibleItem } from '@dnd-booker/shared';

/** Merge extracted entities from a chapter into the world bible. */
export function mergeEntities(
  bible: WorldBible,
  extracted: ExtractedEntities,
  chapterId: string,
): WorldBible {
  // For each extracted NPC name, either add to existing appearsIn or create new entry
  // For locations and items, same logic
  // Return updated world bible
}

/** Compact the world bible for use as prompt context.
 *  Full bible could be large — this produces a condensed version
 *  with name + role + location for NPCs, name + type for items, etc.
 *  Target: under 4000 tokens (~16000 chars).
 */
export function compactWorldBible(bible: WorldBible): string {
  // NPCs: "- Gobrek (goblin chieftain, CR 3, Thornfield Caves)"
  // Locations: "- Thornfield Caves (dungeon, connected to: Thornfield Village)"
  // Items: "- Flamebrand Sword (rare longsword, found in: section-3.2)"
  // Factions: "- The Red Hand (cult, goal: resurrect dragon god)"
  // Plot threads: "- The Missing Merchant (introduced ch.1, developing ch.2-3)"
}

/** Build a full world bible from scratch (used by AI in world_bible phase). */
export function createEmptyWorldBible(): WorldBible {
  return {
    setting: { name: '', description: '' },
    npcs: [],
    locations: [],
    items: [],
    factions: [],
    plotThreads: [],
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/__tests__/generation-worldbible.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/src/services/generation-worldbible.service.ts server/src/__tests__/generation-worldbible.test.ts
git commit -m "feat: add world bible entity merging and compaction"
```

---

### Task 12: Review Pipeline (Polished Mode)

**Files:**
- Create: `server/src/services/generation-review.service.ts`
- Test: `server/src/__tests__/generation-review.test.ts`

**Step 1: Write tests**

```typescript
it('should identify inconsistent NPC names');
it('should flag unresolved plot threads');
it('should detect CR balance issues');
it('should return structured ReviewFindings');
it('should generate patches for fixable issues');
it('should apply patches to chapter content');
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/__tests__/generation-review.test.ts`
Expected: FAIL

**Step 3: Implement review service**

Create `server/src/services/generation-review.service.ts`:

```typescript
import { generateText } from 'ai';
import * as genPrompts from './generation-prompts.service.js';
import type { HierarchicalOutline, WorldBible, GeneratedChapter, ReviewFindings, ReviewIssue } from '@dnd-booker/shared';

export async function reviewDocument(
  outline: HierarchicalOutline,
  worldBible: WorldBible,
  chapters: GeneratedChapter[],
  model: Parameters<typeof generateText>[0]['model'],
  abortSignal?: AbortSignal,
): Promise<ReviewFindings> {
  // Build chapter summaries from generated content
  const summaries = chapters.map(ch => ({
    id: ch.chapterId,
    title: ch.title,
    summary: summarizeChapter(ch),
  }));

  const prompt = genPrompts.buildReviewPrompt(outline, worldBible, summaries);
  const { text } = await generateText({ model, prompt, maxOutputTokens: 8192, abortSignal });

  const findings = genPrompts.parseReviewFindings(text);
  if (!findings) {
    return { overallScore: 7, issues: [], patchesApplied: 0 };
  }

  return findings;
}

export async function applyPatches(
  findings: ReviewFindings,
  chapters: GeneratedChapter[],
  model: Parameters<typeof generateText>[0]['model'],
  abortSignal?: AbortSignal,
): Promise<{ patchedChapters: GeneratedChapter[]; patchCount: number }> {
  // For each fixable issue, generate a targeted patch
  // Apply patch to the relevant chapter's content
  // Return updated chapters and patch count
}

function summarizeChapter(chapter: GeneratedChapter): string {
  // Extract text content from TipTap JSON, take first 500 chars
}
```

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/__tests__/generation-review.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/src/services/generation-review.service.ts server/src/__tests__/generation-review.test.ts
git commit -m "feat: add AI review pipeline for polished mode"
```

---

### Task 13: Redis Pub/Sub for Real-Time Progress

**Files:**
- Create: `server/src/services/generation-pubsub.service.ts`
- Modify: `server/src/routes/generation.ts` (wire SSE stream endpoint)

**Step 1: Implement pub/sub service**

Create `server/src/services/generation-pubsub.service.ts`:

```typescript
import { redis } from '../config/redis.js';
import IORedis from 'ioredis';
import type { GenerationEvent } from '@dnd-booker/shared';

const CHANNEL_PREFIX = 'gen:progress:';

export async function publishProgress(jobId: string, event: GenerationEvent) {
  await redis.publish(`${CHANNEL_PREFIX}${jobId}`, JSON.stringify(event));
}

export function subscribeToProgress(
  jobId: string,
  callback: (event: GenerationEvent) => void,
): () => void {
  const subscriber = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  });

  const channel = `${CHANNEL_PREFIX}${jobId}`;
  subscriber.subscribe(channel);
  subscriber.on('message', (ch, message) => {
    if (ch === channel) {
      callback(JSON.parse(message));
    }
  });

  return () => {
    subscriber.unsubscribe(channel);
    subscriber.quit();
  };
}
```

**Step 2: Wire SSE endpoint**

Update the `/stream` route in `server/src/routes/generation.ts` to use `subscribeToProgress` and write events to the SSE response. Unsubscribe on client disconnect.

**Step 3: Commit**

```bash
git add server/src/services/generation-pubsub.service.ts server/src/routes/generation.ts
git commit -m "feat: add Redis pub/sub for real-time generation progress streaming"
```

---

### Task 14: Appendix Auto-Generation

**Files:**
- Modify: `server/src/services/generation-assembler.service.ts` (implement `generateAppendix`)
- Test: update `server/src/__tests__/generation-assembler.test.ts`

**Step 1: Write additional tests**

```typescript
it('should generate a monster compendium with stat blocks from world bible');
it('should generate magic items appendix from world bible items');
it('should generate maps index appendix');
it('should skip appendix if no relevant entities exist');
```

**Step 2: Run tests to verify they fail**

**Step 3: Implement appendix generators**

In `generation-assembler.service.ts`, implement `generateAppendix`:

- **`monster_compendium`**: For each NPC with `cr` in world bible, generate a `statBlock` node with available data. Add heading "Appendix A: Monster Compendium".
- **`magic_items`**: For each item in world bible, generate a `magicItem` node. Add heading.
- **`handouts`**: Collect handout-related sections and create player-facing versions.
- **`custom`**: Include as heading + placeholder paragraph for AI-generated appendix content.

**Step 4: Run tests to verify they pass**

**Step 5: Commit**

```bash
git add server/src/services/generation-assembler.service.ts server/src/__tests__/generation-assembler.test.ts
git commit -m "feat: add auto-generated appendices from world bible data"
```

---

### Task 15: End-to-End Integration Test

**Files:**
- Create: `server/src/__tests__/generation-e2e.test.ts`
- Create: `client/e2e/ai-autonomous-generation.spec.ts`

**Step 1: Write server integration test**

```typescript
describe('Generation E2E', () => {
  it('should run full pipeline: prompt → outline → world bible → chapters → assembly', async () => {
    // Create user + project
    // Call orchestrator directly with mocked AI
    // Verify: outline has chapters, world bible has entities,
    //   chapters are generated, document is assembled, project content is updated
  });

  it('should handle polished mode with review pass', async () => {
    // Same as above but quality = 'polished'
    // Verify review findings exist
  });
});
```

**Step 2: Write Playwright E2E test**

```typescript
test('should trigger autonomous generation from chat', async ({ page }) => {
  // Create project, open AI panel
  // Send: "Create a full one-shot adventure about a haunted mine for level 3 players. Go for it."
  // Wait for GenerationProgress component to appear
  // Wait for completion (poll, long timeout)
  // Verify document has content
});
```

**Step 3: Run tests**

Run: `cd server && npx vitest run src/__tests__/generation-e2e.test.ts`
Run: `cd client && npx playwright test ai-autonomous-generation.spec.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add server/src/__tests__/generation-e2e.test.ts client/e2e/ai-autonomous-generation.spec.ts
git commit -m "test: add E2E tests for autonomous generation pipeline"
```

---

### Task 16: Worker Import Path Fix

**Context:** The worker currently imports from its own `src/` tree. The generation job needs access to server services (`generation-orchestrator.service.ts`, `ai-provider.service.ts`, etc.). There are two approaches:

**Option A (recommended):** Move shared generation logic into the `shared/` package or create a thin worker entry point that imports from server.

**Option B:** Since this is an npm workspaces monorepo, the worker can import from `server/src/` directly using workspace resolution.

**Step 1:** Evaluate which server services the worker needs:
- `generation-orchestrator.service.ts` (the main engine)
- `generation-job.service.ts` (DB updates)
- `ai-provider.service.ts` (get AI model for user)
- `ai-wizard.service.ts` (markdownToTipTap)
- `generation-prompts.service.ts` (prompt builders)
- `generation-worldbible.service.ts` (entity merging)
- `generation-assembler.service.ts` (document assembly)
- `generation-review.service.ts` (review pipeline)
- Prisma client

**Step 2:** Since the worker already has its own Prisma client connection (`worker/src/config/database.ts`), the cleanest approach is to extract the orchestrator logic so it can be called from either the server or worker with a provided Prisma instance.

**Step 3:** Create `server/src/services/generation-orchestrator.service.ts` to accept a `prisma` parameter (dependency injection) rather than importing it directly. This lets the worker pass its own connection.

**Step 4:** Update `worker/src/jobs/generation.job.ts` to import from `server/src/services/` and pass the worker's Prisma instance.

**Step 5: Commit**

```bash
git commit -m "refactor: make generation orchestrator injectable for worker use"
```

---

## Task Dependency Graph

```
Task 1 (Shared Types)
    ↓
Task 2 (DB Migration)
    ↓
Task 3 (Job Service CRUD)
    ↓
Task 4 (Prompt Builders) ──────────────────┐
    ↓                                       ↓
Task 5 (Orchestrator) ←── Task 11 (World Bible Service)
    ↓                         ↓
Task 6 (BullMQ Worker) ←── Task 8 (Assembler) ←── Task 14 (Appendices)
    ↓                                                  ↓
Task 7 (API Routes) ←── Task 13 (Pub/Sub)        Task 12 (Review Pipeline)
    ↓
Task 9 (Chat Integration / AI Tool)
    ↓
Task 10 (Client Component)
    ↓
Task 15 (E2E Tests)
    ↓
Task 16 (Worker Import Fix)
```

**Critical path:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 9 → 10 → 15

**Parallelizable:** Tasks 8, 11, 12, 13, 14 can proceed in parallel with the critical path once Task 4 is done.

---

## Out of Scope (Future Work)

- **Content indexing** (Phase 4 from AI CRUD tools plan) — useful but not blocking
- **Client data stream parser** (Phase 3 from AI CRUD tools plan) — current SSE works
- **New block types** (factions, locations, quest hooks) — can use existing blocks
- **Image generation during autonomous flow** — add later as a generation phase
- **Collaborative editing during generation** — complex, defer
- **Cost estimation before generation** — nice to have, not critical
