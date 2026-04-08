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

const ACTIONABLE_SUPPORT_BLOCKS = new Set<ChapterPlanBlockType>([
  'readAloud',
  'dmTips',
  'handout',
]);

const TARGET_WORD_RANGES: Record<SectionSpec['contentType'], { min: number; max: number }> = {
  narrative: { min: 1300, max: 1900 },
  encounter: { min: 1500, max: 2200 },
  exploration: { min: 1400, max: 2100 },
  social: { min: 1100, max: 1600 },
  transition: { min: 400, max: 700 },
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
  keyBeats: z.array(z.string()).default([]),
  entityReferences: z.array(z.string()).default([]),
  blocksNeeded: z.array(z.string()).default([]),
});

const EncounterSpecSchema = z.object({
  name: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard', 'deadly']),
  enemies: z.array(z.object({
    name: z.string(),
    count: z.number(),
    cr: z.preprocess((value) => String(value ?? '').trim(), z.string().min(1)),
  })).default([]),
  environment: z.string(),
  tactics: z.string(),
  rewards: z.array(z.string()).default([]),
});

const ChapterPlanSchema = z.object({
  chapterSlug: z.string(),
  chapterTitle: z.string(),
  sections: z.array(SectionSpecSchema),
  encounters: z.array(EncounterSpecSchema).default([]),
  entityReferences: z.array(z.string()).default([]),
  readAloudCount: z.number().default(0),
  dmTipCount: z.number().default(0),
  difficultyProgression: z.string().default(''),
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
  const existingArtifact = await prisma.generatedArtifact.findFirst({
    where: {
      runId: run.id,
      artifactType: 'chapter_plan',
      artifactKey: `chapter-plan-${chapter.slug}`,
      version: 1,
    },
    select: {
      id: true,
      jsonContent: true,
    },
  });

  if (existingArtifact?.jsonContent) {
    return {
      plan: ChapterPlanSchema.parse(existingArtifact.jsonContent) as ChapterPlan,
      artifactId: existingArtifact.id,
    };
  }

  const system = buildChapterPlanSystemPrompt();
  const prompt = buildChapterPlanUserPrompt(chapter, bible, entitySummaries);

  const { text, usage } = await generateTextWithTimeout(`Chapter plan generation for ${chapter.title}`, {
    model, system, prompt, maxOutputTokens,
  });

  const parsed = parseJsonResponse(text);
  const normalizedCandidate = coerceChapterPlanCandidate(chapter, parsed);
  const plan = normalizeChapterPlan(
    chapter,
    ChapterPlanSchema.parse(normalizedCandidate) as ChapterPlan,
  );

  const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

  const artifact = await prisma.$transaction(async (tx) => {
    const createdArtifact = await tx.generatedArtifact.create({
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

    await tx.generationRun.update({
      where: { id: run.id },
      data: { actualTokens: { increment: totalTokens } },
    });

    return createdArtifact;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function coerceString(value: unknown, fallback = ''): string {
  const normalized = cleanText(typeof value === 'string' ? value : value == null ? '' : String(value));
  return normalized || fallback;
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(
    value
      .map((entry) => cleanText(typeof entry === 'string' ? entry : entry == null ? '' : String(entry)))
      .filter(Boolean),
  );
}

function defaultTargetWords(contentType: SectionSpec['contentType']): number {
  const range = TARGET_WORD_RANGES[contentType];
  return Math.round((range.min + range.max) / 2);
}

function coerceChapterPlanCandidate(
  chapter: ChapterOutlineEntry,
  raw: unknown,
): Record<string, unknown> {
  const candidate = isRecord(raw) ? raw : {};
  const rawSections = Array.isArray(candidate.sections) ? candidate.sections : [];

  const sections = chapter.sections.map((outlineSection, index) => {
    const matchingRaw = rawSections.find((entry) => isRecord(entry) && (
      coerceString(entry.slug) === outlineSection.slug
      || coerceString(entry.title).toLowerCase() === outlineSection.title.toLowerCase()
    ));
    const rawSection = isRecord(matchingRaw) ? matchingRaw : (isRecord(rawSections[index]) ? rawSections[index] : {});
    const normalizedContentType = normalizeGenerationContentType(rawSection.contentType ?? outlineSection.contentType) as SectionSpec['contentType'];

    return {
      slug: coerceString(rawSection.slug, outlineSection.slug),
      title: coerceString(rawSection.title, outlineSection.title),
      contentType: normalizedContentType,
      targetWords: Number(rawSection.targetWords) || defaultTargetWords(normalizedContentType),
      outline: coerceString(rawSection.outline, outlineSection.summary),
      scenePurpose: coerceString(rawSection.scenePurpose),
      playerObjective: coerceString(rawSection.playerObjective),
      decisionPoint: coerceString(rawSection.decisionPoint),
      consequenceSummary: coerceString(rawSection.consequenceSummary),
      keyBeats: coerceStringArray(rawSection.keyBeats),
      entityReferences: coerceStringArray(rawSection.entityReferences),
      blocksNeeded: coerceStringArray(rawSection.blocksNeeded),
    };
  });

  return {
    chapterSlug: coerceString(candidate.chapterSlug, chapter.slug),
    chapterTitle: coerceString(candidate.chapterTitle, chapter.title),
    sections,
    encounters: Array.isArray(candidate.encounters) ? candidate.encounters : [],
    entityReferences: coerceStringArray(candidate.entityReferences),
    readAloudCount: Number(candidate.readAloudCount) || 0,
    dmTipCount: Number(candidate.dmTipCount) || 0,
    difficultyProgression: coerceString(candidate.difficultyProgression),
  };
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
  ensureSupportCoverage(normalizedSections);

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
  const blocksNeeded = ensureMinimumUtilityBlocks(
    normalizeBlocks(section.blocksNeeded, section.contentType),
    section.contentType,
  );
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
    keyBeats: ensureDetailedKeyBeats(
      keyBeats.length > 0 ? keyBeats : fallbackKeyBeats(section.contentType, normalizedTitle, summarySeed),
      section.contentType,
      normalizedTitle,
      summarySeed,
    ),
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
      normalized.add('dmTips');
      normalized.add('handout');
      break;
    case 'encounter':
      normalized.add('readAloud');
      normalized.add('encounterTable');
      normalized.add('statBlock');
      normalized.add('dmTips');
      break;
    case 'exploration':
      normalized.add('readAloud');
      normalized.add('randomTable');
      normalized.add('encounterTable');
      normalized.add('handout');
      normalized.add('dmTips');
      break;
    case 'social':
      normalized.add('readAloud');
      normalized.add('npcProfile');
      normalized.add('dmTips');
      break;
    case 'transition':
      break;
  }

  return Array.from(normalized);
}

function ensureMinimumUtilityBlocks(
  blocks: ChapterPlanBlockType[],
  contentType: SectionSpec['contentType'],
): ChapterPlanBlockType[] {
  if (contentType === 'transition') return blocks;

  const normalized = [...blocks];
  const minimumBlocks = minimumUtilityBlockCount(contentType);
  const fallbackOrder = utilityFallbackOrder(contentType);

  for (const block of fallbackOrder) {
    if (normalized.length >= minimumBlocks) break;
    if (!normalized.includes(block)) normalized.push(block);
  }

  return normalized;
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

function hasActionableSupportBlock(section: Pick<SectionSpec, 'blocksNeeded'>): boolean {
  return section.blocksNeeded.some((block) => ACTIONABLE_SUPPORT_BLOCKS.has(block));
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

function supportFallbackForSection(contentType: SectionSpec['contentType']): ChapterPlanBlockType {
  switch (contentType) {
    case 'encounter':
    case 'social':
    case 'transition':
      return 'dmTips';
    case 'exploration':
    case 'narrative':
      return 'handout';
  }
}

function ensureSupportCoverage(sections: ChapterPlan['sections']): void {
  for (const section of sections) {
    if (section.contentType === 'transition') continue;
    if (hasActionableSupportBlock(section)) continue;

    section.blocksNeeded.push(supportFallbackForSection(section.contentType));
  }
}

function minimumUtilityBlockCount(contentType: SectionSpec['contentType']): number {
  switch (contentType) {
    case 'encounter':
    case 'exploration':
      return 5;
    case 'social':
    case 'narrative':
      return 4;
    case 'transition':
      return 0;
  }
}

function utilityFallbackOrder(contentType: SectionSpec['contentType']): ChapterPlanBlockType[] {
  switch (contentType) {
    case 'encounter':
      return ['readAloud', 'encounterTable', 'statBlock', 'dmTips', 'handout'];
    case 'exploration':
      return ['readAloud', 'randomTable', 'encounterTable', 'handout', 'dmTips'];
    case 'social':
      return ['readAloud', 'npcProfile', 'dmTips', 'handout'];
    case 'narrative':
      return ['readAloud', 'dmTips', 'handout', 'randomTable'];
    case 'transition':
      return [];
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

function fallbackKeyBeats(
  contentType: SectionSpec['contentType'],
  title: string,
  summarySeed: string,
): string[] {
  const beats: string[] = [];
  if (summarySeed) {
    beats.push(summarySeed);
  }

  switch (contentType) {
    case 'encounter':
      beats.push(
        `Establish the trigger, battlefield pressure, and first enemy move in ${title}.`,
        `Define the terrain, hazards, and positioning choices that change how ${title} plays at the table.`,
        `Show what tactical choice, environmental edge, or immediate cost defines ${title}.`,
        `Surface the clue, reward, or consequence that the party can secure during ${title}.`,
        `Resolve the payoff and aftermath of ${title} so the next scene changes meaningfully.`,
      );
      break;
    case 'exploration':
      beats.push(
        `Present a concrete route, hazard, or investigative angle in ${title}.`,
        `Name a second route, obstacle, or discovery so ${title} offers more than one meaningful path.`,
        `Surface a clue, discovery, or reward the DM can point to during ${title}.`,
        `Show how pressure escalates while the party lingers, backtracks, or pushes deeper in ${title}.`,
        `Show what changes if the party delays, fails, or presses deeper during ${title}.`,
      );
      break;
    case 'social':
      beats.push(
        `Establish what the NPC or faction wants right now in ${title}.`,
        `Reveal one useful truth and one withheld truth or pressure point in ${title}.`,
        `Show what leverage, offer, or proof shifts the conversation inside ${title}.`,
        `Show how attitude, leverage, or consequences shift once the party pushes ${title}.`,
      );
      break;
    case 'transition':
      beats.push(
        `Reposition the party and clarify the next immediate objective in ${title}.`,
        `Flag the most important resource, clue, or threat that carries forward from ${title}.`,
      );
      break;
    case 'narrative':
      beats.push(
        `Show the first sensory impression and immediate pressure in ${title}.`,
        `Give the DM at least one actionable obstacle, countdown, or risk inside ${title}.`,
        `Give the DM a clue, reveal, or actionable lead inside ${title}.`,
        `Show how NPCs, factions, or the environment react while ${title} is in motion.`,
        `End ${title} with a clear consequence, escalation, or choice that pushes the chapter forward.`,
      );
      break;
  }

  return uniqueStrings(beats).filter(Boolean);
}

function ensureDetailedKeyBeats(
  keyBeats: string[],
  contentType: SectionSpec['contentType'],
  title: string,
  summarySeed: string,
): string[] {
  const supplemented = [...keyBeats];
  for (const fallback of fallbackKeyBeats(contentType, title, summarySeed)) {
    if (supplemented.length >= minimumKeyBeatCount(contentType)) break;
    if (!supplemented.includes(fallback)) supplemented.push(fallback);
  }
  return supplemented.slice(0, Math.max(minimumKeyBeatCount(contentType), supplemented.length));
}

function minimumKeyBeatCount(contentType: SectionSpec['contentType']): number {
  switch (contentType) {
    case 'transition':
      return 3;
    case 'social':
      return 5;
    case 'narrative':
    case 'encounter':
    case 'exploration':
      return 6;
  }
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
