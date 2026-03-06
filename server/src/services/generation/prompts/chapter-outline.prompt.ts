import type { BibleContent } from '@dnd-booker/shared';

export function buildChapterOutlineSystemPrompt(): string {
  return `You are a D&D content architect. You create detailed chapter outlines from a campaign bible. The outline defines the exact structure that prose writers will follow.

You MUST respond with ONLY a JSON object (no markdown fences, no commentary). The JSON must match this schema:

{
  "chapters": [
    {
      "slug": "chapter-1-the-village",
      "title": "Chapter 1: The Village",
      "act": 1,
      "sortOrder": 1,
      "levelRange": { "min": 1, "max": 3 },
      "targetPages": 12,
      "summary": "2-3 sentences describing this chapter's role in the adventure",
      "keyEntities": ["elder-mara", "millbrook-village"],
      "sections": [
        {
          "slug": "arrival-at-the-village",
          "title": "Arrival at the Village",
          "sortOrder": 1,
          "targetPages": 3,
          "contentType": "narrative | encounter | exploration | social | transition",
          "summary": "1-2 sentences about this section"
        }
      ]
    }
  ],
  "appendices": [
    {
      "slug": "appendix-a-npcs",
      "title": "Appendix A: NPCs",
      "targetPages": 4,
      "sourceEntityTypes": ["npc"],
      "summary": "Compiled NPC roster with stat blocks"
    }
  ],
  "totalPageEstimate": 120
}

Rules:
- Chapter slugs must match the bible's pageBudget slugs where they exist
- Section page targets within a chapter must sum to the chapter's targetPages
- Total page estimate must be within 10% of the bible's target
- Every entity referenced in keyEntities must exist in the bible's entities
- Content types: narrative (story/description), encounter (combat), exploration (dungeon/hex), social (roleplay/dialogue), transition (travel/summary)
- Each chapter needs 2-6 sections
- Appendices: include NPC appendix if 4+ NPCs, item appendix if 3+ items, monster appendix if encounters exist
- Sort order must be sequential starting from 1
- One-shots: 2-5 chapters, 0-1 appendices
- Modules: 4-8 chapters, 1-2 appendices
- Campaigns: 8-15 chapters, 2-4 appendices
- Sourcebooks: 10-20 chapters, 3-6 appendices`;
}

export function buildChapterOutlineUserPrompt(bible: BibleContent): string {
  const parts = [
    `Title: "${bible.title}"`,
    `Premise: ${bible.premise}`,
    `Total target pages: ${bible.pageBudget.reduce((sum, ch) => sum + ch.targetPages, 0)}`,
    '',
    'Act Structure:',
    ...bible.actStructure.map(a =>
      `  Act ${a.act}: "${a.title}" — ${a.summary} (levels ${a.levelRange.min}-${a.levelRange.max}, chapters: ${a.chapterSlugs.join(', ')})`
    ),
    '',
    'Page Budget from Bible:',
    ...bible.pageBudget.map(ch =>
      `  ${ch.slug}: "${ch.title}" — ${ch.targetPages} pages, sections: [${ch.sections.join(', ')}]`
    ),
    '',
    'Entities:',
    ...bible.entities.map(e =>
      `  [${e.entityType}] ${e.name} (${e.slug}): ${e.summary}`
    ),
    '',
    `Style: ${bible.styleGuide.voice}`,
    `Open threads: ${bible.openThreads.join(', ') || 'none'}`,
  ];

  return parts.join('\n');
}
