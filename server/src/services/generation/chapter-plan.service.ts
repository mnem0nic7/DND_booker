import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type {
  BibleContent,
  ChapterOutlineEntry,
  ChapterPlan,
  ChapterPlanBlockType,
  SectionSpec,
} from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import { parseJsonResponse } from './parse-json.js';
import { normalizeGenerationContentType } from './content-type-normalizer.js';
import { generateTextWithTimeout } from './model-timeouts.js';
import {
  buildChapterPlanSystemPrompt,
  buildChapterPlanUserPrompt,
} from './prompts/chapter-plan.prompt.js';

const REFERENCE_HEAVY_BLOCKS = new Set<ChapterPlanBlockType>([
  'statBlock',
  'encounterTable',
  'npcProfile',
  'magicItem',
  'spellCard',
  'randomTable',
  'handout',
]);

const TARGET_WORD_RANGES: Record<SectionSpec['contentType'], { min: number; max: number }> = {
  narrative: { min: 600, max: 1200 },
  encounter: { min: 800, max: 1500 },
  exploration: { min: 600, max: 1000 },
  social: { min: 400, max: 800 },
  transition: { min: 200, max: 400 },
};

const SectionSpecSchema = z.object({
  slug: z.string(),
  title: z.string(),
  contentType: z.preprocess(
    normalizeGenerationContentType,
    z.enum(['narrative', 'encounter', 'exploration', 'social', 'transition']),
  ),
  targetWords: z.number(),
  outline: z.string(),
  scenePurpose: z.string().optional().default(''),
  playerObjective: z.string().optional().default(''),
  decisionPoint: z.string().optional().default(''),
  consequenceSummary: z.string().optional().default(''),
  keyBeats: z.array(z.string()),
  entityReferences: z.array(z.string()),
  blocksNeeded: z.array(z.string()),
});

const EncounterSpecSchema = z.object({
  name: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard', 'deadly']),
  enemies: z.array(z.object({
    name: z.string(),
    count: z.number(),
    cr: z.preprocess((value) => String(value ?? '').trim(), z.string().min(1)),
  })),
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

  const { text, usage } = await generateTextWithTimeout(`Chapter plan generation for ${chapter.title}`, {
    model, system, prompt, maxOutputTokens,
  });

  const parsed = parseJsonResponse(text);
  const plan = normalizeChapterPlan(
    chapter,
    ChapterPlanSchema.parse(parsed) as ChapterPlan,
  );

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

function normalizeChapterPlan(
  chapter: ChapterOutlineEntry,
  plan: ChapterPlan,
): ChapterPlan {
  const chapterSections = new Map(
    chapter.sections.map((section) => [section.slug, section] as const),
  );

  const normalizedSections = plan.sections.map((section) =>
    normalizeSectionSpec(section, chapter, chapterSections.get(section.slug)),
  );

  ensureReferenceHeavyCoverage(normalizedSections);

  return {
    ...plan,
    sections: normalizedSections,
    entityReferences: uniqueStrings(plan.entityReferences),
    readAloudCount: normalizedSections.filter((section) => section.blocksNeeded.includes('readAloud')).length,
    dmTipCount: normalizedSections.filter((section) => section.blocksNeeded.includes('dmTips')).length,
    difficultyProgression: cleanText(plan.difficultyProgression)
      || `Escalate from investigation and uncertainty toward the chapter's climactic pressure point.`,
  };
}

function normalizeSectionSpec(
  section: ChapterPlan['sections'][number],
  chapter: ChapterOutlineEntry,
  outlineSection?: ChapterOutlineEntry['sections'][number],
): ChapterPlan['sections'][number] {
  const targetRange = TARGET_WORD_RANGES[section.contentType];
  const keyBeats = uniqueStrings(section.keyBeats).filter(Boolean);
  const blocksNeeded = normalizeBlocks(section.blocksNeeded, section.contentType);
  const normalizedTitle = cleanText(section.title) || outlineSection?.title || 'Scene';
  const lowerTitle = normalizedTitle.toLowerCase();
  const summarySeed = cleanText(outlineSection?.summary) || cleanText(section.outline);

  return {
    ...section,
    title: normalizedTitle,
    targetWords: clamp(Math.round(section.targetWords), targetRange.min, targetRange.max),
    outline: cleanText(section.outline) || summarySeed || `Run ${normalizedTitle} as a ${section.contentType} scene that advances ${chapter.title}.`,
    scenePurpose: cleanText(section.scenePurpose)
      || `Give the DM a playable ${section.contentType} scene for ${lowerTitle} that meaningfully advances ${chapter.title}.`,
    playerObjective: cleanText(section.playerObjective)
      || inferPlayerObjective(section.contentType, normalizedTitle, summarySeed),
    decisionPoint: cleanText(section.decisionPoint)
      || inferDecisionPoint(section.contentType, normalizedTitle),
    consequenceSummary: cleanText(section.consequenceSummary)
      || inferConsequenceSummary(section.contentType, normalizedTitle),
    keyBeats: keyBeats.length > 0 ? keyBeats : fallbackKeyBeats(normalizedTitle, summarySeed),
    entityReferences: uniqueStrings(section.entityReferences),
    blocksNeeded,
  };
}

function normalizeBlocks(
  blocks: string[],
  contentType: SectionSpec['contentType'],
): ChapterPlanBlockType[] {
  const normalized = new Set<ChapterPlanBlockType>();

  for (const block of blocks) {
    const canonical = normalizeBlockName(block);
    if (canonical) normalized.add(canonical);
  }

  switch (contentType) {
    case 'narrative':
      normalized.add('readAloud');
      if (!normalized.has('dmTips') && !normalized.has('handout')) {
        normalized.add('dmTips');
      }
      if (!hasReferenceHeavyBlock({ blocksNeeded: Array.from(normalized) })) {
        normalized.add('handout');
      }
      break;
    case 'encounter':
      normalized.add('readAloud');
      normalized.add('encounterTable');
      normalized.add('statBlock');
      break;
    case 'exploration':
      normalized.add('readAloud');
      if (!normalized.has('randomTable') && !normalized.has('handout')) {
        normalized.add('randomTable');
      }
      break;
    case 'social':
      if (!normalized.has('npcProfile') && !normalized.has('dmTips') && !normalized.has('handout')) {
        normalized.add('npcProfile');
      }
      if (!normalized.has('dmTips')) normalized.add('dmTips');
      break;
    case 'transition':
      break;
  }

  return Array.from(normalized);
}

function ensureReferenceHeavyCoverage(sections: ChapterPlan['sections']): void {
  const nonTransitionSections = sections.filter((section) => section.contentType !== 'transition');
  const targetCount = nonTransitionSections.length;
  let currentCount = nonTransitionSections.filter(hasReferenceHeavyBlock).length;

  if (currentCount >= targetCount) return;

  for (const section of nonTransitionSections) {
    if (currentCount >= targetCount) break;
    if (hasReferenceHeavyBlock(section)) continue;

    section.blocksNeeded.push(referenceFallbackForSection(section.contentType));
    currentCount += 1;
  }
}

function hasReferenceHeavyBlock(section: Pick<SectionSpec, 'blocksNeeded'>): boolean {
  return section.blocksNeeded.some((block) => REFERENCE_HEAVY_BLOCKS.has(block));
}

function referenceFallbackForSection(contentType: SectionSpec['contentType']): ChapterPlanBlockType {
  switch (contentType) {
    case 'encounter':
      return 'statBlock';
    case 'exploration':
      return 'randomTable';
    case 'social':
      return 'npcProfile';
    case 'narrative':
      return 'handout';
    case 'transition':
      return 'dmTips';
  }
}

function normalizeBlockName(value: string): ChapterPlanBlockType | null {
  const trimmed = cleanText(value);
  const compact = trimmed.replace(/\s+/g, '');
  const normalized = compact.toLowerCase();
  if (!normalized) return null;

  switch (normalized) {
    case 'readaloud':
    case 'readaloudbox':
      return 'readAloud';
    case 'dmtips':
    case 'sidebarcallout':
      return 'dmTips';
    case 'statblock':
      return 'statBlock';
    case 'encountertable':
      return 'encounterTable';
    case 'npcprofile':
      return 'npcProfile';
    case 'magicitem':
      return 'magicItem';
    case 'spellcard':
      return 'spellCard';
    case 'randomtable':
      return 'randomTable';
    case 'handout':
      return 'handout';
    default:
      return null;
  }
}

function fallbackKeyBeats(title: string, summarySeed: string): string[] {
  if (summarySeed) {
    return [summarySeed];
  }

  return [`Resolve the core beats of ${title}.`];
}

function inferPlayerObjective(
  contentType: SectionSpec['contentType'],
  title: string,
  summarySeed: string,
): string {
  if (summarySeed) {
    return `Use ${title} to pursue: ${summarySeed}`;
  }

  switch (contentType) {
    case 'encounter':
      return `Survive ${title}, gain leverage, and secure the next clue or route forward.`;
    case 'exploration':
      return `Investigate ${title}, uncover useful information, and decide how far to press deeper.`;
    case 'social':
      return `Win cooperation, extract information, or shift the power dynamic in ${title}.`;
    case 'transition':
      return `Use ${title} to reposition, resupply, and set up the next scene.`;
    case 'narrative':
      return `Understand the stakes of ${title} and choose how the party will engage with them.`;
  }
}

function inferDecisionPoint(contentType: SectionSpec['contentType'], title: string): string {
  switch (contentType) {
    case 'encounter':
      return `Decide how to approach ${title}: direct assault, positioning, negotiation, retreat, or another tactic.`;
    case 'exploration':
      return `Choose which risk, lead, or area in ${title} the party pursues first.`;
    case 'social':
      return `Decide what leverage, truth, or bargain the party commits to in ${title}.`;
    case 'transition':
      return `Choose what the party prepares, preserves, or sacrifices before the next scene.`;
    case 'narrative':
      return `Choose how the party responds to the pressure, opportunity, or revelation in ${title}.`;
  }
}

function inferConsequenceSummary(contentType: SectionSpec['contentType'], title: string): string {
  switch (contentType) {
    case 'encounter':
      return `Outcome of ${title} should change available resources, enemy alertness, and the tone of the next scene.`;
    case 'exploration':
      return `What the party finds or misses in ${title} should alter later leverage, hazards, or available routes.`;
    case 'social':
      return `The relationship established in ${title} should affect who helps, obstructs, or betrays the party later.`;
    case 'transition':
      return `Choices in ${title} should reshape pacing, preparedness, or urgency before the next section.`;
    case 'narrative':
      return `The party's response in ${title} should reframe stakes and create a concrete hook into the next section.`;
  }
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => cleanText(value)).filter(Boolean)));
}

function cleanText(value: string | undefined | null): string {
  return value?.trim() ?? '';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
