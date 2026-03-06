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
    `Act: ${chapter.act} | Level range: ${chapter.levelRange.min}\u2013${chapter.levelRange.max}`,
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
