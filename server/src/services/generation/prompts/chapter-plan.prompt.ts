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
      "contentType": "narrative",
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
- contentType must be ONE value only: narrative, encounter, exploration, social, or transition. Never return a pipe-delimited list.
- Every non-transition section MUST include scenePurpose, playerObjective, decisionPoint, and consequenceSummary
- Every non-transition section MUST include at least two reusable DM utility blocks in blocksNeeded
- Narrative sections should include readAloud plus dmTips and usually handout
- Encounter sections MUST include encounterTable, statBlock, and dmTips for setup, terrain, tactics, rewards, and aftermath
- Exploration sections MUST include randomTable, encounterTable, or handout, and should usually include at least two of them
- Social sections MUST include npcProfile and dmTips, and should usually open with a short read-aloud setup
- Across the chapter, aim for at least one reference-heavy block (statBlock, encounterTable, npcProfile, magicItem, spellCard, randomTable, handout) in every non-transition section
- Encounter sections should plan a single runnable encounter packet: trigger, opposition, terrain, tactics, consequences, and payoff all need a home in the draft
- Social sections should plan for NPC leverage: what the NPC wants, what they know, what persuades them, and how they react under pressure
- Exploration sections that include random encounters must make those encounters runnable. Random table entries should not be nouns only; they should capture the immediate situation, active threat or opportunity, and clue, reward, or consequence
- entityReferences must use slugs from the campaign bible
- readAloudCount: 1-2 per narrative section, 1 per encounter
- dmTipCount: 1-2 per chapter
- Difficulty should escalate within the chapter and across the adventure
- Optimize for table usability, not fiction recital. The plan should give a DM actionable scenes, not just plot summary.
- Exploration and confrontation chapters like "Into the Mine" or "Secrets Beneath" must surface route choices, hazards, clues, rewards, and consequence summaries as reusable utility blocks, not buried prose.`;
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
    'Planning priority: make this chapter table-ready for a DM. Prefer scene goals, choices, consequences, checks, hazards, rewards, and reusable utility blocks over long prose summary.',
    'If you plan random encounters, make each one runnable: situation, threat or opportunity, and payoff must all be visible in the plan and draft.',
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
