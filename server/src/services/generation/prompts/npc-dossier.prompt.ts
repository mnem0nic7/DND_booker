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
