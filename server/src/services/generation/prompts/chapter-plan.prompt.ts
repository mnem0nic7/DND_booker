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
      "scenePurpose": "Why this section exists in play and what job it does for the DM",
      "playerObjective": "What the players are trying to accomplish or learn here",
      "decisionPoint": "The most important choice or pressure point in this section",
      "consequenceSummary": "What changes if the party succeeds, fails, bargains, retreats, or escalates",
      "keyBeats": ["PCs arrive via the forest road", "First signs of goblin damage"],
      "entityReferences": ["millbrook-village", "elder-mara"],
      "blocksNeeded": ["readAloud", "dmTips", "handout"]
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
- handout: player-facing letter, clue sheet, inscription, or prop text

Rules:
- targetWords per section: narrative 600-1200, encounter 800-1500, exploration 600-1000, social 400-800, transition 200-400
- Every encounter section MUST have a matching encounter spec
- Every non-transition section MUST include scenePurpose, playerObjective, decisionPoint, and consequenceSummary
- Every non-transition section MUST include at least one reusable DM utility block in blocksNeeded
- Narrative sections should usually include readAloud plus dmTips or handout
- Encounter sections MUST include encounterTable and usually statBlock
- Exploration sections MUST include randomTable or handout
- Social sections MUST include npcProfile or dmTips
- Across the chapter, aim for at least one reference-heavy block (statBlock, encounterTable, npcProfile, magicItem, spellCard, randomTable, handout) for every 2 non-transition sections
- entityReferences must use slugs from the campaign bible
- readAloudCount: 1-2 per narrative section, 1 per encounter
- dmTipCount: 1-2 per chapter
- Difficulty should escalate within the chapter and across the adventure
- Optimize for table usability, not fiction recital. The plan should give a DM actionable scenes, not just plot summary.`;
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
    'Planning priority: make this chapter table-ready for a DM. Prefer scene goals, choices, consequences, and reusable utility blocks over long prose summary.',
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
