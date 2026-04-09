import type { LanguageModel } from 'ai';
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
import { buildNpcDossierSystemPrompt, buildNpcDossierUserPrompt } from './prompts/npc-dossier.prompt.js';
import { buildLocationBriefSystemPrompt, buildLocationBriefUserPrompt } from './prompts/location-brief.prompt.js';
import { buildFactionProfileSystemPrompt, buildFactionProfileUserPrompt } from './prompts/faction-profile.prompt.js';
import { buildEncounterBundleSystemPrompt, buildEncounterBundleUserPrompt } from './prompts/encounter-bundle.prompt.js';
import { buildItemBundleSystemPrompt, buildItemBundleUserPrompt } from './prompts/item-bundle.prompt.js';
import { generateObjectWithTimeout } from './model-timeouts.js';

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
  enemies: z.array(z.object({
    name: z.string(),
    count: z.number(),
    cr: z.preprocess((value) => String(value ?? '').trim(), z.string().min(1)),
    tactics: z.string(),
  })),
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

  const { object, usage } = await generateObjectWithTimeout(`Canon expansion for ${entity.canonicalName}`, {
    model, system, prompt, maxOutputTokens,
    schema: config.schema,
  });
  const validated = config.schema.parse(object);

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
