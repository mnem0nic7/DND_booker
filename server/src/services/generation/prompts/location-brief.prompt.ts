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
