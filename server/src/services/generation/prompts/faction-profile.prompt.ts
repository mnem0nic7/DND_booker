import type { BibleContent, BibleEntitySeed } from '@dnd-booker/shared';

export function buildFactionProfileSystemPrompt(): string {
  return `You are a D&D world builder. You expand a brief faction seed into a detailed organizational profile used throughout adventure writing.

You MUST respond with ONLY a JSON object (no markdown fences, no commentary). The JSON must match this exact schema:

{
  "slug": "kebab-case-slug",
  "name": "Faction Name",
  "purpose": "What this faction exists to do",
  "alignment": "Faction's general alignment tendency",
  "description": "3-5 sentence overview of the faction",
  "leader": { "name": "Leader Name", "slug": "leader-slug", "title": "Their title" },
  "hierarchy": [{ "rank": "Rank title", "description": "Role and responsibilities" }],
  "goals": ["What the faction is trying to achieve"],
  "resources": ["Assets, manpower, or capabilities"],
  "relationships": [{ "factionName": "Other faction or group", "nature": "allied/hostile/neutral/etc." }],
  "plotHooks": ["How PCs might interact with or be drawn into this faction"],
  "headquarters": "Where the faction is based"
}

Rules:
- Leader slug should reference an existing NPC entity slug if possible
- Goals should connect to the campaign premise
- Include at least 2 hierarchy ranks
- Plot hooks should be actionable by the DM
- Relationships should reference other factions or key NPCs`;
}

export function buildFactionProfileUserPrompt(
  entity: BibleEntitySeed,
  bible: BibleContent,
): string {
  const parts = [
    `Faction to expand: "${entity.name}" (slug: ${entity.slug})`,
    `Summary: ${entity.summary}`,
    `Seed details: ${JSON.stringify(entity.details)}`,
    '',
    `Campaign context:`,
    `- Setting: ${bible.worldRules.setting}`,
    `- Tone: ${bible.worldRules.toneDescriptors.join(', ')}`,
    `- Premise: ${bible.premise}`,
  ];

  const npcs = bible.entities
    .filter((e) => e.entityType === 'npc')
    .map((e) => `  - ${e.name} (${e.slug}): ${e.summary}`);
  if (npcs.length > 0) {
    parts.push('', 'NPCs in this campaign:', ...npcs);
  }

  const factions = bible.entities
    .filter((e) => e.entityType === 'faction' && e.slug !== entity.slug)
    .map((e) => `  - ${e.name} (${e.slug}): ${e.summary}`);
  if (factions.length > 0) {
    parts.push('', 'Other factions:', ...factions);
  }

  return parts.join('\n');
}
