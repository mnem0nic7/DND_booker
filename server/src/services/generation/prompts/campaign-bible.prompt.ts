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
    parts.push(`Level range: ${input.levelRange.min}\u2013${input.levelRange.max}`);
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
