import type { BibleContent, BibleEntitySeed } from '@dnd-booker/shared';

export function buildItemBundleSystemPrompt(): string {
  return `You are a D&D item designer. You expand a brief item seed into a detailed magic item or treasure reference.

You MUST respond with ONLY a JSON object (no markdown fences, no commentary). The JSON must match this exact schema:

{
  "slug": "kebab-case-slug",
  "name": "Item Name",
  "itemType": "weapon | armor | wondrous | potion | scroll | ring | rod | staff | wand",
  "rarity": "common | uncommon | rare | very rare | legendary | artifact",
  "description": "2-3 sentence physical description",
  "mechanics": "Full mechanical description (damage, bonuses, effects, charges, etc.)",
  "attunement": true,
  "properties": ["mechanical property or tag"],
  "lore": "2-3 sentence history and significance",
  "history": "How this item came to be in its current location",
  "quirks": ["unusual behavior or cosmetic effect"]
}

Rules:
- Mechanics must be 5e-legal and balanced for the stated rarity
- Properties should use standard 5e item properties where applicable
- Lore should connect to the campaign setting
- Include at least one quirk to make the item memorable
- Attunement requirements should match 5e conventions for the item type`;
}

export function buildItemBundleUserPrompt(
  entity: BibleEntitySeed,
  bible: BibleContent,
): string {
  const parts = [
    `Item to expand: "${entity.name}" (slug: ${entity.slug})`,
    `Summary: ${entity.summary}`,
    `Seed details: ${JSON.stringify(entity.details)}`,
    '',
    `Campaign context:`,
    `- Setting: ${bible.worldRules.setting}`,
    `- Magic level: ${bible.worldRules.magicLevel}`,
    `- Technology level: ${bible.worldRules.technologyLevel}`,
    `- Tone: ${bible.worldRules.toneDescriptors.join(', ')}`,
  ];

  return parts.join('\n');
}
