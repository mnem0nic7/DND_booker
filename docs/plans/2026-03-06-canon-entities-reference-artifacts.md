# Phase 6: Canon Entities + Reference Artifacts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand the seed CanonEntity records (created by the bible step) into full reference artifacts — detailed NPC dossiers, location briefs, faction profiles, encounter bundles, and item bundles — before prose generation begins.

**Architecture:** A single `canon.service.ts` dispatches per-entity-type to five prompt builders. Each entity gets an AI call that returns structured JSON, validated by Zod, persisted as a `GeneratedArtifact` (type: `npc_dossier` | `location_brief` | `faction_profile` | `encounter_bundle` | `item_bundle`) and linked to the source `CanonEntity` via a `CanonReference` record. The entity's `canonicalData` is updated with enriched details.

**Tech Stack:** Vercel AI SDK (`generateText`), Zod, Prisma 6, Redis pub/sub

---

### Task 1: Shared Types for Reference Artifacts

**Files:**
- Create: `shared/src/types/reference-artifacts.ts`
- Modify: `shared/src/index.ts`

**Step 1: Create the reference artifact types**

```typescript
// shared/src/types/reference-artifacts.ts

/** Full NPC dossier — expands a bible entity seed into a detailed character reference. */
export interface NpcDossier {
  slug: string;
  name: string;
  race: string;
  class: string;
  level: number;
  alignment: string;
  role: string;
  appearance: string;
  personality: string;
  motivation: string;
  backstory: string;
  mannerisms: string[];
  dialogueHooks: string[];
  relationships: { name: string; slug: string; nature: string }[];
  secrets: string[];
  statBlock: {
    ac: number;
    hp: string;
    speed: string;
    abilities: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
    skills: string[];
    senses: string;
    languages: string[];
    cr: string;
  };
}

/** Detailed location reference with areas, features, and connections. */
export interface LocationBrief {
  slug: string;
  name: string;
  locationType: string;
  atmosphere: string;
  description: string;
  areas: { name: string; description: string; features: string[]; dangers: string[] }[];
  npcsPresent: { slug: string; name: string; role: string }[];
  secrets: string[];
  connections: { destination: string; description: string }[];
  environmentalEffects: string[];
}

/** Full faction reference with hierarchy, goals, and resources. */
export interface FactionProfile {
  slug: string;
  name: string;
  purpose: string;
  alignment: string;
  description: string;
  leader: { name: string; slug: string; title: string };
  hierarchy: { rank: string; description: string }[];
  goals: string[];
  resources: string[];
  relationships: { factionName: string; nature: string }[];
  plotHooks: string[];
  headquarters: string;
}

/** Tactical encounter details for a quest or location. */
export interface EncounterBundle {
  slug: string;
  name: string;
  description: string;
  difficulty: string;
  suggestedLevel: { min: number; max: number };
  setup: string;
  enemies: { name: string; count: number; cr: string; tactics: string }[];
  environment: { terrain: string; lighting: string; features: string[] };
  complications: string[];
  rewards: { name: string; description: string }[];
  scalingNotes: string;
}

/** Magic item or treasure bundle for an item entity. */
export interface ItemBundle {
  slug: string;
  name: string;
  itemType: string;
  rarity: string;
  description: string;
  mechanics: string;
  attunement: boolean;
  properties: string[];
  lore: string;
  history: string;
  quirks: string[];
}
```

**Step 2: Add export to shared/src/index.ts**

Add this line to `shared/src/index.ts`:
```typescript
export * from './types/reference-artifacts';
```

**Step 3: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker && npm run typecheck --workspace=shared`
Expected: PASS

**Step 4: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add shared/src/types/reference-artifacts.ts shared/src/index.ts
git commit -m "feat: add shared types for reference artifacts (NPC dossier, location brief, etc.)"
```

---

### Task 2: NPC Dossier Prompt Builder

**Files:**
- Create: `server/src/services/generation/prompts/npc-dossier.prompt.ts`

**Step 1: Create the NPC dossier prompt builder**

The system prompt instructs the AI to generate a detailed NPC dossier from a seed entity + bible context. The user prompt provides the entity seed data and relevant bible context (world rules, style guide).

```typescript
// server/src/services/generation/prompts/npc-dossier.prompt.ts
import type { BibleContent, BibleEntitySeed } from '@dnd-booker/shared';

export function buildNpcDossierSystemPrompt(): string {
  return `You are a D&D character designer. You expand a brief NPC seed into a full character dossier used as a reference throughout adventure writing.

You MUST respond with ONLY a JSON object (no markdown fences, no commentary). The JSON must match this exact schema:

{
  "slug": "kebab-case-slug",
  "name": "Full Name",
  "race": "Race",
  "class": "Class or occupation",
  "level": 5,
  "alignment": "XX",
  "role": "narrative role (antagonist, ally, quest giver, etc.)",
  "appearance": "2-3 sentence physical description",
  "personality": "2-3 sentence personality description",
  "motivation": "What drives this character",
  "backstory": "3-5 sentence backstory",
  "mannerisms": ["speech pattern", "physical habit"],
  "dialogueHooks": ["sample dialogue line or conversation starter"],
  "relationships": [{ "name": "Other NPC", "slug": "other-npc", "nature": "ally/rival/etc." }],
  "secrets": ["hidden knowledge or agenda"],
  "statBlock": {
    "ac": 15,
    "hp": "52 (8d8+16)",
    "speed": "30 ft.",
    "abilities": { "str": 14, "dex": 12, "con": 14, "int": 10, "wis": 13, "cha": 8 },
    "skills": ["Athletics +4", "Intimidation +1"],
    "senses": "passive Perception 11",
    "languages": ["Common", "Goblin"],
    "cr": "3"
  }
}

Rules:
- Stats must be 5e-legal (abilities 1-30, CR matching approximate level)
- Relationships should reference other entities from the bible where possible (use their slugs)
- Backstory should connect to the campaign premise and setting
- Dialogue hooks should reflect personality and be usable by a DM at the table
- Include at least 1 secret per NPC`;
}

export function buildNpcDossierUserPrompt(
  entity: BibleEntitySeed,
  bible: BibleContent,
): string {
  const parts = [
    `NPC to expand: "${entity.name}" (slug: ${entity.slug})`,
    `Summary: ${entity.summary}`,
    `Seed details: ${JSON.stringify(entity.details)}`,
    '',
    `Campaign context:`,
    `- Setting: ${bible.worldRules.setting}`,
    `- Era: ${bible.worldRules.era}`,
    `- Tone: ${bible.worldRules.toneDescriptors.join(', ')}`,
    `- Premise: ${bible.premise}`,
    `- Style voice: ${bible.styleGuide.voice}`,
  ];

  const otherEntities = bible.entities
    .filter((e) => e.slug !== entity.slug)
    .map((e) => `  - ${e.name} (${e.entityType}, ${e.slug}): ${e.summary}`);
  if (otherEntities.length > 0) {
    parts.push('', 'Other entities in this campaign:', ...otherEntities);
  }

  return parts.join('\n');
}
```

**Step 2: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/services/generation/prompts/npc-dossier.prompt.ts
git commit -m "feat: add NPC dossier prompt builder"
```

---

### Task 3: Location Brief Prompt Builder

**Files:**
- Create: `server/src/services/generation/prompts/location-brief.prompt.ts`

**Step 1: Create the location brief prompt builder**

```typescript
// server/src/services/generation/prompts/location-brief.prompt.ts
import type { BibleContent, BibleEntitySeed } from '@dnd-booker/shared';

export function buildLocationBriefSystemPrompt(): string {
  return `You are a D&D world builder. You expand a brief location seed into a detailed location reference used throughout adventure writing.

You MUST respond with ONLY a JSON object (no markdown fences, no commentary). The JSON must match this exact schema:

{
  "slug": "kebab-case-slug",
  "name": "Location Name",
  "locationType": "dungeon | town | wilderness | building | region | planar",
  "atmosphere": "2-3 sentence atmospheric description",
  "description": "3-5 sentence overview of the location",
  "areas": [
    {
      "name": "Area name",
      "description": "What this area looks like and contains",
      "features": ["notable feature"],
      "dangers": ["hazard or threat"]
    }
  ],
  "npcsPresent": [{ "slug": "npc-slug", "name": "NPC Name", "role": "what they do here" }],
  "secrets": ["hidden detail or discovery"],
  "connections": [{ "destination": "Connected location", "description": "How to get there" }],
  "environmentalEffects": ["mechanical effect (e.g., dim light, difficult terrain)"]
}

Rules:
- Areas should be specific enough for a DM to describe during play
- Reference NPCs by their slugs from the campaign entities
- Include at least 2 areas for small locations, 4+ for dungeons
- Environmental effects should use 5e mechanical terms
- Secrets should reward exploration and investigation`;
}

export function buildLocationBriefUserPrompt(
  entity: BibleEntitySeed,
  bible: BibleContent,
): string {
  const parts = [
    `Location to expand: "${entity.name}" (slug: ${entity.slug})`,
    `Summary: ${entity.summary}`,
    `Seed details: ${JSON.stringify(entity.details)}`,
    '',
    `Campaign context:`,
    `- Setting: ${bible.worldRules.setting}`,
    `- Era: ${bible.worldRules.era}`,
    `- Magic level: ${bible.worldRules.magicLevel}`,
    `- Tone: ${bible.worldRules.toneDescriptors.join(', ')}`,
    `- Premise: ${bible.premise}`,
  ];

  const npcs = bible.entities
    .filter((e) => e.entityType === 'npc')
    .map((e) => `  - ${e.name} (${e.slug}): ${e.summary}`);
  if (npcs.length > 0) {
    parts.push('', 'NPCs in this campaign (reference by slug where relevant):', ...npcs);
  }

  return parts.join('\n');
}
```

**Step 2: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/services/generation/prompts/location-brief.prompt.ts
git commit -m "feat: add location brief prompt builder"
```

---

### Task 4: Faction Profile Prompt Builder

**Files:**
- Create: `server/src/services/generation/prompts/faction-profile.prompt.ts`

**Step 1: Create the faction profile prompt builder**

```typescript
// server/src/services/generation/prompts/faction-profile.prompt.ts
import type { BibleContent, BibleEntitySeed } from '@dnd-booker/shared';

export function buildFactionProfileSystemPrompt(): string {
  return `You are a D&D world builder. You expand a brief faction seed into a detailed organizational profile used throughout adventure writing.

You MUST respond with ONLY a JSON object (no markdown fences, no commentary). The JSON must match this exact schema:

{
  "slug": "kebab-case-slug",
  "name": "Faction Name",
  "purpose": "What this faction exists to do",
  "alignment": "Faction's general alignment tendency",
  "description": "3-5 sentence overview of the faction",
  "leader": { "name": "Leader Name", "slug": "leader-slug", "title": "Their title" },
  "hierarchy": [{ "rank": "Rank title", "description": "Role and responsibilities" }],
  "goals": ["What the faction is trying to achieve"],
  "resources": ["Assets, manpower, or capabilities"],
  "relationships": [{ "factionName": "Other faction or group", "nature": "allied/hostile/neutral/etc." }],
  "plotHooks": ["How PCs might interact with or be drawn into this faction"],
  "headquarters": "Where the faction is based"
}

Rules:
- Leader slug should reference an existing NPC entity slug if possible
- Goals should connect to the campaign premise
- Include at least 2 hierarchy ranks
- Plot hooks should be actionable by the DM
- Relationships should reference other factions or key NPCs`;
}

export function buildFactionProfileUserPrompt(
  entity: BibleEntitySeed,
  bible: BibleContent,
): string {
  const parts = [
    `Faction to expand: "${entity.name}" (slug: ${entity.slug})`,
    `Summary: ${entity.summary}`,
    `Seed details: ${JSON.stringify(entity.details)}`,
    '',
    `Campaign context:`,
    `- Setting: ${bible.worldRules.setting}`,
    `- Tone: ${bible.worldRules.toneDescriptors.join(', ')}`,
    `- Premise: ${bible.premise}`,
  ];

  const npcs = bible.entities
    .filter((e) => e.entityType === 'npc')
    .map((e) => `  - ${e.name} (${e.slug}): ${e.summary}`);
  if (npcs.length > 0) {
    parts.push('', 'NPCs in this campaign:', ...npcs);
  }

  const factions = bible.entities
    .filter((e) => e.entityType === 'faction' && e.slug !== entity.slug)
    .map((e) => `  - ${e.name} (${e.slug}): ${e.summary}`);
  if (factions.length > 0) {
    parts.push('', 'Other factions:', ...factions);
  }

  return parts.join('\n');
}
```

**Step 2: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/services/generation/prompts/faction-profile.prompt.ts
git commit -m "feat: add faction profile prompt builder"
```

---

### Task 5: Encounter Bundle + Item Bundle Prompt Builders

**Files:**
- Create: `server/src/services/generation/prompts/encounter-bundle.prompt.ts`
- Create: `server/src/services/generation/prompts/item-bundle.prompt.ts`

**Step 1: Create the encounter bundle prompt builder**

```typescript
// server/src/services/generation/prompts/encounter-bundle.prompt.ts
import type { BibleContent, BibleEntitySeed } from '@dnd-booker/shared';

export function buildEncounterBundleSystemPrompt(): string {
  return `You are a D&D encounter designer. You expand a brief quest or encounter seed into a full tactical encounter reference.

You MUST respond with ONLY a JSON object (no markdown fences, no commentary). The JSON must match this exact schema:

{
  "slug": "kebab-case-slug",
  "name": "Encounter Name",
  "description": "2-3 sentence overview of the encounter",
  "difficulty": "easy | medium | hard | deadly",
  "suggestedLevel": { "min": 3, "max": 5 },
  "setup": "How the DM should set the scene and what triggers the encounter",
  "enemies": [
    { "name": "Monster name", "count": 2, "cr": "1/2", "tactics": "How they fight" }
  ],
  "environment": {
    "terrain": "Terrain description",
    "lighting": "bright | dim | dark",
    "features": ["environmental feature that affects combat"]
  },
  "complications": ["mid-combat twist or complication"],
  "rewards": [{ "name": "Reward name", "description": "What players get" }],
  "scalingNotes": "How to adjust for different party sizes or levels"
}

Rules:
- CR totals should roughly match the stated difficulty for the suggested level range
- Tactics should be specific and actionable
- Include at least one environmental feature that affects gameplay
- Complications should make the encounter more interesting, not just harder
- Scaling notes should cover both weaker and stronger parties`;
}

export function buildEncounterBundleUserPrompt(
  entity: BibleEntitySeed,
  bible: BibleContent,
): string {
  const parts = [
    `Encounter/quest to expand: "${entity.name}" (slug: ${entity.slug})`,
    `Summary: ${entity.summary}`,
    `Seed details: ${JSON.stringify(entity.details)}`,
    '',
    `Campaign context:`,
    `- Setting: ${bible.worldRules.setting}`,
    `- Magic level: ${bible.worldRules.magicLevel}`,
    `- Tone: ${bible.worldRules.toneDescriptors.join(', ')}`,
  ];

  if (bible.actStructure.length > 0) {
    const levelRange = bible.actStructure[0].levelRange;
    const maxRange = bible.actStructure[bible.actStructure.length - 1].levelRange;
    parts.push(`- Campaign level range: ${levelRange.min}–${maxRange.max}`);
  }

  return parts.join('\n');
}
```

**Step 2: Create the item bundle prompt builder**

```typescript
// server/src/services/generation/prompts/item-bundle.prompt.ts
import type { BibleContent, BibleEntitySeed } from '@dnd-booker/shared';

export function buildItemBundleSystemPrompt(): string {
  return `You are a D&D item designer. You expand a brief item seed into a detailed magic item or treasure reference.

You MUST respond with ONLY a JSON object (no markdown fences, no commentary). The JSON must match this exact schema:

{
  "slug": "kebab-case-slug",
  "name": "Item Name",
  "itemType": "weapon | armor | wondrous | potion | scroll | ring | rod | staff | wand",
  "rarity": "common | uncommon | rare | very rare | legendary | artifact",
  "description": "2-3 sentence physical description",
  "mechanics": "Full mechanical description (damage, bonuses, effects, charges, etc.)",
  "attunement": true,
  "properties": ["mechanical property or tag"],
  "lore": "2-3 sentence history and significance",
  "history": "How this item came to be in its current location",
  "quirks": ["unusual behavior or cosmetic effect"]
}

Rules:
- Mechanics must be 5e-legal and balanced for the stated rarity
- Properties should use standard 5e item properties where applicable
- Lore should connect to the campaign setting
- Include at least one quirk to make the item memorable
- Attunement requirements should match 5e conventions for the item type`;
}

export function buildItemBundleUserPrompt(
  entity: BibleEntitySeed,
  bible: BibleContent,
): string {
  const parts = [
    `Item to expand: "${entity.name}" (slug: ${entity.slug})`,
    `Summary: ${entity.summary}`,
    `Seed details: ${JSON.stringify(entity.details)}`,
    '',
    `Campaign context:`,
    `- Setting: ${bible.worldRules.setting}`,
    `- Magic level: ${bible.worldRules.magicLevel}`,
    `- Technology level: ${bible.worldRules.technologyLevel}`,
    `- Tone: ${bible.worldRules.toneDescriptors.join(', ')}`,
  ];

  return parts.join('\n');
}
```

**Step 3: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/services/generation/prompts/encounter-bundle.prompt.ts server/src/services/generation/prompts/item-bundle.prompt.ts
git commit -m "feat: add encounter bundle and item bundle prompt builders"
```

---

### Task 6: Canon Service

**Files:**
- Create: `server/src/services/generation/canon.service.ts`

**Context:** This is the main service that dispatches entity expansion. It follows the same pattern as `bible.service.ts` and `chapter-plan.service.ts`: accept run + data + model → call AI → validate → persist artifact + CanonReference → publish event → return result.

**Step 1: Create the canon service**

```typescript
// server/src/services/generation/canon.service.ts
import { generateText, type LanguageModel } from 'ai';
import { z } from 'zod';
import type {
  BibleContent,
  BibleEntitySeed,
  NpcDossier,
  LocationBrief,
  FactionProfile,
  EncounterBundle,
  ItemBundle,
} from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import { parseJsonResponse } from './parse-json.js';
import { buildNpcDossierSystemPrompt, buildNpcDossierUserPrompt } from './prompts/npc-dossier.prompt.js';
import { buildLocationBriefSystemPrompt, buildLocationBriefUserPrompt } from './prompts/location-brief.prompt.js';
import { buildFactionProfileSystemPrompt, buildFactionProfileUserPrompt } from './prompts/faction-profile.prompt.js';
import { buildEncounterBundleSystemPrompt, buildEncounterBundleUserPrompt } from './prompts/encounter-bundle.prompt.js';
import { buildItemBundleSystemPrompt, buildItemBundleUserPrompt } from './prompts/item-bundle.prompt.js';

// ---------- Zod Schemas ----------

const NpcDossierSchema = z.object({
  slug: z.string(),
  name: z.string(),
  race: z.string(),
  class: z.string(),
  level: z.number(),
  alignment: z.string(),
  role: z.string(),
  appearance: z.string(),
  personality: z.string(),
  motivation: z.string(),
  backstory: z.string(),
  mannerisms: z.array(z.string()),
  dialogueHooks: z.array(z.string()),
  relationships: z.array(z.object({ name: z.string(), slug: z.string(), nature: z.string() })),
  secrets: z.array(z.string()),
  statBlock: z.object({
    ac: z.number(),
    hp: z.string(),
    speed: z.string(),
    abilities: z.object({ str: z.number(), dex: z.number(), con: z.number(), int: z.number(), wis: z.number(), cha: z.number() }),
    skills: z.array(z.string()),
    senses: z.string(),
    languages: z.array(z.string()),
    cr: z.string(),
  }),
});

const LocationBriefSchema = z.object({
  slug: z.string(),
  name: z.string(),
  locationType: z.string(),
  atmosphere: z.string(),
  description: z.string(),
  areas: z.array(z.object({ name: z.string(), description: z.string(), features: z.array(z.string()), dangers: z.array(z.string()) })),
  npcsPresent: z.array(z.object({ slug: z.string(), name: z.string(), role: z.string() })),
  secrets: z.array(z.string()),
  connections: z.array(z.object({ destination: z.string(), description: z.string() })),
  environmentalEffects: z.array(z.string()),
});

const FactionProfileSchema = z.object({
  slug: z.string(),
  name: z.string(),
  purpose: z.string(),
  alignment: z.string(),
  description: z.string(),
  leader: z.object({ name: z.string(), slug: z.string(), title: z.string() }),
  hierarchy: z.array(z.object({ rank: z.string(), description: z.string() })),
  goals: z.array(z.string()),
  resources: z.array(z.string()),
  relationships: z.array(z.object({ factionName: z.string(), nature: z.string() })),
  plotHooks: z.array(z.string()),
  headquarters: z.string(),
});

const EncounterBundleSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  difficulty: z.string(),
  suggestedLevel: z.object({ min: z.number(), max: z.number() }),
  setup: z.string(),
  enemies: z.array(z.object({ name: z.string(), count: z.number(), cr: z.string(), tactics: z.string() })),
  environment: z.object({ terrain: z.string(), lighting: z.string(), features: z.array(z.string()) }),
  complications: z.array(z.string()),
  rewards: z.array(z.object({ name: z.string(), description: z.string() })),
  scalingNotes: z.string(),
});

const ItemBundleSchema = z.object({
  slug: z.string(),
  name: z.string(),
  itemType: z.string(),
  rarity: z.string(),
  description: z.string(),
  mechanics: z.string(),
  attunement: z.boolean(),
  properties: z.array(z.string()),
  lore: z.string(),
  history: z.string(),
  quirks: z.array(z.string()),
});

// ---------- Type Map ----------

const ENTITY_TYPE_CONFIG: Record<string, {
  artifactType: string;
  schema: z.ZodType;
  buildSystem: () => string;
  buildUser: (entity: BibleEntitySeed, bible: BibleContent) => string;
}> = {
  npc: {
    artifactType: 'npc_dossier',
    schema: NpcDossierSchema,
    buildSystem: buildNpcDossierSystemPrompt,
    buildUser: buildNpcDossierUserPrompt,
  },
  location: {
    artifactType: 'location_brief',
    schema: LocationBriefSchema,
    buildSystem: buildLocationBriefSystemPrompt,
    buildUser: buildLocationBriefUserPrompt,
  },
  faction: {
    artifactType: 'faction_profile',
    schema: FactionProfileSchema,
    buildSystem: buildFactionProfileSystemPrompt,
    buildUser: buildFactionProfileUserPrompt,
  },
  quest: {
    artifactType: 'encounter_bundle',
    schema: EncounterBundleSchema,
    buildSystem: buildEncounterBundleSystemPrompt,
    buildUser: buildEncounterBundleUserPrompt,
  },
  item: {
    artifactType: 'item_bundle',
    schema: ItemBundleSchema,
    buildSystem: buildItemBundleSystemPrompt,
    buildUser: buildItemBundleUserPrompt,
  },
};

// ---------- Types ----------

export interface CanonExpansionResult {
  entityId: string;
  entitySlug: string;
  entityType: string;
  artifactId: string;
  artifactType: string;
}

// ---------- Main Service ----------

/**
 * Expand a single CanonEntity seed into a full reference artifact.
 * Creates a GeneratedArtifact, a CanonReference, and updates the entity's canonicalData.
 */
export async function expandCanonEntity(
  run: { id: string; projectId: string },
  entity: { id: string; entityType: string; slug: string; canonicalName: string; summary: string },
  entitySeed: BibleEntitySeed,
  bible: BibleContent,
  model: LanguageModel,
  maxOutputTokens: number,
): Promise<CanonExpansionResult> {
  const config = ENTITY_TYPE_CONFIG[entity.entityType];
  if (!config) {
    throw new Error(`Unsupported entity type for canon expansion: ${entity.entityType}`);
  }

  const system = config.buildSystem();
  const prompt = config.buildUser(entitySeed, bible);

  const { text, usage } = await generateText({
    model, system, prompt, maxOutputTokens,
  });

  const parsed = parseJsonResponse(text);
  const validated = config.schema.parse(parsed);

  const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

  // Create the reference artifact
  const artifact = await prisma.generatedArtifact.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      artifactType: config.artifactType,
      artifactKey: `${config.artifactType}-${entity.slug}`,
      status: 'generated',
      version: 1,
      title: entity.canonicalName,
      summary: entity.summary,
      jsonContent: validated as any,
      tokenCount: totalTokens,
    },
  });

  // Create CanonReference linking entity → artifact
  await prisma.canonReference.create({
    data: {
      entityId: entity.id,
      artifactId: artifact.id,
      referenceType: 'introduces',
    },
  });

  // Update entity's canonicalData with enriched details
  await prisma.canonEntity.update({
    where: { id: entity.id },
    data: { canonicalData: validated as any },
  });

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
    artifactType: config.artifactType,
    title: entity.canonicalName,
    version: 1,
  });

  return {
    entityId: entity.id,
    entitySlug: entity.slug,
    entityType: entity.entityType,
    artifactId: artifact.id,
    artifactType: config.artifactType,
  };
}

/**
 * Expand all entities from a bible generation result into reference artifacts.
 * Processes entities sequentially to avoid rate limits.
 */
export async function expandAllCanonEntities(
  run: { id: string; projectId: string },
  entities: { id: string; entityType: string; slug: string; canonicalName: string }[],
  bible: BibleContent,
  model: LanguageModel,
  maxOutputTokens: number,
): Promise<CanonExpansionResult[]> {
  const results: CanonExpansionResult[] = [];

  for (const entity of entities) {
    // Find the matching seed from the bible
    const seed = bible.entities.find((e) => e.slug === entity.slug);
    if (!seed) continue;

    // Skip entity types we don't have prompts for (e.g., 'monster', 'encounter')
    if (!ENTITY_TYPE_CONFIG[entity.entityType]) continue;

    // Load the full entity for summary
    const fullEntity = await prisma.canonEntity.findUnique({
      where: { id: entity.id },
    });
    if (!fullEntity) continue;

    const result = await expandCanonEntity(
      run,
      {
        id: fullEntity.id,
        entityType: fullEntity.entityType,
        slug: fullEntity.slug,
        canonicalName: fullEntity.canonicalName,
        summary: fullEntity.summary,
      },
      seed,
      bible,
      model,
      maxOutputTokens,
    );

    results.push(result);
  }

  return results;
}
```

**Step 2: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/services/generation/canon.service.ts
git commit -m "feat: add canon service for expanding entities into reference artifacts"
```

---

### Task 7: Canon Service Tests

**Files:**
- Create: `server/src/__tests__/generation/canon.test.ts`

**Context:** Follow the same test pattern as `bible.test.ts`: mock `ai` module and `pubsub.service`, create real DB records, verify artifacts + references + entity updates.

**Step 1: Write the test file**

```typescript
// server/src/__tests__/generation/canon.test.ts
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { generateText } from 'ai';
import type { BibleContent, BibleEntitySeed, NpcDossier, LocationBrief, ItemBundle } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { expandCanonEntity, expandAllCanonEntities } from '../../services/generation/canon.service.js';
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
    toneDescriptors: ['adventurous', 'classic'],
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
    vocabulary: [],
    avoidTerms: [],
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
      details: { race: 'Goblin', class: 'Fighter', level: 4, alignment: 'CE', role: 'antagonist', personality: 'cunning', motivation: 'power', appearance: 'Large goblin' },
    },
    {
      entityType: 'location',
      name: 'Duskhollow Caves',
      slug: 'duskhollow-caves',
      summary: 'Ancient caves.',
      details: { locationType: 'dungeon', atmosphere: 'dark', features: ['stream'], dangers: ['traps'], connections: ['village'] },
    },
    {
      entityType: 'item',
      name: 'Fang of Gnarltooth',
      slug: 'fang-of-gnarltooth',
      summary: 'A goblin chieftain dagger.',
      details: { itemType: 'weapon', rarity: 'uncommon', properties: '+1 dagger', lore: 'Forged from a tusk' },
    },
  ],
};

const VALID_NPC_DOSSIER: NpcDossier = {
  slug: 'chief-gnarltooth',
  name: 'Chief Gnarltooth',
  race: 'Goblin',
  class: 'Fighter',
  level: 4,
  alignment: 'CE',
  role: 'antagonist',
  appearance: 'A large goblin with a broken tusk.',
  personality: 'Cunning and cruel.',
  motivation: 'Power over his tribe.',
  backstory: 'Rose to power by defeating the previous chief.',
  mannerisms: ['speaks in third person', 'taps his broken tusk'],
  dialogueHooks: ['You dare enter MY caves?'],
  relationships: [{ name: 'Elder Mara', slug: 'elder-mara', nature: 'enemy' }],
  secrets: ['He fears a deeper threat in the caves'],
  statBlock: {
    ac: 16,
    hp: '33 (6d6+12)',
    speed: '30 ft.',
    abilities: { str: 14, dex: 14, con: 14, int: 10, wis: 8, cha: 12 },
    skills: ['Athletics +4', 'Intimidation +3'],
    senses: 'darkvision 60 ft., passive Perception 9',
    languages: ['Common', 'Goblin'],
    cr: '2',
  },
};

const VALID_LOCATION_BRIEF: LocationBrief = {
  slug: 'duskhollow-caves',
  name: 'Duskhollow Caves',
  locationType: 'dungeon',
  atmosphere: 'Dark and damp with echoing drips.',
  description: 'An ancient cave network now home to goblins.',
  areas: [
    { name: 'Entrance', description: 'A narrow opening.', features: ['stalactites'], dangers: ['pit trap'] },
    { name: 'Main Chamber', description: 'A large cavern.', features: ['underground stream'], dangers: ['goblin guards'] },
  ],
  npcsPresent: [{ slug: 'chief-gnarltooth', name: 'Chief Gnarltooth', role: 'boss' }],
  secrets: ['Hidden dwarven door behind the waterfall'],
  connections: [{ destination: 'Millbrook Village', description: 'Trail through the forest' }],
  environmentalEffects: ['dim light throughout', 'difficult terrain (loose rocks)'],
};

const VALID_ITEM_BUNDLE: ItemBundle = {
  slug: 'fang-of-gnarltooth',
  name: 'Fang of Gnarltooth',
  itemType: 'weapon',
  rarity: 'uncommon',
  description: 'A crude dagger carved from a goblin tusk.',
  mechanics: '+1 dagger. On a critical hit, the target must make a DC 12 Constitution save or take 1d6 poison damage.',
  attunement: false,
  properties: ['finesse', 'light', 'thrown (20/60)'],
  lore: 'Carved from the tusk of Gnarltooth\'s predecessor.',
  history: 'Kept in the chief\'s treasure hoard.',
  quirks: ['Glows faintly green when goblins are within 60 feet'],
};

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `canon-test-${Date.now()}@test.com`,
      displayName: `Canon Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: { title: 'Canon Test Project', userId: testUser.id },
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

describe('Canon Service — expandCanonEntity', () => {
  it('should create an npc_dossier artifact for an NPC entity', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_NPC_DOSSIER),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A goblin cave adventure',
    });

    // Create a CanonEntity to expand
    const entity = await prisma.canonEntity.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        entityType: 'npc',
        slug: 'chief-gnarltooth',
        canonicalName: 'Chief Gnarltooth',
        aliases: [] as any,
        canonicalData: SAMPLE_BIBLE.entities[0].details as any,
        summary: 'Goblin chief.',
      },
    });

    const result = await expandCanonEntity(
      run!,
      { id: entity.id, entityType: 'npc', slug: 'chief-gnarltooth', canonicalName: 'Chief Gnarltooth', summary: 'Goblin chief.' },
      SAMPLE_BIBLE.entities[0],
      SAMPLE_BIBLE,
      {} as any,
      4096,
    );

    expect(result.artifactType).toBe('npc_dossier');
    expect(result.entitySlug).toBe('chief-gnarltooth');

    const artifact = await prisma.generatedArtifact.findUnique({ where: { id: result.artifactId } });
    expect(artifact).not.toBeNull();
    expect(artifact!.artifactType).toBe('npc_dossier');
    expect(artifact!.artifactKey).toBe('npc_dossier-chief-gnarltooth');
    expect(artifact!.tokenCount).toBe(2000);
  });

  it('should create a CanonReference linking entity to artifact', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_NPC_DOSSIER),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const entity = await prisma.canonEntity.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        entityType: 'npc',
        slug: 'chief-gnarltooth-ref',
        canonicalName: 'Chief Gnarltooth',
        aliases: [] as any,
        canonicalData: {} as any,
        summary: 'Goblin chief.',
      },
    });

    const result = await expandCanonEntity(
      run!,
      { id: entity.id, entityType: 'npc', slug: 'chief-gnarltooth-ref', canonicalName: 'Chief Gnarltooth', summary: 'Goblin chief.' },
      SAMPLE_BIBLE.entities[0],
      SAMPLE_BIBLE,
      {} as any,
      4096,
    );

    const ref = await prisma.canonReference.findFirst({
      where: { entityId: entity.id, artifactId: result.artifactId },
    });
    expect(ref).not.toBeNull();
    expect(ref!.referenceType).toBe('introduces');
  });

  it('should update the entity canonicalData with enriched details', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_NPC_DOSSIER),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const entity = await prisma.canonEntity.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        entityType: 'npc',
        slug: 'chief-gnarltooth-update',
        canonicalName: 'Chief Gnarltooth',
        aliases: [] as any,
        canonicalData: { race: 'Goblin' } as any,
        summary: 'Goblin chief.',
      },
    });

    await expandCanonEntity(
      run!,
      { id: entity.id, entityType: 'npc', slug: 'chief-gnarltooth-update', canonicalName: 'Chief Gnarltooth', summary: 'Goblin chief.' },
      SAMPLE_BIBLE.entities[0],
      SAMPLE_BIBLE,
      {} as any,
      4096,
    );

    const updated = await prisma.canonEntity.findUnique({ where: { id: entity.id } });
    const data = updated!.canonicalData as any;
    expect(data.backstory).toBe('Rose to power by defeating the previous chief.');
    expect(data.statBlock.cr).toBe('2');
  });

  it('should create a location_brief artifact for a location entity', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_LOCATION_BRIEF),
      usage: { inputTokens: 600, outputTokens: 1000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const entity = await prisma.canonEntity.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        entityType: 'location',
        slug: 'duskhollow-caves',
        canonicalName: 'Duskhollow Caves',
        aliases: [] as any,
        canonicalData: {} as any,
        summary: 'Ancient caves.',
      },
    });

    const result = await expandCanonEntity(
      run!,
      { id: entity.id, entityType: 'location', slug: 'duskhollow-caves', canonicalName: 'Duskhollow Caves', summary: 'Ancient caves.' },
      SAMPLE_BIBLE.entities[1],
      SAMPLE_BIBLE,
      {} as any,
      4096,
    );

    expect(result.artifactType).toBe('location_brief');

    const artifact = await prisma.generatedArtifact.findUnique({ where: { id: result.artifactId } });
    expect(artifact!.artifactKey).toBe('location_brief-duskhollow-caves');
  });

  it('should throw on unsupported entity type', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    await expect(
      expandCanonEntity(
        run!,
        { id: 'fake', entityType: 'monster', slug: 'dragon', canonicalName: 'Dragon', summary: 'A dragon.' },
        { entityType: 'npc', name: 'x', slug: 'x', summary: 'x', details: {} } as any,
        SAMPLE_BIBLE,
        {} as any,
        4096,
      ),
    ).rejects.toThrow('Unsupported entity type');
  });

  it('should throw on malformed AI response', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'Not valid JSON',
      usage: { inputTokens: 100, outputTokens: 50 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const entity = await prisma.canonEntity.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        entityType: 'npc',
        slug: 'bad-npc',
        canonicalName: 'Bad NPC',
        aliases: [] as any,
        canonicalData: {} as any,
        summary: 'test',
      },
    });

    await expect(
      expandCanonEntity(
        run!,
        { id: entity.id, entityType: 'npc', slug: 'bad-npc', canonicalName: 'Bad NPC', summary: 'test' },
        SAMPLE_BIBLE.entities[0],
        SAMPLE_BIBLE,
        {} as any,
        4096,
      ),
    ).rejects.toThrow();
  });

  it('should update run token count', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_NPC_DOSSIER),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const entity = await prisma.canonEntity.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        entityType: 'npc',
        slug: 'token-test-npc',
        canonicalName: 'Token Test',
        aliases: [] as any,
        canonicalData: {} as any,
        summary: 'test',
      },
    });

    await expandCanonEntity(
      run!,
      { id: entity.id, entityType: 'npc', slug: 'token-test-npc', canonicalName: 'Token Test', summary: 'test' },
      SAMPLE_BIBLE.entities[0],
      SAMPLE_BIBLE,
      {} as any,
      4096,
    );

    const updatedRun = await prisma.generationRun.findUnique({ where: { id: run!.id } });
    expect(updatedRun!.actualTokens).toBe(2000);
  });
});

describe('Canon Service — expandAllCanonEntities', () => {
  it('should expand all entities and return results', async () => {
    // Mock three AI calls (npc, location, item)
    mockGenerateText
      .mockResolvedValueOnce({ text: JSON.stringify(VALID_NPC_DOSSIER), usage: { inputTokens: 800, outputTokens: 1200 } } as any)
      .mockResolvedValueOnce({ text: JSON.stringify(VALID_LOCATION_BRIEF), usage: { inputTokens: 600, outputTokens: 1000 } } as any)
      .mockResolvedValueOnce({ text: JSON.stringify(VALID_ITEM_BUNDLE), usage: { inputTokens: 400, outputTokens: 600 } } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test expand all',
    });

    // Create entities matching the bible seeds
    const entities = await Promise.all(
      SAMPLE_BIBLE.entities.map((seed) =>
        prisma.canonEntity.create({
          data: {
            projectId: run!.projectId,
            runId: run!.id,
            entityType: seed.entityType,
            slug: seed.slug,
            canonicalName: seed.name,
            aliases: [] as any,
            canonicalData: seed.details as any,
            summary: seed.summary,
          },
        }),
      ),
    );

    const results = await expandAllCanonEntities(
      run!,
      entities.map((e) => ({ id: e.id, entityType: e.entityType, slug: e.slug, canonicalName: e.canonicalName })),
      SAMPLE_BIBLE,
      {} as any,
      4096,
    );

    expect(results.length).toBe(3);
    expect(results.map((r) => r.artifactType).sort()).toEqual(['item_bundle', 'location_brief', 'npc_dossier']);
    expect(mockGenerateText).toHaveBeenCalledTimes(3);
  });

  it('should skip entities with no matching bible seed', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_NPC_DOSSIER),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test skip',
    });

    const entity = await prisma.canonEntity.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        entityType: 'npc',
        slug: 'chief-gnarltooth',
        canonicalName: 'Chief Gnarltooth',
        aliases: [] as any,
        canonicalData: {} as any,
        summary: 'test',
      },
    });

    // Also create an entity NOT in the bible
    const orphan = await prisma.canonEntity.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        entityType: 'npc',
        slug: 'unknown-npc',
        canonicalName: 'Unknown NPC',
        aliases: [] as any,
        canonicalData: {} as any,
        summary: 'not in bible',
      },
    });

    const results = await expandAllCanonEntities(
      run!,
      [
        { id: entity.id, entityType: 'npc', slug: 'chief-gnarltooth', canonicalName: 'Chief Gnarltooth' },
        { id: orphan.id, entityType: 'npc', slug: 'unknown-npc', canonicalName: 'Unknown NPC' },
      ],
      SAMPLE_BIBLE,
      {} as any,
      4096,
    );

    // Only the one with a bible seed should be expanded
    expect(results.length).toBe(1);
    expect(results[0].entitySlug).toBe('chief-gnarltooth');
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run the tests**

Run: `cd /home/gallison/workspace/DND_booker/server && npx vitest run src/__tests__/generation/canon.test.ts`
Expected: All 9 tests PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/__tests__/generation/canon.test.ts
git commit -m "test: add canon service tests for entity expansion"
```

---

### Task 8: Type-check + Integration Verification

**Files:**
- No new files

**Step 1: Run full server type check**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 2: Run all generation tests**

Run: `cd /home/gallison/workspace/DND_booker/server && npx vitest run src/__tests__/generation/`
Expected: All tests PASS (previous tests + new canon tests)

**Step 3: Commit if any fixes were needed**

Only commit if there were type errors or test failures that required fixes.
