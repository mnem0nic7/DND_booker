import type { BibleContent, BibleEntitySeed } from '@dnd-booker/shared';

export function buildEncounterBundleSystemPrompt(): string {
  return `You are a D&D encounter designer. You expand a brief quest or encounter seed into a full tactical encounter reference.

You MUST respond with ONLY a JSON object (no markdown fences, no commentary). The JSON must match this exact schema:

{
  "slug": "kebab-case-slug",
  "name": "Encounter Name",
  "description": "2-3 sentence overview of the encounter",
  "difficulty": "easy | medium | hard | deadly",
  "suggestedLevel": { "min": 3, "max": 5 },
  "setup": "How the DM should set the scene and what triggers the encounter",
  "enemies": [
    { "name": "Monster name", "count": 2, "cr": "1/2", "tactics": "How they fight" }
  ],
  "environment": {
    "terrain": "Terrain description",
    "lighting": "bright | dim | dark",
    "features": ["environmental feature that affects combat"]
  },
  "complications": ["mid-combat twist or complication"],
  "rewards": [{ "name": "Reward name", "description": "What players get" }],
  "scalingNotes": "How to adjust for different party sizes or levels"
}

Rules:
- CR totals should roughly match the stated difficulty for the suggested level range
- Tactics should be specific and actionable
- Include at least one environmental feature that affects gameplay
- Complications should make the encounter more interesting, not just harder
- Scaling notes should cover both weaker and stronger parties`;
}

export function buildEncounterBundleUserPrompt(
  entity: BibleEntitySeed,
  bible: BibleContent,
): string {
  const parts = [
    `Encounter/quest to expand: "${entity.name}" (slug: ${entity.slug})`,
    `Summary: ${entity.summary}`,
    `Seed details: ${JSON.stringify(entity.details)}`,
    '',
    `Campaign context:`,
    `- Setting: ${bible.worldRules.setting}`,
    `- Magic level: ${bible.worldRules.magicLevel}`,
    `- Tone: ${bible.worldRules.toneDescriptors.join(', ')}`,
  ];

  if (bible.actStructure.length > 0) {
    const levelRange = bible.actStructure[0].levelRange;
    const maxRange = bible.actStructure[bible.actStructure.length - 1].levelRange;
    parts.push(`- Campaign level range: ${levelRange.min}\u2013${maxRange.max}`);
  }

  return parts.join('\n');
}
